/**
 * Secure Storage Manager
 * Implements encrypted storage for sensitive data
 * MILITARY GRADE: Production REQUIRES VITE_STORAGE_ENCRYPTION_KEY (min 32 chars)
 */

import CryptoJS from 'crypto-js';

const STORAGE_KEY_PREFIX = 'evo_secure_';

// Flag to track if we're in a degraded security mode
let isSecurityDegraded = false;

// MILITARY GRADE: Get encryption key - FAIL FAST in production if not configured
const getEncryptionKey = (): string => {
  const key = import.meta.env.VITE_STORAGE_ENCRYPTION_KEY;
  const isProduction = import.meta.env.PROD;
  
  // Valid key provided (minimum 32 characters for AES-256)
  if (key && key.length >= 32) {
    return key;
  }
  
  // PRODUCTION: MUST have proper key configured - NO EXCEPTIONS
  if (isProduction) {
    // Log critical error for monitoring
    console.error('[SECURITY CRITICAL] VITE_STORAGE_ENCRYPTION_KEY must be set in production (min 32 chars)');
    console.error('[SECURITY CRITICAL] Application cannot securely store sensitive data without proper encryption key.');
    
    // Set degraded mode flag
    isSecurityDegraded = true;
    
    // MILITARY GRADE: In production, throw to prevent insecure operation
    // The app should show an error screen instead of operating insecurely
    throw new Error('SECURITY_MISCONFIGURED: Application requires encryption key in production. Contact administrator.');
  }
  
  // DEVELOPMENT ONLY: Use dev key but warn loudly
  if (!key) {
    console.warn('⚠️ DEV WARNING: Using development encryption key. Set VITE_STORAGE_ENCRYPTION_KEY for production.');
    console.warn('⚠️ DEV WARNING: This is NOT secure and will FAIL in production.');
  } else if (key.length < 32) {
    console.warn(`⚠️ DEV WARNING: Encryption key too short (${key.length} chars). Minimum 32 chars required for production.`);
  }
  
  return key || 'dev-only-key-not-for-production-use-32chars';
};

// Initialize encryption key with error handling
let ENCRYPTION_KEY: string;
try {
  ENCRYPTION_KEY = getEncryptionKey();
} catch (error) {
  // In production, this will throw and should be caught by error boundary
  if (import.meta.env.PROD) {
    throw error;
  }
  // In dev, use fallback
  ENCRYPTION_KEY = 'dev-only-key-not-for-production-use-32chars';
}

/**
 * Check if security is in degraded mode
 */
export function isSecurityInDegradedMode(): boolean {
  return isSecurityDegraded;
}

export class SecureStorage {
  private static instance: SecureStorage;

  private constructor() {
    // Validation happens in getEncryptionKey()
  }

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  setItem(key: string, value: string): void {
    try {
      const encryptedValue = ENCRYPTION_KEY 
        ? CryptoJS.AES.encrypt(value, ENCRYPTION_KEY).toString()
        : value;
      
      sessionStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, encryptedValue);
    } catch (error) {
      console.error('Failed to store encrypted data:', error);
      throw new Error('Failed to store data securely');
    }
  }

  getItem(key: string): string | null {
    try {
      const encryptedValue = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`);
      
      if (!encryptedValue) return null;
      
      if (ENCRYPTION_KEY && encryptedValue !== 'null') {
        try {
          const bytes = CryptoJS.AES.decrypt(encryptedValue, ENCRYPTION_KEY);
          const decryptedValue = bytes.toString(CryptoJS.enc.Utf8);
          return decryptedValue || null;
        } catch {
          // If decryption fails, remove the corrupted data
          this.removeItem(key);
          return null;
        }
      }
      
      return encryptedValue;
    } catch (error) {
      console.error('Failed to retrieve encrypted data:', error);
      return null;
    }
  }

  removeItem(key: string): void {
    sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`);
  }

  clear(): void {
    Object.keys(sessionStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => sessionStorage.removeItem(key));
  }

  // Utility method to check if storage is available
  isAvailable(): boolean {
    try {
      const testKey = '__storage_test__';
      sessionStorage.setItem(testKey, 'test');
      sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
}

export const secureStorage = SecureStorage.getInstance();