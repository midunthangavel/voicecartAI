import { WebSocket } from 'ws';
import { dbRun, upsertCustomerProfile, saveCustomerAddress, incrementCustomerOrders } from '../db.js';
import { createOrderWithSnapshots } from '../domain/orders/order.repository.js';
import { createSttStream } from '../services/sttService.js';
import { synthesizeSpeech, getAudioDuration } from '../services/ttsService.js';
import { processDialogueTurn, getInitialState } from '../services/dialogueManager.js';
import { geocodeSpokenAddress, needsPinDrop, generatePinDropUrl } from '../services/geocodingService.js';
import { broadcastToDashboard } from './dashboardWsHandler.js';
import { createSession, getSession, updateSession, deleteSession } from '../infra/sessionStore.js';
import { notificationQueue, dispatchQueue, recordingQueue } from '../queue/queueManager.js';
import { startTurnTrace, recordTurnStage, finishTurnTrace } from '../services/latencyTracer.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';
import '../workers/notification.worker.js';
import '../workers/dispatch.worker.js';
import '../workers/recording.worker.js';

const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2MB memory cap per active call

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
  const sttStream = await createSttStream('en-IN');

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
    isProcessing: false,
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
      await processUserInput(sessionId, result.transcript, sessions);
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
    console.error('[Session] DB save error:', err.message);
  }

  if (session.callerPhone && session.callerPhone !== 'Browser') {
    try {
      await upsertCustomerProfile({ phone: session.callerPhone, restaurant_id: session.restaurantId });
    } catch {}
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
 * Process a user conversational turn
 */
export async function processUserInput(sessionId, transcript, sessions) {
  const session = sessions.get(sessionId);
  if (!session || session.isProcessing) return;

  session.isProcessing = true;
  const turnStart = Date.now();
  startTurnTrace(sessionId, session.conversationHistory.length + 1);

  try {
    session.conversationHistory.push({ role: 'user', text: transcript });

    if (session.dbId) {
      dbRun(
        'INSERT INTO call_logs (call_id, event_type, direction, content) VALUES (?, ?, ?, ?)',
        [session.dbId, 'user_speech', 'inbound', transcript]
      ).catch(() => {});
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
      ).catch(() => {});
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
      ).catch(() => {});
    }

    if (session.state.status === 'confirmed') {
      await handleOrderConfirmation(sessionId, sessions);
    }
  } catch (err) {
    logger.error(`[Session ${sessionId}] Process error:`, err);
  } finally {
    session.isProcessing = false;
  }
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
 * Handle order fulfillment, ONDC/POS dispatch, payments, and messaging asynchronously
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

            if (needsPinDrop(geoResult.confidence)) {
              const pinUrl = generatePinDropUrl(session.id, geoResult.latitude, geoResult.longitude);
              notificationQueue.add('SEND_PINDROP_WHATSAPP', {
                tenantId: session.tenantId,
                restaurantId: session.restaurantId,
                phone: session.callerPhone,
                pinUrl,
              });
            }
          }
        })
        .catch(() => {});
    }

    // 2. Authoritatively persist master order & line-item snapshots using session tenant context
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
    }, session.state.items || []);

    if (session.dbId) {
      dbRun('UPDATE calls SET order_id = ? WHERE id = ?', [dbOrderId, session.dbId]).catch(() => {});
    }

    if (session.callerPhone && session.callerPhone !== 'Browser') {
      incrementCustomerOrders(session.callerPhone, session.restaurantId).catch(() => {});
    }

    // 3. Offload Dispatch to Asynchronous Dispatch Worker
    dispatchQueue.add('DISPATCH_KITCHEN_ORDER', {
      orderId: dbOrderId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      state: session.state,
      callerPhone: session.callerPhone,
    });

    // 4. Offload SMS & WhatsApp Notifications to Asynchronous Notification Worker
    notificationQueue.add('SEND_ORDER_RECEIPT_WHATSAPP', {
      orderId: dbOrderId,
      tenantId: session.tenantId,
      restaurantId: session.restaurantId,
      total: session.state.total,
      phone: session.callerPhone,
      items: session.state.items,
      deliveryAddress: session.state.delivery_address,
    });

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
    console.error(`[Order] Confirmation error for session ${sessionId}:`, err);
  }
}

/**
 * End session and offload dispute recording persistence to worker queue
 */
export async function endSession(sessionId, sessions) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.sttStream?.end();

  if (session.dbId) {
    dbRun(
      "UPDATE calls SET status = 'completed', ended_at = CURRENT_TIMESTAMP WHERE id = ?",
      [session.dbId]
    ).catch(() => {});

    // Offload audio writing & duration calculation to Recording Worker
    if (session.audioChunks && session.audioChunks.length > 0) {
      const combinedAudioBase64 = Buffer.concat(session.audioChunks).toString('base64');
      recordingQueue.add('PERSIST_CALL_AUDIO', {
        callId: session.dbId,
        callSid: session.callSid || session.id,
        tenantId: session.tenantId,
        restaurantId: session.restaurantId,
        audioBase64: combinedAudioBase64,
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
  console.log(`[Session] Cleaned up: ${sessionId}`);
}
