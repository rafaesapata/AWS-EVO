/**
 * Environment configuration for the application
 * Centralizes all environment variable access and validation
 */

import { VERSION } from './version';

export const env = {
  // AWS Configuration
  AWS_REGION: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  AWS_USER_POOL_ID: import.meta.env.VITE_AWS_USER_POOL_ID,
  AWS_USER_POOL_CLIENT_ID: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID,
  
  // API Configuration
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  
  // Application Configuration - imports from centralized version.ts
  APP_VERSION: VERSION,
  ENVIRONMENT: import.meta.env.VITE_ENVIRONMENT || 'development',
  
  // Development flags
  isDevelopment: import.meta.env.DEV,
  isProduction: import.meta.env.PROD,
  
  // Node environment (for server-side code)
  NODE_ENV: typeof process !== 'undefined' ? process.env.NODE_ENV : 'development',
} as const;

// Validation function to check required environment variables
export const validateEnvironment = () => {
  const requiredVars = [
    'VITE_AWS_REGION',
    'VITE_AWS_USER_POOL_ID', 
    'VITE_AWS_USER_POOL_CLIENT_ID',
    'VITE_API_BASE_URL'
  ];
  
  const missing = requiredVars.filter(varName => !import.meta.env[varName]);
  
  if (missing.length > 0) {
    console.warn('Missing required environment variables:', missing);
    return false;
  }
  
  return true;
};

/**
 * @deprecated AWS credentials should NEVER be accessed from frontend code.
 * All AWS operations must go through the backend API via API Gateway.
 * This function is kept as a no-op to prevent breaking changes but will always return null.
 */
export const getAWSCredentials = (): null => {
  // SECURITY: AWS credentials must NEVER be exposed in frontend code.
  // All AWS operations should use backend Lambda functions via API Gateway.
  // See: backend/src/lib/aws-helpers.ts for server-side credential handling.
  if (import.meta.env.DEV) {
    console.warn(
      '[SECURITY] getAWSCredentials() called from frontend. ' +
      'AWS credentials must never be accessed from browser code. ' +
      'Use API Gateway endpoints instead.'
    );
  }
  return null;
};

export default env;