// Environment variables configuration
export interface FrontendEnv {
  NODE_ENV: string;
  NEXT_PUBLIC_API_URL: string;
  NEXT_PUBLIC_APP_NAME: string;
  NEXT_PUBLIC_APP_VERSION: string;
}

// Validate and load environment variables
function validateFrontendEnv(): FrontendEnv {
  const requiredEnvVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Fantasy11',
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
  };

  // Validate required public variables in production
  if (requiredEnvVars.NODE_ENV === 'production') {
    if (!process.env.NEXT_PUBLIC_API_URL) {
      console.warn('⚠️  NEXT_PUBLIC_API_URL is not set. Using default:', requiredEnvVars.NEXT_PUBLIC_API_URL);
    }
  }

  return requiredEnvVars;
}

// Load and validate frontend environment variables
export const env: FrontendEnv = validateFrontendEnv();

// Export individual values for convenience
export const {
  NODE_ENV,
  NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_VERSION,
} = env;

// Helper functions
export const isProduction = NODE_ENV === 'production';
export const isDevelopment = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';
