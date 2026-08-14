import { mulawToPcm16 } from '../utils/audioUtils.js';
import { initSession, sendGreeting, endSession } from './sessionPipeline.js';

/**
 * Handles incoming Twilio PSTN media stream WebSocket connections
 */
export async function handleTwilioStream(ws, sessions) {
  let streamSid = null;
  let callSid = null;
  let sessionId = null;

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);

      switch (msg.event) {
        case 'connected':
          console.log('[Twilio] Stream connected');
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          callSid = msg.start.callSid;
          sessionId = `twilio_${callSid}`;
          console.log(`[Twilio] Stream started: ${streamSid}, Call: ${callSid}`);

          await initSession(sessionId, {
            source: 'twilio',
            callerPhone: msg.start.customParameters?.callerPhone || 'unknown',
            ws,
            streamSid,
            callSid,
          }, sessions);

          await sendGreeting(sessionId, sessions);
          break;

        case 'media':
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            const audioPayload = Buffer.from(msg.media.payload, 'base64');
            const pcmAudio = mulawToPcm16(audioPayload);
            session.audioChunks.push(pcmAudio);
            session.sttStream?.write(pcmAudio);
          }
          break;

        case 'stop':
          console.log(`[Twilio] Stream stopped: ${streamSid}`);
          await endSession(sessionId, sessions);
          break;
      }
    } catch (err) {
      console.error('[Twilio] Message error:', err.message);
    }
  });

  ws.on('close', async () => {
    console.log('[Twilio] WebSocket closed');
    if (sessionId) await endSession(sessionId, sessions);
  });
}
