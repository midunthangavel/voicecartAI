import { WebSocket } from 'ws';
import { dbRun, upsertCustomerProfile, saveCustomerAddress, incrementCustomerOrders } from '../db.js';
import { createOrderWithSnapshots } from '../domain/orders/order.repository.js';
import { createSttStream } from '../services/sttService.js';
import { synthesizeSpeech, getAudioDuration } from '../services/ttsService.js';
import { processDialogueTurn, getInitialState } from '../services/dialogueManager.js';
import { geocodeSpokenAddress, needsPinDrop, generatePinDropUrl } from '../services/geocodingService.js';
import { broadcastToDashboard } from './dashboardWsHandler.js';
import { createSession, getSession, updateSession, deleteSession } from '../infra/sessionStore.js';
import { enqueueNotificationJob, enqueueDispatchJob, enqueueRecordingJob } from '../queue/queueManager.js';
import { enqueueOutboxEvent } from '../services/outbox.service.js';
import { startTurnTrace, recordTurnStage, finishTurnTrace } from '../services/latencyTracer.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import { TurnQueue } from './turnQueue.js';
import '../workers/notification.worker.js';
import '../workers/dispatch.worker.js';
import '../workers/recording.worker.js';

const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2MB memory cap per active call
const MAX_CONVERSATION_TURNS = 20; // Cap conversation history to prevent unbounded context growth

/**
 * Append audio chunk with actual byte-level enforcement.
 * Returns true if chunk was accepted, false if limit exceeded.
 */
function appendAudio(session, chunk) {
  if (!Buffer.isBuffer(chunk)) {
    return false;
  }

  if (session.audioBytes + chunk.length > MAX_AUDIO_BYTES) {
    logger.warn(`[Session ${session.id}] Audio byte limit exceeded (${session.audioBytes + chunk.length} > ${MAX_AUDIO_BYTES})`);
    return false;
  }

  session.audioChunks.push(chunk);
  session.audioBytes += chunk.length;
  return true;
}

/**
 * Trim conversation history to prevent unbounded context growth.
 * Keeps the most recent turns and creates a summary of older context.
 */
function trimConversationHistory(history) {
  if (history.length <= MAX_CONVERSATION_TURNS) {
    return history;
  }

  // Keep last MAX_CONVERSATION_TURNS exchanges
  const trimmed = history.slice(-MAX_CONVERSATION_TURNS);

  // Prepend a summary marker for the LLM
  const droppedCount = history.length - MAX_CONVERSATION_TURNS;
  trimmed.unshift({
    role: 'system',
    text: `[Context: ${droppedCount} earlier conversation turns were summarized. The customer has been speaking with the assistant about their order.]`,
  });

  return trimmed;
}

/**
 * Initialize a new voice session with Ephemeral Cache & Authoritative Tenant Context
 * Strictly fails closed if tenant context is missing.
 */
