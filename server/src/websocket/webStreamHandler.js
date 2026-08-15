import { initSession, sendGreeting, processUserInput, endSession } from './sessionPipeline.js';

/**
 * Handles Web Audio simulator WebSocket connections from the dashboard
 */
export async function handleWebStream(ws, sessions) {
  const sessionId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  console.log(`[Web] New browser session: ${sessionId}`);

  await initSession(sessionId, { source: 'web', ws }, sessions);
  await sendGreeting(sessionId, sessions);

  ws.on('message', async (message) => {
    try {
      if (typeof message === 'string' || (message instanceof Buffer && message[0] === 0x7B)) {
        const msg = JSON.parse(message.toString());

        if (msg.type === 'audio') {
          const session = sessions.get(sessionId);
          if (session?.sttStream) {
            const pcmAudio = Buffer.from(msg.data, 'base64');
            if (session.audioChunks.length < 5000) {
              session.audioChunks.push(pcmAudio);
            }
            session.sttStream.write(pcmAudio);
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
