import { AppError } from '../utils/AppError.js';

export const ROLES = {
  ADMIN: 'ADMIN',
  RESTAURANT_MANAGER: 'RESTAURANT_MANAGER',
  STAFF: 'STAFF',
  KITCHEN: 'KITCHEN',
};

/**
 * Role-Based Access Control (RBAC) Guard
 * 
 * Verifies that the authenticated user has one of the allowed roles.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.auth?.role || req.user?.role;

    if (!userRole) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication required for this resource'));
    }

    if (!allowedRoles.includes(userRole) && userRole !== ROLES.ADMIN) {
      return next(new AppError(403, 'FORBIDDEN', `Access forbidden: requires one of [${allowedRoles.join(', ')}] role`));
    }

    next();
  };
}

export default requireRole;
