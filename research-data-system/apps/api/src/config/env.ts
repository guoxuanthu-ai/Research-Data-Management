import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().default('mysql://root@127.0.0.1:3307/rds'),
  JWT_SECRET: z.string().default('development-only-change-this-secret-32-bytes'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || env.JWT_SECRET.length < 32 || env.JWT_SECRET.startsWith('development-only-')) {
    throw new Error('JWT_SECRET must be explicitly set to at least 32 random characters in production');
  }
  if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE must be true in production');
}
