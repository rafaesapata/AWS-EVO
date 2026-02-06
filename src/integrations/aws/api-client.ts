import { cognitoAuth } from './cognito-client-simple';
import { getCSRFHeader } from '@/lib/csrf-protection';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

// Session ID for correlation across requests
const SESSION_ID = crypto.randomUUID();
sessionStorage.setItem('sessionId', SESSION_ID);

// Impersonation storage key
const IMPERSONATION_KEY = 'evo-impersonation';

// Token refresh state to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Auth redirect cooldown to prevent redirect loops
let lastAuthRedirectTime = 0;
const AUTH_REDIRECT_COOLDOWN_MS = 5000; // 5 seconds between redirects

export interface ApiResponse<T = any> {
  data: T;
  error: null;
  requestId?: string;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
    status?: number;
    requestId?: string;
  };
}

/**
 * Get impersonation state from localStorage
 */
function getImpersonationOrgId(): string | null {
  try {
    const stored = localStorage.getItem(IMPERSONATION_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      if (state.isImpersonating && state.impersonatedOrgId) {
        // Validate UUID format to prevent injection
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (!uuidRegex.test(state.impersonatedOrgId)) {
          console.error('🔐 Invalid impersonation org ID format, ignoring');
          localStorage.removeItem(IMPERSONATION_KEY);
          return null;
        }
        return state.impersonatedOrgId;
      }
    }
  } catch {
    // Ignore parse errors
    localStorage.removeItem(IMPERSONATION_KEY);
  }
  return null;
}

/**
 * Safely decode JWT payload with proper base64url handling
 */
function decodeJWTPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if necessary
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const paddedBase64 = base64 + padding;
    
    const decoded = atob(paddedBase64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Extract error message from API response error
 * Handles both object and string error formats
 */
export function getErrorMessage(error: ApiError['error'] | string | unknown): string {
  if (!error) return 'Unknown error occurred';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message;
  }
  return JSON.stringify(error);
}

/**
 * Throw an error with proper message extraction from API response
 */
export function throwApiError(response: ApiError): never {
  throw new Error(getErrorMessage(response.error));
}

