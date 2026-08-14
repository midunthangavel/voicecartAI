import { Router } from 'express';
import { login, getMe } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export const authRouter = Router();

authRouter.post('/login', login);
authRouter.get('/me', authMiddleware({ required: true }), getMe);
