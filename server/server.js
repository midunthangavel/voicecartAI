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
import { initDatabase, closeDatabase } from './src/db.js';
import { createWebSocketCoordinator } from './src/websocket/wsServer.js';
import { logger } from './src/utils/logger.js';

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
  const wsCoordinator = createWebSocketCoordinator(httpServer);

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

  // ── Coordinated Graceful Shutdown ──
  // Sequence: stop accepting → drain connections → close WebSockets → flush DB → exit

  let isShuttingDown = false;

  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Server] Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new connections
    httpServer.close(() => {
      console.log('[Server] HTTP server closed — no new connections accepted.');
    });

    // 2. Close all WebSocket connections gracefully
    if (wsCoordinator && typeof wsCoordinator.close === 'function') {
      try {
        wsCoordinator.close();
        console.log('[Server] WebSocket connections closed.');
      } catch (err) {
        console.warn('[Server] WebSocket close error:', err.message);
      }
    }

    // 3. Wait briefly for in-flight requests to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Close database connections
    try {
      await closeDatabase();
      console.log('[Server] Database connections closed.');
    } catch (err) {
      console.warn('[Server] Database close error:', err.message);
    }

    // 5. Close Redis connections
    try {
      const { getRedisClient } = await import('./src/infra/redisClient.js');
      const redis = getRedisClient();
      if (redis && typeof redis.quit === 'function') {
        await redis.quit();
        console.log('[Server] Redis connection closed.');
      }
    } catch (err) {
      // Redis may not be available — not critical
    }

    console.log('[Server] Graceful shutdown complete. Exiting.');
    process.exit(0);
  };

  // Force exit after 10s if graceful shutdown stalls
  const forceExit = (signal) => {
    shutdown(signal);
    setTimeout(() => {
      console.error('[Server] Forced exit — shutdown did not complete within 10 seconds.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => forceExit('SIGTERM'));
  process.on('SIGINT', () => forceExit('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('❌ Fatal Server Boot Error:', err);
  process.exit(1);
});
