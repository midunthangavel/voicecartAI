import { authenticateUser } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Controller for Multi-Tenant User Authentication
 */

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const authResult = await authenticateUser(email, password);

    res.json({
      success: true,
      token: authResult.token,
      user: authResult.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = req.auth || req.user;
    if (!user) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Not authenticated'));
    }
    res.json({
      user,
    });
  } catch (err) {
    next(err);
  }
}
