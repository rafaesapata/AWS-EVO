/**
 * Token Encryption Library
 * 
 * Provides AES-256-GCM encryption for OAuth refresh tokens.
 * Supports key rotation with keyId field.
 * 
 * SECURITY: Never log or expose encrypted tokens or keys.
 */

import * as crypto from 'crypto';
import { logger } from './logging.js';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Encrypted token structure
 */
export interface EncryptedToken {
  ciphertext: string;  // Base64 encoded
  iv: string;          // Base64 encoded
  tag: string;         // Base64 encoded (GCM auth tag)
  keyId: string;       // For key rotation
}

/**
 * Get encryption key from environment
 * 
 * @param keyId - Optional key ID for rotation (default: 'v1')
 * @returns 32-byte encryption key
 * @throws Error if key is not configured or invalid
 */
function deriveKeyFromSecret(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

function getEncryptionKey(keyId: string = 'v1'): Buffer {
  // Support multiple keys for rotation
  const envKey = keyId === 'v1' 
    ? process.env.TOKEN_ENCRYPTION_KEY 
    : process.env[`TOKEN_ENCRYPTION_KEY_${keyId.toUpperCase()}`];
  
  if (envKey) {
    // Key should be base64 encoded 32-byte key
    const keyBuffer = Buffer.from(envKey, 'base64');
    
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(`Invalid encryption key length: expected ${KEY_LENGTH} bytes, got ${keyBuffer.length}`);
    }
    
    return keyBuffer;
  }
  
  // Fallback: derive key from DATABASE_URL (always available in Lambda environment)
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    logger.warn('TOKEN_ENCRYPTION_KEY not configured, deriving key from DATABASE_URL. Set TOKEN_ENCRYPTION_KEY for production use.');
    return deriveKeyFromSecret(databaseUrl);
  }
  
  throw new Error(`Encryption key not configured for keyId: ${keyId}. Set TOKEN_ENCRYPTION_KEY environment variable.`);
}

/**
 * Encrypt a token using AES-256-GCM
 * 
 * @param token - Plain text token to encrypt
 * @param keyId - Key ID for rotation (default: 'v1')
 * @returns Encrypted token structure
 * @throws Error if encryption fails
 */
export function encryptToken(token: string, keyId: string = 'v1'): EncryptedToken {
  if (!token) {
    throw new Error('Token cannot be empty');
  }
  
  try {
    const key = getEncryptionKey(keyId);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: authTag.toString('base64'),
      keyId,
    };
  } catch (error: any) {
    // Log error without exposing token
    logger.error('Token encryption failed', { 
      error: error.message,
      keyId,
    });
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypt a token using AES-256-GCM
 * 
 * @param encryptedToken - Encrypted token structure
 * @returns Decrypted plain text token
 * @throws Error if decryption fails (invalid key, tampered data, etc.)
 */
export function decryptToken(encryptedToken: EncryptedToken): string {
  if (!encryptedToken || !encryptedToken.ciphertext || !encryptedToken.iv || !encryptedToken.tag) {
    throw new Error('Invalid encrypted token structure');
  }
  
  try {
    const key = getEncryptionKey(encryptedToken.keyId);
    const iv = Buffer.from(encryptedToken.iv, 'base64');
    const ciphertext = Buffer.from(encryptedToken.ciphertext, 'base64');
    const authTag = Buffer.from(encryptedToken.tag, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  } catch (error: any) {
    // Log error without exposing token
    logger.error('Token decryption failed', { 
      error: error.message,
      keyId: encryptedToken.keyId,
    });
    throw new Error('Failed to decrypt token');
  }
}

/**
 * Serialize encrypted token to string for database storage
 * 
 * @param encryptedToken - Encrypted token structure
 * @returns JSON string
 */
export function serializeEncryptedToken(encryptedToken: EncryptedToken): string {
  return JSON.stringify(encryptedToken);
}

/**
 * Deserialize encrypted token from database storage
 * 
 * @param serialized - JSON string from database
 * @returns Encrypted token structure
 * @throws Error if parsing fails
 */
export function deserializeEncryptedToken(serialized: string): EncryptedToken {
  try {
    const parsed = JSON.parse(serialized);
    
    // Validate structure
    if (!parsed.ciphertext || !parsed.iv || !parsed.tag || !parsed.keyId) {
      throw new Error('Invalid encrypted token structure');
    }
    
    return parsed as EncryptedToken;
  } catch (error: any) {
    logger.error('Failed to deserialize encrypted token', { error: error.message });
    throw new Error('Invalid encrypted token format');
  }
}

/**
 * Generate a new encryption key (for initial setup or rotation)
 * 
 * @returns Base64 encoded 32-byte key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64');
}

/**
 * Re-encrypt a token with a new key (for key rotation)
 * 
 * @param encryptedToken - Token encrypted with old key
 * @param newKeyId - New key ID to use
 * @returns Token encrypted with new key
 */
export function rotateTokenKey(encryptedToken: EncryptedToken, newKeyId: string): EncryptedToken {
  // Decrypt with old key
  const plainToken = decryptToken(encryptedToken);
  
  // Re-encrypt with new key
  return encryptToken(plainToken, newKeyId);
}