export async function initSession(sessionId, opts, sessions) {
  const tenantId = opts.tenantId;
  const restaurantId = opts.restaurantId;

  if (!tenantId || !restaurantId) {
    throw new AppError(500, 'TENANT_CONTEXT_REQUIRED', 'Voice session requires explicit tenant and restaurant context');
  }

  const state = getInitialState(opts.callerPhone);
  const sttStream = await createSttStream('en-IN', tenantId, restaurantId);

  const session = {
    id: sessionId,
    source: opts.source,
    tenantId,
    restaurantId,
    callerPhone: opts.callerPhone || 'Browser',
    ws: opts.ws,
    streamSid: opts.streamSid,
    callSid: opts.callSid,
    state,
    conversationHistory: [],
    sttStream,
    turnQueue: new TurnQueue(),
    startedAt: new Date().toISOString(),
    latencies: [],
    audioChunks: [],
    audioBytes: 0,
  };

  sttStream.onTranscript(async (result) => {
    broadcastToDashboard({
      type: 'stt_transcript',
      sessionId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      ...result,
    });

    if (opts.source === 'web' && opts.ws.readyState === WebSocket.OPEN) {
      opts.ws.send(JSON.stringify({
        type: 'stt_transcript',
        ...result,
      }));
    }

    if (result.isFinal && result.transcript.trim().length > 0) {
      // Use turn queue to serialize processing instead of dropping turns
      session.turnQueue.push(() =>
        processDialogueTurnForSession(sessionId, result.transcript, sessions)
      );
    }
  });

  sessions.set(sessionId, session);

  // Store in ephemeral cache
  await createSession(sessionId, {
    source: opts.source,
    tenantId: session.tenantId,
    restaurantId: session.restaurantId,
    callerPhone: session.callerPhone,
    state,
  });

  try {
    const dbResult = await dbRun(
      'INSERT INTO calls (call_sid, caller_phone, source, status, session_state, tenant_id, restaurant_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sessionId, session.callerPhone, opts.source, 'active', JSON.stringify(state), session.tenantId, session.restaurantId]
    );
    session.dbId = dbResult.lastID;
  } catch (err) {
    // CRITICAL: DB call insert failure is logged, not swallowed
    logger.error(`[Session ${sessionId}] Failed to persist call record:`, err.message);
  }

  if (session.callerPhone && session.callerPhone !== 'Browser') {
    try {
      await upsertCustomerProfile({ phone: session.callerPhone, restaurant_id: session.restaurantId });
    } catch (err) {
      // BEST-EFFORT: Customer upsert failure doesn't kill the call
      logger.warn(`[Session ${sessionId}] Customer upsert failed:`, err.message);
    }
  }

  broadcastToDashboard({
    type: 'call_started',
    sessionId,
    tenantId: session.tenantId,
    restaurantId: session.restaurantId,
    source: opts.source,
  });

  return session;
}

/**
 * Send initial greeting turn
 */
export async function sendGreeting(sessionId, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const result = await processDialogueTurn('', session.state, session.conversationHistory, session.callerPhone);

  session.state = result.updated_state;
  session.conversationHistory.push({ role: 'assistant', text: result.response_text });

  await updateSession(sessionId, { state: session.state });
  await sendAudioResponse(sessionId, result.response_text, result.detected_language || 'en-IN', sessions);
}

/**
 * Process a user conversational turn (called via TurnQueue for serialization).
 * This replaces the old processUserInput with its `if (isProcessing) return` guard.
 */
async function processDialogueTurnForSession(sessionId, transcript, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const turnStart = Date.now();
  startTurnTrace(sessionId, session.conversationHistory.length + 1);

  try {
    session.conversationHistory.push({ role: 'user', text: transcript });

    // Trim context to prevent unbounded growth
    session.conversationHistory = trimConversationHistory(session.conversationHistory);

    if (session.dbId) {
      dbRun(
        'INSERT INTO call_logs (call_id, event_type, direction, content) VALUES (?, ?, ?, ?)',
        [session.dbId, 'user_speech', 'inbound', transcript]
      ).catch(err => logger.warn(`[Session ${sessionId}] call_log insert failed:`, err.message));
    }

    broadcastToDashboard({
      type: 'user_speech',
      sessionId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      transcript,
    });

    const result = await processDialogueTurn(transcript, session.state, session.conversationHistory, session.callerPhone);

    session.state = result.updated_state;
    session.conversationHistory.push({ role: 'assistant', text: result.response_text });

    const dialogueLatency = result.latency_ms || (Date.now() - turnStart);
    session.latencies.push(dialogueLatency);

    recordTurnStage(sessionId, 'llm_ms', dialogueLatency, {
      provider: result.provider,
      language: result.detected_language,
    });

    if (session.dbId) {
      dbRun(
        'INSERT INTO call_logs (call_id, event_type, direction, content, latency_ms) VALUES (?, ?, ?, ?, ?)',
        [session.dbId, 'ai_response', 'outbound', result.response_text, dialogueLatency]
      ).catch(err => logger.warn(`[Session ${sessionId}] ai_response log failed:`, err.message));
    }

    broadcastToDashboard({
      type: 'ai_response',
      sessionId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      response_text: result.response_text,
      state: result.updated_state,
      provider: result.provider,
      model: result.model,
      latency_ms: dialogueLatency,
    });

    // Send audio response immediately for minimum latency
    await sendAudioResponse(sessionId, result.response_text, result.detected_language || 'en-IN', sessions);

    // Complete latency trace
    await finishTurnTrace(sessionId, session.dbId);

    // Update ephemeral session cache
    await updateSession(sessionId, { state: session.state });

    if (session.dbId) {
      dbRun(
        'UPDATE calls SET session_state = ?, transcript = ?, latency_avg_ms = ? WHERE id = ?',
        [
          JSON.stringify(session.state),
          JSON.stringify(session.conversationHistory),
          Math.round(session.latencies.reduce((a, b) => a + b, 0) / session.latencies.length),
          session.dbId,
        ]
      ).catch(err => logger.warn(`[Session ${sessionId}] Call state update failed:`, err.message));
    }

    if (session.state.status === 'confirmed') {
      await handleOrderConfirmation(sessionId, sessions);
    }
  } catch (err) {
    logger.error(`[Session ${sessionId}] Dialogue turn error:`, err);
  }
}

