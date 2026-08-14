import { initSession, sendGreeting, endSession } from './sessionPipeline.js';

/**
 * Exotel AgentStream Bi-Directional WebSocket Handler
 * 
 * Handles live audio streaming between Indian phone callers on Exotel numbers
 * and the VoiceCart AI processing engine.
 */
export function handleExotelStream(ws, req, sessions) {
  let sessionId = null;

  console.log('[ExotelStream] Inbound Exotel WebSocket connection initiated.');

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.event) {
        case 'connected':
          console.log('[ExotelStream] Exotel AgentStream connected.');
          break;

        case 'start': {
          const streamSid = msg.stream_sid || msg.streamSid || msg.start?.streamSid;
          const callSid = msg.call_sid || msg.callSid || msg.start?.callSid || `exotel_${Date.now()}`;
          const callerPhone = msg.from || msg.start?.customParameters?.From || msg.start?.from || 'Unknown Caller';

          sessionId = streamSid || `exotel_${Date.now()}`;
          console.log(`[ExotelStream] Call started: ${callSid}, Caller: ${callerPhone}, Stream: ${streamSid}`);

          await initSession(sessionId, {
            source: 'exotel',
            ws,
            streamSid,
            callSid,
            callerPhone,
          }, sessions);

          await sendGreeting(sessionId, sessions);
          break;
        }

        case 'media': {
          const session = sessions.get(sessionId);
          if (session && msg.media?.payload) {
            const rawChunk = Buffer.from(msg.media.payload, 'base64');
            session.audioChunks.push(rawChunk);
            session.sttStream?.write(rawChunk);
          }
          break;
        }

        case 'stop': {
          console.log(`[ExotelStream] Call stopped: ${sessionId}`);
          await endSession(sessionId, sessions);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[ExotelStream] Message handling error:', err.message);
    }
  });

  ws.on('close', async () => {
    console.log(`[ExotelStream] WebSocket closed for session: ${sessionId}`);
    if (sessionId && sessions.has(sessionId)) {
      await endSession(sessionId, sessions);
    }
  });

  ws.on('error', (err) => {
    console.error(`[ExotelStream] WebSocket error on ${sessionId}:`, err.message);
  });
}
