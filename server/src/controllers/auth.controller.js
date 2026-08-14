import { authenticateUser } from '../services/auth.service.js';

/**
 * Controller for Multi-Tenant User Authentication
 */

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const authResult = await authenticateUser(email, password);
    if (!authResult) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      success: true,
      token: authResult.token,
      user: authResult.user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMe(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      user: req.user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
