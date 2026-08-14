import { verifyJwt } from '../services/auth.service.js';

/**
 * JWT Authentication Middleware
 * 
 * Validates Bearer tokens on protected REST routes and attaches authenticated
 * user context (userId, tenantId, restaurantId, role) to the request object.
 */
export function authMiddleware(options = { required: true }) {
  return (req, res, next) => {
    let token = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      if (options.required) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
      }
      return next();
    }

    const payload = verifyJwt(token);
    if (!payload) {
      if (options.required) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      }
      return next();
    }

    req.user = payload;
    req.tenantId = payload.tenantId;
    req.restaurantId = payload.restaurantId;

    next();
  };
}

export default authMiddleware;
