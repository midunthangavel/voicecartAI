import { Router } from 'express';
import { login, refreshToken, getWsTicket, getCurrentUser } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { loginSchema } from '../schemas/auth.schema.js';

export const authRouter = Router();

authRouter.post('/login', validateBody(loginSchema), login);
authRouter.post('/refresh', refreshToken);
authRouter.post('/ws-ticket', authMiddleware({ required: true }), getWsTicket);
authRouter.get('/me', authMiddleware({ required: true }), getCurrentUser);
