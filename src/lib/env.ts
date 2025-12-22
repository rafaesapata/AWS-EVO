/**
 * Environment configuration for the application
 * Centralizes all environment variable access and validation
 */

export const env = {
  // AWS Configuration
  AWS_REGION: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  AWS_USER_POOL_ID: import.meta.env.VITE_AWS_USER_POOL_ID,
  AWS_USER_POOL_CLIENT_ID: import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID,
  
  // API Configuration
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  
  // Application Configuration
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '2.1.0',
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

// Helper to get AWS credentials from environment (server-side only)
export const getAWSCredentials = () => {
  if (typeof process === 'undefined') {
    console.warn('AWS credentials not available in browser environment');
    return null;
  }
  
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || process.env.VITE_AWS_REGION || 'us-east-1'
  };
};

export default env;