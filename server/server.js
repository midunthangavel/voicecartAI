/**
 * VoiceCart AI — Composition Root
 * 
 * As specified in Phase2.pdf (Step 2, Pages 7-8):
 * server.js is a minimal composition root that boots infrastructure,
 * creates the application, mounts WebSocket streams, and binds to the network.
 */

import 'dotenv/config';
import { createServer } from 'http';
import { createApp } from './src/app.js';
import { initDatabase } from './src/db.js';
import { createWebSocketCoordinator } from './src/websocket/wsServer.js';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  console.log('\n======================================================');
  console.log('⚡ VoiceCart AI — Production Server Booting...');
  console.log('======================================================');

  // 1. Initialize SQLite / PostgreSQL Database
  await initDatabase();

  // 2. Create Express Application
  const app = createApp();

  // 3. Create HTTP Server
  const httpServer = createServer(app);

  // 4. Mount WebSocket Coordinator (/media-stream, /web-stream, /dashboard-ws)
  createWebSocketCoordinator(httpServer);

  // 5. Start listening
  httpServer.listen(PORT, HOST, () => {
    console.log(`\n🚀 VoiceCart AI Server is live!`);
    console.log(`   - HTTP REST API:      http://${HOST}:${PORT}/api`);
    console.log(`   - Web Audio Stream:   ws://${HOST}:${PORT}/web-stream`);
    console.log(`   - Twilio Telephony:   ws://${HOST}:${PORT}/media-stream`);
    console.log(`   - Dashboard Stream:   ws://${HOST}:${PORT}/dashboard-ws`);
    console.log(`   - Public Tunnel URL:  ${process.env.PUBLIC_URL || 'Not configured'}`);
    console.log(`   - LLM Engine:         ${process.env.AI_LLM_PROVIDER || 'ollama'}${process.env.AI_LLM_PROVIDER === 'ollama' ? ' (Llama 3.2 1B Local)' : ''}`);
    console.log(`   - STT Engine:         ${process.env.AI_STT_PROVIDER || 'whisper'}${process.env.AI_STT_PROVIDER === 'whisper' ? ' (Whisper Tiny Local)' : ''}`);
    console.log(`   - TTS Engine:         ${process.env.AI_TTS_PROVIDER || 'mock'} (On-Device Mobile Neural Voice)`);
    console.log('======================================================\n');
  });

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('\n[Server] Gracefully shutting down...');
    httpServer.close(() => {
      console.log('[Server] Closed all connections. Exiting.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('❌ Fatal Server Boot Error:', err);
  process.exit(1);
});
