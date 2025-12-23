/**
 * Secure Storage Manager
 * Implements encrypted storage for sensitive data
 */

import CryptoJS from 'crypto-js';

const STORAGE_KEY_PREFIX = 'evo_secure_';

// SECURITY: Validate encryption key in production
const getEncryptionKey = (): string => {
  const key = import.meta.env.VITE_STORAGE_ENCRYPTION_KEY;
  
  if (import.meta.env.PROD) {
    if (!key) {
      throw new Error('CRITICAL: VITE_STORAGE_ENCRYPTION_KEY must be set in production');
    }
    if (key.length < 32) {
      throw new Error('CRITICAL: Encryption key must be at least 32 characters');
    }
  }
  
  // In development, use a secure default but warn
  return key || 'dev-only-key-not-for-production-use-32chars';
};

const ENCRYPTION_KEY = getEncryptionKey();

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