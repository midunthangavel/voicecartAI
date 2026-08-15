import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { dbGet, dbRun } from '../db.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/AppError.js';

// Enforce strong JWT secret configuration
const JWT_SECRET_STRING = process.env.JWT_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? 'voicecart_development_jwt_secret_coimbatore_2026_minimum_32_characters'
    : null);

if (!JWT_SECRET_STRING || JWT_SECRET_STRING.length < 32) {
  throw new Error('[Security Error] JWT_SECRET must be configured in environment with at least 32 characters.');
}

const JWT_KEY = new TextEncoder().encode(JWT_SECRET_STRING);
const JWT_ISSUER = 'voicecart-api';
const JWT_AUDIENCE = 'voicecart-dashboard';

/**
 * Secure Password Hashing with individual random salts and 100,000 PBKDF2 iterations
 */
export function hashPassword(password, salt = null) {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, userSalt, 100000, 32, 'sha256').toString('hex');
  return `${userSalt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.includes(':')) {
    // Legacy fallback support for dev seeds
    const legacyHash = crypto.pbkdf2Sync(password, 'voicecart_salt_2026', 1000, 32, 'sha256').toString('hex');
    return legacyHash === storedHash;
  }

  const [salt, expectedHash] = storedHash.split(':');
  const actualHash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}

/**
 * Generate cryptographically signed JWT with audience, issuer, and expiry
 */
export async function generateToken(user) {
  return new SignJWT({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    tenant_id: user.tenant_id || 't_annapoorna',
    restaurant_id: user.restaurant_id || 'r_coimbatore_01',
    role: user.role || 'STAFF',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_KEY);
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_KEY, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload;
  } catch (err) {
    throw new AppError(401, 'INVALID_TOKEN', `Authentication failed: ${err.message}`);
  }
}

/**
 * Authenticate user with database lookup
 */
export async function authenticateUser(email, password) {
  const normalizedEmail = email.toLowerCase().trim();

  let user = await dbGet('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

  // If user doesn't exist in DB but matches known demo accounts in dev, auto-seed user into DB
  if (!user && process.env.NODE_ENV !== 'production') {
    const demoAccounts = {
      'admin@annapoorna.com': { name: 'Admin Manager', role: 'ADMIN', pass: 'Annapoorna@123' },
      'kitchen@annapoorna.com': { name: 'Master Chef', role: 'KITCHEN', pass: 'Kitchen@123' },
      'staff@annapoorna.com': { name: 'Front Desk Staff', role: 'STAFF', pass: 'Staff@123' },
    };

    const demo = demoAccounts[normalizedEmail];
    if (demo && demo.pass === password) {
      const hashed = hashPassword(password);
      await dbRun(
        `INSERT OR IGNORE INTO users (tenant_id, restaurant_id, email, password_hash, name, role)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['t_annapoorna', 'r_coimbatore_01', normalizedEmail, hashed, demo.name, demo.role]
      );
      user = await dbGet('SELECT * FROM users WHERE email = ?', [normalizedEmail]);
    }
  }

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const token = await generateToken(user);

  logger.info(`[Auth] User authenticated: ${user.email} (${user.role})`);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenant_id: user.tenant_id,
      restaurant_id: user.restaurant_id,
      role: user.role,
    },
  };
}