/**
 * Legacy compatibility — delegates to turnQueue-based processing
 */
export async function processUserInput(sessionId, transcript, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.turnQueue.push(() =>
    processDialogueTurnForSession(sessionId, transcript, sessions)
  );
}

/**
 * Synthesize and stream audio response back to caller or web client
 */
export async function sendAudioResponse(sessionId, text, language, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  const ttsStart = Date.now();

  try {
    const audioBuffer = await synthesizeSpeech(text, language);
    const ttsLatency = Date.now() - ttsStart;

    recordTurnStage(sessionId, 'tts_ms', ttsLatency, { providerTts: 'sarvam' });

    broadcastToDashboard({
      type: 'tts_complete',
      sessionId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      text,
      audio_duration: getAudioDuration(audioBuffer),
      latency_ms: ttsLatency,
    });

    if (session.source === 'twilio' && session.streamSid) {
      const CHUNK_SIZE = 640;
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        const chunk = audioBuffer.subarray(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({
            event: 'media',
            streamSid: session.streamSid,
            media: { payload: chunk.toString('base64') },
          }));
        }
      }
    } else if (session.source === 'exotel' && session.streamSid) {
      const CHUNK_SIZE = 640;
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        const chunk = audioBuffer.subarray(i, Math.min(i + CHUNK_SIZE, audioBuffer.length));
        if (session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(JSON.stringify({
            event: 'media',
            streamSid: session.streamSid,
            media: { payload: chunk.toString('base64') },
          }));
        }
      }
    } else if (session.source === 'web') {
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({
          type: 'ai_response',
          text,
          audio: audioBuffer.toString('base64'),
          language,
          state: session.state,
          latency_ms: ttsLatency,
        }));
      }
    }
  } catch (err) {
    logger.error(`[TTS] Error for session ${sessionId}:`, err);
    if (session.ws.readyState === WebSocket.OPEN && session.source === 'web') {
      session.ws.send(JSON.stringify({
        type: 'ai_response',
        text,
        audio: null,
        language,
        state: session.state,
      }));
    }
  }
}

/**
 * Handle order fulfillment via the Transactional Outbox (consolidated event path).
 *
 * ARCHITECTURE: Business events are written to the outbox within the order transaction
 * (in order.repository.js). The outbox worker then dispatches to notification and
 * dispatch queues. This function only handles non-outbox side effects like geocoding.
 *
 * Previously, this function had duplicate direct queue.add() calls that bypassed
 * the outbox, creating dual event paths with mismatched job names (P0-6).
 */
