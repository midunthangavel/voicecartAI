import crypto from 'crypto';

const RAW_KEY = process.env.ENCRYPTION_KEY ||
  (process.env.NODE_ENV !== 'production'
    ? 'voicecart_dev_encryption_key_2026_coimbatore_32ch'
    : null);

// Derive 32-byte key for AES-256-GCM
const DERIVED_KEY = crypto.createHash('sha256').update(RAW_KEY || 'voicecart_default_key').digest();

/**
 * Encrypt sensitive customer PII using AES-256-GCM
 * @param {string} text - Plaintext to encrypt
 * @returns {string} - Formatted encrypted token `enc:v1:<iv>:<tag>:<ciphertext>`
 */
export function encryptField(text) {
  if (text === null || text === undefined || text === '') return text;
  const str = String(text);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', DERIVED_KEY, iv);

  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive customer PII using AES-256-GCM
 * @param {string} cipherText - Encrypted token
 * @returns {string} - Decrypted plaintext or original if not encrypted
 */
export function decryptField(cipherText) {
  if (typeof cipherText !== 'string' || !cipherText.startsWith('enc:v1:')) {
    return cipherText;
  }

  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;

    const [, , ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', DERIVED_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[CryptoVault] Decryption failed, returning sanitized fallback:', err.message);
    return cipherText;
  }
}
