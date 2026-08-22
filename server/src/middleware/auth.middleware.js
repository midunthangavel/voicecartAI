import { verifyToken } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Authentication Middleware
 *
 * Verifies JWT token and binds authenticated identity directly to `req.auth`.
 * Mandatory by default across all protected routes.
 *
 * SECURITY: Query-string JWT authentication has been removed.
 * WebSocket auth should use the ticket mechanism (wsTicketService.js) exclusively.
 * Allowing tokens in URLs exposes them in server logs, browser history,
 * referrer headers, and proxy caches.
 */
export function authMiddleware(options = { required: true }) {
  const { required = true } = options;

  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
    // REMOVED: req.query?.access_token fallback (security risk — tokens in URLs)

    if (!token) {
      if (required) {
        return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication required. Please provide a valid Bearer token.'));
      }
      return next();
    }

    try {
      const claims = await verifyToken(token);

      // Server-side authoritative identity
      req.auth = {
        userId: claims.sub,
        email: claims.email,
        name: claims.name,
        tenantId: claims.tenant_id,
        restaurantId: claims.restaurant_id,
        role: claims.role,
      };

      req.user = req.auth; // Compatibility alias
      next();
    } catch (err) {
      if (required) {
        return next(err);
      }
      next();
    }
  };
}

export default authMiddleware;
