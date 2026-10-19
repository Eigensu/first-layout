import { z } from 'zod';

// Schema for frontend environment variables
export const frontendEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_API_URL: z.string().default('http://localhost:8000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Fantasy11'),
  NEXT_PUBLIC_APP_VERSION: z.string().default('1.0.0'),
});

// Schema for backend environment variables
export const backendEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEBUG: z.string().transform((val) => val === 'true').default('true'),
  SECRET_KEY: z.string().min(32, 'Secret key must be at least 32 characters'),
  DATABASE_URL: z.string().default('sqlite:///./fantasy11.db'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  // single: a legacy per-tournament service; shared: the one backend on walle_arena
  TENANCY: z.enum(['single', 'shared']).default('single'),
  JWT_SECRET_KEY: z.string().min(32, 'JWT secret key must be at least 32 characters'),
  JWT_ALGORITHM: z.string().default('HS256'),
  JWT_EXPIRE_MINUTES: z.number().default(1440),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.number().default(8000),
});

// Type definitions
export type FrontendEnv = z.infer<typeof frontendEnvSchema>;
export type BackendEnv = z.infer<typeof backendEnvSchema>;

// Validation functions
export function validateFrontendEnv(env: Record<string, string | undefined>): FrontendEnv {
  try {
    return frontendEnvSchema.parse(env);
  } catch (error) {
    console.error('❌ Invalid frontend environment variables:', error);
    throw new Error('Invalid frontend environment configuration');
  }
}

export function validateBackendEnv(env: Record<string, string | undefined>): BackendEnv {
  try {
    return backendEnvSchema.parse(env);
  } catch (error) {
    console.error('❌ Invalid backend environment variables:', error);
    throw new Error('Invalid backend environment configuration');
  }
}

// Default environment configurations
export const defaultFrontendEnv: Partial<FrontendEnv> = {
  NODE_ENV: 'development',
  NEXT_PUBLIC_API_URL: 'http://localhost:8000',
  NEXT_PUBLIC_APP_NAME: 'Fantasy11',
  NEXT_PUBLIC_APP_VERSION: '1.0.0',
};

export const defaultBackendEnv: Partial<BackendEnv> = {
  NODE_ENV: 'development',
  DEBUG: true,
  DATABASE_URL: 'sqlite:///./fantasy11.db',
  CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
  TENANCY: 'single',
  JWT_ALGORITHM: 'HS256',
  JWT_EXPIRE_MINUTES: 1440,
  API_HOST: '0.0.0.0',
  API_PORT: 8000,
};
