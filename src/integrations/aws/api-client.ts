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
      headers['Authorization'] = `Bearer ${session.accessToken}`;
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
            message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
            code: errorData.code,
            status: response.status,
          },
        };
      }

      const data = await response.json();
      return { data, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  // Generic CRUD operations
  async select<T>(table: string, options: {
    select?: string;
    eq?: Record<string, any>;
    order?: { column: string; ascending?: boolean };
    limit?: number;
  } = {}): Promise<ApiResponse<T[]> | ApiError> {
    const params = new URLSearchParams();
    
    if (options.select) params.append('select', options.select);
    if (options.eq) {
      Object.entries(options.eq).forEach(([key, value]) => {
        params.append(`${key}.eq`, String(value));
      });
    }
    if (options.order) {
      params.append('order', `${options.order.column}.${options.order.ascending !== false ? 'asc' : 'desc'}`);
    }
    if (options.limit) params.append('limit', String(options.limit));

    const queryString = params.toString();
    const endpoint = `/${table}${queryString ? `?${queryString}` : ''}`;
    
    return this.request<T[]>(endpoint);
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
    return this.request<T>(`/functions/${functionName}`, {
      method: 'POST',
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: options.headers,
    });
  }
}

export const apiClient = new ApiClient();