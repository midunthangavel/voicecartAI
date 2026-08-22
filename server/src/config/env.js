import { z } from 'zod';

/**
 * Environment Configuration — Fail-Closed Design
 *
 * SECURITY PRINCIPLE: Production is the safe default.
 * - No development-mode defaults for security secrets.
 * - NODE_ENV must be explicitly declared.
 * - Production enforces strict minimum lengths for secrets
 *   and rejects development-only overrides.
 */

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1000).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production', 'staging']),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  DB_PATH: z.string().default('./voicecart.db'),
  REDIS_URL: isProduction
    ? z.string().url('REDIS_URL is mandatory for production deployments')
    : z.string().optional(),
  PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters long'),
  GOOGLE_MAPS_API_KEY: z.string().optional().default(''),
  GEMINI_API_KEY: z.string().optional().default(''),
  GROQ_API_KEY: z.string().optional().default(''),
  SARVAM_API_KEY: z.string().optional().default(''),
});

let parsedEnv = null;

export function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.format();
    console.error('❌ [Fatal Startup Error] Invalid environment configuration:');
    console.error(JSON.stringify(formatted, null, 2));
    console.error('\nRequired environment variables:');
    console.error('  NODE_ENV       - Must be one of: development, test, production, staging');
    console.error('  JWT_SECRET     - Min 32 chars (64+ in production)');
    console.error('  ENCRYPTION_KEY - Min 32 chars');
    if (isProduction) {
      console.error('  REDIS_URL      - Required in production');
    }
    process.exit(1);
  }

  parsedEnv = result.data;

  // ── Production-Specific Guards ──
  if (parsedEnv.NODE_ENV === 'production') {
    if (parsedEnv.JWT_SECRET.length < 64) {
      console.error('❌ [Fatal] Production JWT_SECRET must be >= 64 characters');
      process.exit(1);
    }

    if (process.env.DEV_AUTH_BYPASS === 'true') {
      console.error('❌ [Fatal] DEV_AUTH_BYPASS cannot be enabled in production');
      process.exit(1);
    }

    if (process.env.PAYMENT_MODE === 'mock') {
      console.error('❌ [Fatal] PAYMENT_MODE=mock cannot be used in production');
      process.exit(1);
    }
  }

  return parsedEnv;
}

// In test mode, provide safe defaults for test runners that may not set env vars
if (isTest && !process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'voicecart_test_jwt_secret_minimum_32_characters_for_testing_only';
}
if (isTest && !process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'voicecart_test_encryption_key_minimum_32_chars';
}
if (isTest && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

export const env = validateEnv();
export default env;