class ApiClient {
  /**
   * Attempt to refresh the authentication token
   * Returns true if refresh was successful, false otherwise
   */
  private async tryRefreshToken(): Promise<boolean> {
    // If already refreshing, wait for the existing refresh to complete
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        console.log('🔄 Attempting to refresh authentication token...');
        const newSession = await cognitoAuth.refreshSession();
        
        if (newSession) {
          console.log('✅ Token refreshed successfully');
          return true;
        }
        
        console.log('❌ Token refresh failed - no new session');
        return false;
      } catch (error) {
        console.error('❌ Token refresh error:', error);
        return false;
      } finally {
        isRefreshing = false;
        // Delay clearing the promise so concurrent callers that just checked
        // isRefreshing=true can still grab the promise reference
        setTimeout(() => { refreshPromise = null; }, 100);
      }
    })();

    return refreshPromise;
  }

  /**
   * Handle authentication errors (401/403)
   * Attempts to refresh token and retry the request once
   */
  private async handleAuthError<T>(
    endpoint: string,
    options: RequestInit,
    timeoutMs: number,
    status: number
  ): Promise<ApiResponse<T> | ApiError | null> {
    // Only attempt refresh for 401 Unauthorized or 403 Forbidden
    if (status !== 401 && status !== 403) {
      return null;
    }

    console.log(`🔐 Received ${status} error, attempting token refresh...`);
    
    const refreshed = await this.tryRefreshToken();
    
    if (!refreshed) {
      // Refresh failed - only redirect if we're NOT already on the auth page
      // and haven't redirected recently (prevents rapid-fire redirect loops)
      console.log('🔐 Token refresh failed');
      const isOnAuthPage = window.location.pathname === '/' || 
                           window.location.pathname === '/auth' || 
                           window.location.pathname === '/register';
      const now = Date.now();
      const recentlyRedirected = (now - lastAuthRedirectTime) < AUTH_REDIRECT_COOLDOWN_MS;
      
      if (!isOnAuthPage && !recentlyRedirected) {
        console.log('🔐 Redirecting to login...');
        lastAuthRedirectTime = now;
        await cognitoAuth.signOut();
        window.location.href = '/auth?reason=session_expired';
      }
      
      return {
        data: null,
        error: {
          message: 'Session expired. Please login again.',
          code: 'SESSION_EXPIRED',
          status: 401,
        },
      };
    }

    // Retry the original request with new token
    console.log('🔄 Retrying request with refreshed token...');
    return this.requestInternal<T>(endpoint, options, timeoutMs, false);
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const session = await cognitoAuth.getCurrentSession();
    
    // Generate unique request ID for tracing
    const requestId = crypto.randomUUID();
    const correlationId = sessionStorage.getItem('sessionId') || SESSION_ID;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      'X-Correlation-ID': correlationId,
      ...getCSRFHeader(), // Add CSRF protection to all requests
    };

    // Add impersonation header if super admin is impersonating
    const impersonatedOrgId = getImpersonationOrgId();
    if (impersonatedOrgId) {
      headers['X-Impersonate-Organization'] = impersonatedOrgId;
    }

    if (session) {
      // Use idToken for Cognito User Pools Authorizer (contains custom attributes)
      headers['Authorization'] = `Bearer ${session.idToken}`;
      
      // Validate organization ID format from token
      const payload = decodeJWTPayload(session.idToken);
      if (payload) {
        const orgId = payload['custom:organization_id'];
        
        // CRITICAL: Validate UUID format - clear session if invalid
        // Don't redirect here to avoid loops; let the caller handle null session
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (orgId && !uuidRegex.test(orgId)) {
          console.error('🔐 Invalid organization ID format in token, clearing session');
          await cognitoAuth.signOut();
          throw new Error('Invalid session - please login again');
        }
      }
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<ApiResponse<T> | ApiError> {
    return this.requestInternal<T>(endpoint, options, timeoutMs, true);
  }

  private async requestInternal<T>(
    endpoint: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    allowRetry: boolean = true
  ): Promise<ApiResponse<T> | ApiError> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const headers = await this.getAuthHeaders();
      const requestId = headers['X-Request-ID'];
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          ...headers,
          ...options.headers,
        },
      });
      
      clearTimeout(timeoutId);

      // Capture response request ID for tracing
      const responseRequestId = response.headers.get('X-Request-ID') || requestId;

      if (!response.ok) {
        // Check if this is an auth error that we should retry
        if (allowRetry && (response.status === 401 || response.status === 403)) {
          const retryResult = await this.handleAuthError<T>(endpoint, options, timeoutMs, response.status);
          if (retryResult) {
            return retryResult;
          }
        }

        const errorData = await response.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`,
            code: errorData.code,
            status: response.status,
            requestId: responseRequestId,
          },
        };
      }

      const responseData = await response.json();
      
      // Handle Lambda response format: { success: true, data: [...] }
      // Extract the inner data if present
      if (responseData && typeof responseData === 'object' && 'data' in responseData) {
        const data = responseData.data;
        // Normalize: ensure arrays are always arrays for select operations, never undefined
        return { 
          data: data === null || data === undefined ? [] : data, 
          error: null, 
          requestId: responseRequestId 
        };
      }
      
      // Return as-is for other formats, but normalize null/undefined to empty array for select operations
      return { 
        data: responseData === null || responseData === undefined ? [] : responseData, 
        error: null, 
        requestId: responseRequestId 
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          data: null,
          error: {
            message: 'Request timeout',
            code: 'TIMEOUT',
          },
        };
      }
      
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  // Generic CRUD operations - uses Lambda query-table for all table queries
  async select<T>(table: string, options: {
    select?: string;
    eq?: Record<string, any>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
    offset?: number;
    ilike?: Record<string, string>;
    gte?: Record<string, any>;
    lte?: Record<string, any>;
    gt?: Record<string, any>;
    lt?: Record<string, any>;
  } = {}): Promise<ApiResponse<T[]> | ApiError> {
    // Use Lambda query-table instead of direct REST calls
    return this.request<T[]>(`/api/functions/query-table`, {
      method: 'POST',
      body: JSON.stringify({
        table,
        select: options.select,
        eq: options.eq,
        order: options.order,
        limit: options.limit,
        offset: options.offset,
        ilike: options.ilike,
        gte: options.gte,
        lte: options.lte,
        gt: options.gt,
        lt: options.lt,
      }),
    });
  }

  async insert<T>(table: string, data: any): Promise<ApiResponse<T> | ApiError> {
    // Use Lambda mutate-table for all insert operations
    return this.request<T>(`/api/functions/mutate-table`, {
      method: 'POST',
      body: JSON.stringify({
        table,
        operation: 'insert',
        data,
      }),
    });
  }

  async update<T>(table: string, data: any, eq: Record<string, any>): Promise<ApiResponse<T> | ApiError> {
    // Use Lambda mutate-table for all update operations
    return this.request<T>(`/api/functions/mutate-table`, {
      method: 'POST',
      body: JSON.stringify({
        table,
        operation: 'update',
        data,
        where: eq,
      }),
    });
  }

  async delete(table: string, eq: Record<string, any>): Promise<ApiResponse<void> | ApiError> {
    // Use Lambda mutate-table for all delete operations
    return this.request<void>(`/api/functions/mutate-table`, {
      method: 'POST',
      body: JSON.stringify({
        table,
        operation: 'delete',
        where: eq,
      }),
    });
  }

  // RPC calls (for stored procedures/functions)
  async rpc<T>(functionName: string, params: Record<string, any> = {}): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(`/rpc/${functionName}`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Function invocations (for Lambda functions)
  async invoke<T>(functionName: string, options: {
    body?: any;
    headers?: Record<string, string>;
  } = {}): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(`/api/functions/${functionName}`, {
      method: 'POST',
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: options.headers,
    });
  }

  /**
   * Invoke a public Lambda function (no authentication required)
   * Used for self-registration and other public endpoints
   */
  async invokePublic<T>(functionName: string, options: {
    body?: any;
    headers?: Record<string, string>;
  } = {}): Promise<ApiResponse<T> | ApiError> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    
    try {
      const requestId = crypto.randomUUID();
      const correlationId = sessionStorage.getItem('sessionId') || SESSION_ID;
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-Correlation-ID': correlationId,
        ...getCSRFHeader(),
        ...options.headers,
      };
      
      const response = await fetch(`${API_BASE_URL}/api/functions/${functionName}`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      
      clearTimeout(timeoutId);
      const responseRequestId = response.headers.get('X-Request-ID') || requestId;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`,
            code: errorData.code,
            status: response.status,
            requestId: responseRequestId,
          },
        };
      }

      const responseData = await response.json();
      
      if (responseData && typeof responseData === 'object' && 'data' in responseData) {
        return { 
          data: responseData.data ?? [], 
          error: null, 
          requestId: responseRequestId 
        };
      }
      
      return { 
        data: responseData ?? [], 
        error: null, 
        requestId: responseRequestId 
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          data: null,
          error: { message: 'Request timeout', code: 'TIMEOUT' },
        };
      }
      
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : 'Network error' },
      };
    }
  }

  /**
   * Invoca uma Lambda function via API Gateway
   * @param functionName - Nome da função Lambda
   * @param payload - Dados a enviar para a função (será enviado como body)
   * @deprecated Use apiClient.invoke() instead for consistency
   */
  async lambda<T>(
    functionName: string,
    payload?: Record<string, any>
  ): Promise<ApiResponse<T> | ApiError> {
    // Handle both old format (direct payload) and new format ({ body: ... })
    const body = payload?.body !== undefined ? payload.body : payload;
    return this.request<T>(`/api/functions/${functionName}`, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * GET request genérico
   */
  async get<T>(endpoint: string): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  /**
   * POST request genérico
   */
  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request genérico
   */
  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new ApiClient();