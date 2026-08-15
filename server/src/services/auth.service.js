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

const PBKDF2_ITERATIONS = 210000;

/**
 * Secure Password Hashing with unique random salts and 210,000 PBKDF2 iterations
 */
export function hashPassword(password, salt = null) {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, userSalt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  return `${userSalt}:${hash}`;
}

/**
 * Strict Password Verification — No legacy weak hashes permitted
 */
export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, expectedHash] = storedHash.split(':');
  if (!salt || !expectedHash) return false;

  const actualHash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actualHash), Buffer.from(expectedHash));
}

/**
 * Generate short-lived Access Token (15m) with strict tenant context
 */
export async function generateToken(user) {
  const tenantId = user.tenant_id || user.tenantId;
  const restaurantId = user.restaurant_id || user.restaurantId;

  if (!tenantId || !restaurantId) {
    throw new AppError(500, 'TENANT_CONTEXT_REQUIRED', 'Tenant and restaurant context required to issue token');
  }

  return new SignJWT({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    tenant_id: tenantId,
    restaurant_id: restaurantId,
    role: user.role || 'STAFF',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(JWT_KEY);
}

/**
 * Generate short-lived Access Token + 7-Day Refresh Token Pair (Fail-Closed DB Persistence)
 */
export async function generateTokenPair(user) {
  const accessToken = await generateToken(user);
  const jti = `jti_${crypto.randomUUID()}`;

  const refreshToken = await new SignJWT({
    sub: String(user.id),
    jti,
    type: 'REFRESH',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_KEY);

  // Store refresh token in database ledger — FAIL CLOSED if persistence fails
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun(
    'INSERT INTO refresh_tokens (user_id, jti, expires_at) VALUES (?, ?, ?)',
    [String(user.id), jti, expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: 900, // 15 minutes
  };
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
 * Rotate Refresh Token — Requires registered JTI in database
 */
export async function rotateRefreshToken(refreshTokenString) {
  const payload = await verifyToken(refreshTokenString);
  if (payload.type !== 'REFRESH' || !payload.jti) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Supplied token is not a valid refresh token');
  }

  // 1. Enforce strict existence check for JTI in database
  const tokenRecord = await dbGet(
    'SELECT * FROM refresh_tokens WHERE jti = ?',
    [payload.jti]
  );

  if (!tokenRecord) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is not registered');
  }

  if (tokenRecord.revoked_at) {
    throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh token has been revoked. Please log in again.');
  }

  // 2. Revoke the old refresh token (Single-use rotation)
  await dbRun(
    'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE jti = ?',
    [payload.jti]
  );

  const user = await dbGet(
    'SELECT id, email, name, tenant_id, restaurant_id, role FROM users WHERE id = ?',
    [payload.sub]
  );

  if (!user) {
    throw new AppError(401, 'USER_NOT_FOUND', 'User belonging to refresh token no longer exists');
  }

  return generateTokenPair(user);
}

/**
 * Authenticate user credentials against database
 */
export async function authenticateUser(email, password) {
  if (!email || !password) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }

  const user = await dbGet(
    'SELECT * FROM users WHERE email = ? AND (status IS NULL OR status = "active")',
    [email.toLowerCase().trim()]
  );

  if (!user || !user.password_hash) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const tokenPair = await generateTokenPair(user);
  logger.info(`[Auth] User authenticated: ${user.email} (${user.role})`);

  return {
    token: tokenPair.accessToken,
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    expiresIn: tokenPair.expiresInSeconds,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenant_id,
      restaurantId: user.restaurant_id,
      role: user.role,
    },
  };
}
