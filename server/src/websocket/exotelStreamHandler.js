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
            tenantId: ws.streamMeta?.tenantId || 't_annapoorna',
            restaurantId: ws.streamMeta?.restaurantId || 'r_coimbatore_01',
          }, sessions);

          await sendGreeting(sessionId, sessions);
          break;
        }

        case 'media': {
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            const rawAudio = msg.media?.payload || msg.payload;
            if (rawAudio && session.sttStream) {
              const audioBuffer = Buffer.from(rawAudio, 'base64');
              if (session.audioChunks.length < 5000) {
                session.audioChunks.push(audioBuffer);
              }
              session.sttStream.write(audioBuffer);
            }
          }
          break;
        }

        case 'stop': {
          console.log(`[ExotelStream] Call stopped: ${sessionId}`);
          if (sessionId && sessions.has(sessionId)) {
            await endSession(sessionId, sessions);
          }
          break;
        }
      }
    } catch (err) {
      console.error('[ExotelStream] Error processing message:', err.message);
    }
  });

  ws.on('close', async () => {
    console.log(`[ExotelStream] Connection closed: ${sessionId}`);
    if (sessionId && sessions.has(sessionId)) {
      await endSession(sessionId, sessions);
    }
  });
}
