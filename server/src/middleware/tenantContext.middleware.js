import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * Tenant Context Middleware
 *
 * Validates that the authenticated identity (populated by authMiddleware)
 * carries a valid tenantId and restaurantId, then binds them to `req.tenant`
 * for downstream controllers to consume without re-extracting.
 *
 * This eliminates the duplicated getAuthContext / enforceAuthContext helpers
 * that were copy-pasted across order, call, and enterprise controllers.
 *
 * Fail-closed: If either field is missing the request is rejected with 401.
 */
export function requireTenantContext() {
  return (req, res, next) => {
    const tenantId = req.auth?.tenantId;
    const restaurantId = req.auth?.restaurantId;

    if (!tenantId || !restaurantId) {
      const appError = new AppError(
        401,
        'AUTH_CONTEXT_MISSING',
        'Authenticated tenant and restaurant context is required'
      );
      logger.warn('Request rejected: missing tenant/restaurant context in token', {
        correlationId: req.correlationId,
        method: req.method,
        url: req.originalUrl || req.url,
        hasAuth: !!req.auth,
        hasTenantId: !!tenantId,
        hasRestaurantId: !!restaurantId,
      });
      return next(appError);
    }

    req.tenant = { tenantId, restaurantId };
    next();
  };
}

export default requireTenantContext;
