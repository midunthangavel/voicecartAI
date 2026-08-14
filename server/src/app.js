import express from 'express';
import cors from 'cors';
import { apiRouter } from './routes/api.routes.js';
import { telephonyRouter } from './routes/telephony.routes.js';
import { correlationIdMiddleware } from './middleware/correlationId.middleware.js';

/**
 * Creates and configures the Express application
 */
export function createApp() {
  const app = express();

  // Core & Observability middleware
  app.use(correlationIdMiddleware());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount routers
  app.use('/api', apiRouter);
  app.use('/', telephonyRouter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'VoiceCart AI API',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
    });
  });

  return app;
}
