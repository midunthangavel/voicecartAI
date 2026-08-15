import { authenticateUser, rotateRefreshToken } from '../services/auth.service.js';
import { createWsTicket } from '../services/wsTicketService.js';
import { AppError } from '../utils/AppError.js';

/**
 * Auth Controller — Login, token refresh, and WebSocket ticket generation
 */

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authenticateUser(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req, res, next) {
  try {
    const { refreshToken: tokenStr } = req.body;
    if (!tokenStr) {
      throw new AppError(400, 'VALIDATION_ERROR', 'refreshToken is required');
    }
    const tokenPair = await rotateRefreshToken(tokenStr);
    res.json(tokenPair);
  } catch (err) {
    next(err);
  }
}

export async function getWsTicket(req, res, next) {
  try {
    if (!req.auth) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Authentication required to acquire WebSocket ticket');
    }
    const ticketData = createWsTicket(req.auth);
    res.json(ticketData);
  } catch (err) {
    next(err);
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    res.json({
      user: req.auth,
    });
  } catch (err) {
    next(err);
  }
}
