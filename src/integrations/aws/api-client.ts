import { cognitoAuth } from './cognito-client-simple';
import { getCSRFHeader } from '@/lib/csrf-protection';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface ApiResponse<T = any> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
    status?: number;
  };
}

class ApiClient {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const session = await cognitoAuth.getCurrentSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...getCSRFHeader(), // Add CSRF protection to all requests
    };

    if (session) {
      // Use idToken for Cognito User Pools Authorizer (contains custom attributes)
      headers['Authorization'] = `Bearer ${session.idToken}`;
      
      // DEBUG: Log token info and validate organization ID format
      try {
        const payload = JSON.parse(atob(session.idToken.split('.')[1]));
        const orgId = payload['custom:organization_id'];
        
        console.log('🔐 API Client: Token payload', {
          sub: payload.sub,
          email: payload.email,
          orgId: orgId,
          roles: payload['custom:roles'],
          exp: new Date(payload.exp * 1000).toISOString(),
        });
        
        // CRITICAL: Validate UUID format - force logout if invalid
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (orgId && !uuidRegex.test(orgId)) {
          console.error('🔐 API Client: INVALID organization ID format detected!', orgId);
          console.error('🔐 API Client: Forcing logout to get new token...');
          await cognitoAuth.signOut();
          window.location.href = '/login?reason=session_expired';
          throw new Error('Session expired. Please login again.');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Session expired')) {
          throw e;
        }
        console.warn('🔐 API Client: Could not decode token', e);
      }
    } else {
      console.warn('🔐 API Client: No session available');
    }

    return headers;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T> | ApiError> {
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          data: null,
          error: {
            message: errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`,
            code: errorData.code,
            status: response.status,
          },
        };
      }

      const responseData = await response.json();
      
      // Handle Lambda response format: { success: true, data: [...] }
      // Extract the inner data if present
      if (responseData && typeof responseData === 'object' && 'data' in responseData) {
        return { data: responseData.data, error: null };
      }
      
      // Return as-is for other formats
      return { data: responseData, error: null };
    } catch (error) {
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
    ilike?: Record<string, string>;
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
        ilike: options.ilike,
      }),
    });
  }

  async insert<T>(table: string, data: any): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(`/${table}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update<T>(table: string, data: any, eq: Record<string, any>): Promise<ApiResponse<T> | ApiError> {
    const params = new URLSearchParams();
    Object.entries(eq).forEach(([key, value]) => {
      params.append(`${key}.eq`, String(value));
    });

    return this.request<T>(`/${table}?${params.toString()}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(table: string, eq: Record<string, any>): Promise<ApiResponse<void> | ApiError> {
    const params = new URLSearchParams();
    Object.entries(eq).forEach(([key, value]) => {
      params.append(`${key}.eq`, String(value));
    });

    return this.request<void>(`/${table}?${params.toString()}`, {
      method: 'DELETE',
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
   * Invoca uma Lambda function via API Gateway
   * @param functionName - Nome da função Lambda
   * @param payload - Dados a enviar para a função
   */
  async lambda<T>(
    functionName: string,
    payload?: Record<string, any>
  ): Promise<ApiResponse<T> | ApiError> {
    return this.request<T>(`/api/functions/${functionName}`, {
      method: 'POST',
      body: payload ? JSON.stringify(payload) : undefined,
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
}

export const apiClient = new ApiClient();