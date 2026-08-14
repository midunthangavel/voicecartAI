/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Enforces permissions for user roles:
 *   - ADMIN (Full administrative capabilities)
 *   - RESTAURANT_MANAGER (Catalog management, pricing, analytics)
 *   - STAFF (Live call monitoring, manual orders)
 *   - KITCHEN (KDS order viewing and status updates)
 */

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    // ADMIN always has full access
    if (req.user.role === 'ADMIN') {
      return next();
    }

    if (allowedRoles.includes(req.user.role)) {
      return next();
    }

    console.warn(`[RBAC] Access denied for user ${req.user.email} (Role: ${req.user.role}) on ${req.method} ${req.originalUrl}`);
    return res.status(403).json({
      error: 'Forbidden: Insufficient permissions for this resource',
      requiredRoles: allowedRoles,
      userRole: req.user.role,
    });
  };
}

export default requireRole;
