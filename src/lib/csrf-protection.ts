/**
 * CSRF Protection Module
 * Implements Cross-Site Request Forgery protection
 */

const CSRF_TOKEN_KEY = 'evo_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

export function generateCSRFToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem(CSRF_TOKEN_KEY, token);
  return token;
}

export function getCSRFToken(): string | null {
  return sessionStorage.getItem(CSRF_TOKEN_KEY);
}

export function validateCSRFToken(token: string): boolean {
  const storedToken = getCSRFToken();
  return storedToken !== null && storedToken === token;
}

export function getCSRFHeader(): Record<string, string> {
  const token = getCSRFToken();
  return token ? { [CSRF_HEADER_NAME]: token } : {};
}

export function initializeCSRF(): void {
  // Generate CSRF token on app initialization
  if (!getCSRFToken()) {
    generateCSRFToken();
  }
}

export function refreshCSRFToken(): string {
  // Generate new token and return it
  return generateCSRFToken();
}

// Auto-initialize CSRF token
if (typeof window !== 'undefined') {
  initializeCSRF();
}