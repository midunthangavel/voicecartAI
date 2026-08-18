import { initSession, sendGreeting, processUserInput, endSession } from './sessionPipeline.js';
import { transcribeAudioBuffer } from '../services/sttService.js';

/**
 * Handles Web Audio simulator WebSocket connections from the dashboard & mobile app
 */
export async function handleWebStream(ws, sessions) {
  const sessionId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[Web] New browser/mobile session: ${sessionId}`);

  const tenantId = ws.auth?.tenantId || (process.env.NODE_ENV !== 'production' ? 't_annapoorna' : null);
  const restaurantId = ws.auth?.restaurantId || (process.env.NODE_ENV !== 'production' ? 'r_coimbatore_01' : null);

  await initSession(sessionId, {
    source: 'web',
    ws,
    tenantId,
    restaurantId,
  }, sessions);

  await sendGreeting(sessionId, sessions);

  ws.on('message', async (message) => {
    try {
      if (typeof message === 'string' || (message instanceof Buffer && message[0] === 0x7B)) {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'audio') {
          const session = sessions.get(sessionId);
          if (session && msg.data) {
            const audioBuffer = Buffer.from(msg.data, 'base64');
            if (session.audioChunks.length < 5000) {
              session.audioChunks.push(audioBuffer);
            }

            // Transcribe the recorded audio file buffer
            const format = msg.format || 'm4a';
            const language = msg.language || session.state?.language || 'en';
            const result = await transcribeAudioBuffer(audioBuffer, format, language);

            if (result && result.transcript) {
              // Notify client of recognized speech transcript
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({
                  type: 'stt_transcript',
                  transcript: result.transcript,
                  isFinal: true,
                  confidence: result.confidence || 0.95,
                  provider: result.provider,
                }));
              }

              // Process transcript through AI dialogue engine & return spoken response
              await processUserInput(sessionId, result.transcript, sessions);
            }
          }
        } else if (msg.type === 'text') {
          await processUserInput(sessionId, msg.text, sessions);
        } else if (msg.type === 'end') {
          await endSession(sessionId, sessions);
        }
      } else {
        const session = sessions.get(sessionId);
        if (session?.sttStream) {
          if (session.audioChunks.length < 5000) {
            session.audioChunks.push(message);
          }
          session.sttStream.write(message);
        }
      }
    } catch (err) {
      console.error('[Web] Message error:', err.message);
    }
  });

  ws.on('close', async () => {
    console.log(`[Web] Session ended: ${sessionId}`);
    await endSession(sessionId, sessions);
  });
}