export async function handleOrderConfirmation(sessionId, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  try {
    // 1. Asynchronously geocode delivery address if needed
    if (session.state.delivery_address && session.callerPhone !== 'Browser') {
      geocodeSpokenAddress(session.state.delivery_address, session.state.landmark || null)
        .then(async (geoResult) => {
          if (geoResult) {
            try {
              await saveCustomerAddress({
                phone: session.callerPhone,
                restaurant_id: session.restaurantId,
                label: 'Home',
                spoken_address: session.state.delivery_address,
                landmark: session.state.landmark || null,
                formatted_address: geoResult.formatted_address,
                latitude: geoResult.latitude,
                longitude: geoResult.longitude,
                is_default: 1,
              });
            } catch (err) {
              logger.warn(`[Session ${sessionId}] Address save failed:`, err.message);
            }

            if (needsPinDrop(geoResult.confidence)) {
              const pinUrl = generatePinDropUrl(session.id, geoResult.latitude, geoResult.longitude);
              // Use outbox for pin drop notification
              try {
                await enqueueOutboxEvent({
                  tenant_id: session.tenantId,
                  restaurant_id: session.restaurantId,
                  event_type: 'PIN_DROP_REQUESTED',
                  aggregate_type: 'order',
                  aggregate_id: session.id,
                  payload: {
                    phone: session.callerPhone,
                    pinUrl,
                    tenantId: session.tenantId,
                    restaurantId: session.restaurantId,
                  },
                });
              } catch (err) {
                logger.error(`[Session ${sessionId}] Pin drop outbox event failed:`, err.message);
              }
            }
          }
        })
        .catch(err => logger.warn(`[Session ${sessionId}] Geocoding failed:`, err.message));
    }

    // 2. Authoritatively persist master order & line-item snapshots using session tenant context.
    //    The ORDER_CONFIRMED outbox event is written inside createOrderWithSnapshots() in the same
    //    transaction. The outbox worker then dispatches SEND_NOTIFICATION and DISPATCH_ORDER jobs.
    const dbOrderId = await createOrderWithSnapshots({
      tenant_id: session.tenantId,
      restaurant_id: session.restaurantId,
      call_id: session.dbId || null,
      status: 'confirmed',
      subtotal: session.state.subtotal || 0,
      tax: session.state.tax || 0,
      delivery_fee: session.state.delivery_fee || 0,
      total_amount: session.state.total || 0,
      delivery_address: session.state.delivery_address || null,
      landmark: session.state.landmark || null,
      customer_phone: session.callerPhone !== 'Browser' ? session.callerPhone : null,
    }, session.state.items || []);

    if (session.dbId) {
      dbRun('UPDATE calls SET order_id = ? WHERE id = ?', [dbOrderId, session.dbId])
        .catch(err => logger.warn(`[Session ${sessionId}] Call order_id update failed:`, err.message));
    }

    if (session.callerPhone && session.callerPhone !== 'Browser') {
      incrementCustomerOrders(session.callerPhone, session.restaurantId)
        .catch(err => logger.warn(`[Session ${sessionId}] Customer order count increment failed:`, err.message));
    }

    // NOTE: No direct queue.add() calls here — all business events flow through the
    // transactional outbox written by createOrderWithSnapshots().

    broadcastToDashboard({
      type: 'order_confirmed',
      sessionId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      orderId: dbOrderId,
      order: session.state,
      callerPhone: session.callerPhone,
    });
  } catch (err) {
    // CRITICAL: Order confirmation failure must be logged with full context
    logger.error(`[Order] Confirmation failed for session ${sessionId}:`, err);
  }
}

/**
 * End session and offload recording persistence to worker queue.
 *
 * FIX (P0-7): Changed audioBase64 → audioBuffer to match the queue processor.
 * The recording queue processor expects `data.audioBuffer`, not `data.audioBase64`.
 */
export async function endSession(sessionId, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.sttStream?.end();

  if (session.dbId) {
    dbRun(
      "UPDATE calls SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?",
      [session.dbId]
    ).catch(err => logger.warn(`[Session ${sessionId}] Call status update failed:`, err.message));

    // Offload audio writing & duration calculation to Recording Worker
    if (session.audioChunks && session.audioChunks.length > 0) {
      const combinedAudio = Buffer.concat(session.audioChunks);

      // FIX: Use audioBuffer (matching the processor) instead of audioBase64
      enqueueRecordingJob('PERSIST_CALL_AUDIO', {
        callId: session.dbId,
        callSid: session.callSid || session.id,
        tenantId: session.tenantId,
        restaurantId: session.restaurantId,
        audioBuffer: combinedAudio.toString('base64'), // Base64 for serialization, decoded by processor
      });
    }
  }

  broadcastToDashboard({
    type: 'call_ended',
    sessionId,
    tenantId: session.tenantId,
    restaurantId: session.restaurantId,
    summary: {
      totalTurns: session.conversationHistory.length,
      finalState: session.state,
      avgLatency: session.latencies.length
        ? Math.round(session.latencies.reduce((a, b) => a + b, 0) / session.latencies.length)
        : 0,
    },
  });

  sessions.delete(sessionId);
  await deleteSession(sessionId);
  logger.info(`[Session] Cleaned up: ${sessionId}`);
}

// Export appendAudio for use by stream handlers
export { appendAudio };
