/**
 * Secure Storage Manager
 * Implements encrypted storage for sensitive data
 * SECURITY: Production requires VITE_STORAGE_ENCRYPTION_KEY (min 32 chars)
 */

import CryptoJS from 'crypto-js';

const STORAGE_KEY_PREFIX = 'evo_secure_';

// Flag to track if we're in a degraded security mode
let isSecurityDegraded = false;

// SECURITY: Get encryption key - FAIL in production if not configured
const getEncryptionKey = (): string => {
  const key = import.meta.env.VITE_STORAGE_ENCRYPTION_KEY;
  
  // Valid key provided
  if (key && key.length >= 32) {
    return key;
  }
  
  // PRODUCTION: MUST have proper key configured
  if (import.meta.env.PROD) {
    if (!key || key.length < 32) {
      // Log critical error
      console.error('FATAL SECURITY ERROR: VITE_STORAGE_ENCRYPTION_KEY must be set in production (min 32 chars)');
      console.error('Application cannot securely store sensitive data without proper encryption key.');
      
      // Set degraded mode flag
      isSecurityDegraded = true;
      
      // In production, we throw to prevent insecure operation
      // The app should show an error screen instead of operating insecurely
      throw new Error('Application security misconfigured. Please contact your administrator.');
    }
    return key;
  }
  
  // DEVELOPMENT: Use dev key but warn
  if (!key) {
    console.warn('DEV WARNING: Using development encryption key. Set VITE_STORAGE_ENCRYPTION_KEY for production.');
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