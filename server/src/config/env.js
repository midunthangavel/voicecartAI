import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1000).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long').default(
    process.env.NODE_ENV !== 'production'
      ? 'voicecart_development_jwt_secret_coimbatore_2026_minimum_32_characters'
      : ''
  ),
  DB_PATH: z.string().default('./voicecart.db'),
  REDIS_URL: z.string().optional(),
  PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters long').default(
    process.env.NODE_ENV !== 'production'
      ? 'voicecart_dev_encryption_key_2026_coimbatore_32ch'
      : ''
  ),
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
    throw new Error('Environment configuration validation failed');
  }
  parsedEnv = result.data;
  return parsedEnv;
}

export const env = validateEnv();
export default env;
