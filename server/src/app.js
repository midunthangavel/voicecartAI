import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v1Router } from './routes/v1/index.js';
import { telephonyRouter } from './routes/telephony.routes.js';
import { correlationIdMiddleware } from './middleware/correlationId.middleware.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware.js';
import { initOutboxWorker } from './workers/outbox.worker.js';
import { dbGet } from './db.js';
import './config/env.js'; // Trigger boot-time env validation

/**
 * Creates and configures the production Express application
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // 1. Security & Observability Middleware
  app.use(correlationIdMiddleware());
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://maps.googleapis.com'],
        connectSrc: ["'self'", 'https:', 'wss:', 'ws:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // 2. CORS Allowlist
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      callback(new Error(`Origin ${origin} not permitted by CORS policy`));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  }));

  // 3. Strict Request Body Limits
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));

  // 4. Liveness & Readiness Probes
  app.get('/health/live', (req, res) => {
    res.json({ status: 'ok', service: 'VoiceCart AI API', timestamp: new Date().toISOString() });
  });

  app.get(['/health', '/health/ready'], async (req, res) => {
    let dbStatus = false;
    try {
      await dbGet('SELECT 1');
      dbStatus = true;
    } catch {}

    const ready = dbStatus;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        database: dbStatus,
        api: true,
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  });

  // 5. Mount Route Gateways
  // Telephony & Webhooks
  app.use('/', telephonyRouter);

  // Canonical Versioned API (v1) & Backward-Compatible Alias (/api)
  app.use('/api/v1', v1Router);
  app.use('/api', v1Router);

  // 6. 404 & Centralized Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  // 7. Start Transactional Outbox Background Poller (if in server mode)
  if (process.env.NODE_ENV !== 'test') {
    initOutboxWorker();
  }

  return app;
}
