import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'voicecart_production_jwt_secret_coimbatore_2026';
const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours

// Pre-seeded demo user accounts for multi-tenant testing
const DEMO_USERS = [
  {
    id: 'u_admin_01',
    tenant_id: 't_annapoorna',
    restaurant_id: 'r_coimbatore_01',
    email: 'admin@annapoorna.com',
    password_hash: hashPassword('Annapoorna@123'),
    name: 'Annapoorna Admin',
    role: 'ADMIN',
  },
  {
    id: 'u_manager_01',
    tenant_id: 't_annapoorna',
    restaurant_id: 'r_coimbatore_01',
    email: 'manager@annapoorna.com',
    password_hash: hashPassword('Manager@123'),
    name: 'RS Puram Branch Manager',
    role: 'RESTAURANT_MANAGER',
  },
  {
    id: 'u_kitchen_01',
    tenant_id: 't_annapoorna',
    restaurant_id: 'r_coimbatore_01',
    email: 'kitchen@annapoorna.com',
    password_hash: hashPassword('Kitchen@123'),
    name: 'RS Puram KDS Station',
    role: 'KITCHEN',
  },
  {
    id: 'u_staff_01',
    tenant_id: 't_annapoorna',
    restaurant_id: 'r_coimbatore_01',
    email: 'staff@annapoorna.com',
    password_hash: hashPassword('Staff@123'),
    name: 'Front Desk Staff',
    role: 'STAFF',
  },
];

/**
 * Hash password with salt
 */
export function hashPassword(password, salt = 'vc_salt_2026') {
  return crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex');
}

/**
 * Generate HMAC-SHA256 signed JWT token
 */
export function generateJwt(payload, secret = JWT_SECRET, expiresIn = TOKEN_EXPIRY_SECONDS) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode HMAC-SHA256 signed JWT token
 */
export function verifyJwt(token, secret = JWT_SECRET) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null; // Invalid signature
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
      return null; // Expired token
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authenticate user with email and password
 */
export async function authenticateUser(email, password) {
  if (!email || !password) return null;

  const cleanEmail = email.toLowerCase().trim();
  const user = DEMO_USERS.find(u => u.email === cleanEmail);
  if (!user) return null;

  const passwordHash = hashPassword(password);
  if (user.password_hash !== passwordHash) return null;

  const token = generateJwt({
    userId: user.id,
    tenantId: user.tenant_id,
    restaurantId: user.restaurant_id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      restaurantId: user.restaurant_id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export default {
  hashPassword,
  generateJwt,
  verifyJwt,
  authenticateUser,
};
