/**
 * Secure Storage Manager
 * Implements encrypted storage for sensitive data
 */

import CryptoJS from 'crypto-js';

const STORAGE_KEY_PREFIX = 'evo_secure_';

// SECURITY: Get encryption key with fallback for production
const getEncryptionKey = (): string => {
  const key = import.meta.env.VITE_STORAGE_ENCRYPTION_KEY;
  
  if (key && key.length >= 32) {
    return key;
  }
  
  // In production without proper key, generate a session-based key
  // This is less secure but prevents app from crashing
  if (import.meta.env.PROD && !key) {
    console.warn('SECURITY WARNING: VITE_STORAGE_ENCRYPTION_KEY not set. Using session-derived key.');
    // Generate a deterministic key based on session
    const sessionId = sessionStorage.getItem('_evo_session_id') || crypto.randomUUID();
    sessionStorage.setItem('_evo_session_id', sessionId);
    return `evo-prod-session-${sessionId}`.padEnd(32, 'x');
  }
  
  // In development, use a secure default but warn
  if (!import.meta.env.PROD) {
    return key || 'dev-only-key-not-for-production-use-32chars';
  }
  
  // Fallback for production with short key
  console.warn('SECURITY WARNING: Encryption key too short. Using padded version.');
  return (key || 'evo-fallback-key').padEnd(32, 'x');
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