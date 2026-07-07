// Centralized API client for the Jarvis Prime frontend.
//
// Usage:
//   import { api } from '@/lib/api-client';
//   const data = await api.get('/analytics/dashboard');
//   const result = await api.post('/outreach', { action: 'send_email', ... });
//
// Features:
//   - Base URL from environment variable (NEXT_PUBLIC_ENGINE_URL)
//   - Automatic authentication headers
//   - Structured error handling with typed errors
//   - Retry logic for transient failures (5xx, network errors)
//   - Request/response type safety via generics

interface ApiError {
  code: string;
  message: string;
  requestId?: string;
  stack?: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

class ApiClientError extends Error {
  statusCode: number;
  code: string;
  requestId?: string;

  constructor(message: string, statusCode: number, code: string, requestId?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

class ApiClient {
  private baseUrl: string;
  private secret: string;
  private clientId: string;
  private maxRetries: number;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:3001';
    this.secret = process.env.NEXT_PUBLIC_AUTOMATION_SECRET || 'dev-secret';
    this.clientId = process.env.NEXT_PUBLIC_CLIENT_ID || '';
    this.maxRetries = 3;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-automation-secret': this.secret,
    };
    if (this.clientId) {
      headers['x-client-id'] = this.clientId;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 0
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;

    try {
      const res = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        // Retry on 5xx errors
        if (res.status >= 500 && retries < this.maxRetries) {
          const delay = Math.pow(2, retries) * 500;
          await new Promise((r) => setTimeout(r, delay));
          return this.request<T>(method, path, body, retries + 1);
        }

        const errorBody = await res.json().catch(() => ({
          error: { code: 'UNKNOWN', message: res.statusText },
        }));

        throw new ApiClientError(
          errorBody.error?.message || res.statusText,
          res.status,
          errorBody.error?.code || 'UNKNOWN',
          errorBody.error?.requestId
        );
      }

      const json = await res.json();
      return json.data ?? json;
    } catch (err) {
      // Retry on network errors
      if (err instanceof TypeError && retries < this.maxRetries) {
        const delay = Math.pow(2, retries) * 500;
        await new Promise((r) => setTimeout(r, delay));
        return this.request<T>(method, path, body, retries + 1);
      }
      throw err;
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  /**
   * Health check — useful for connection status indicators.
   */
  async health(): Promise<{ status: string; providers: Record<string, boolean> }> {
    const url = `${this.baseUrl}/health`;
    const res = await fetch(url);
    return res.json();
  }

  /**
   * Deep health check — verifies DB connectivity.
   */
  async healthDeep(): Promise<{ status: string; checks: Record<string, unknown> }> {
    const url = `${this.baseUrl}/health/deep`;
    const res = await fetch(url);
    return res.json();
  }
}

// Singleton instance
export const api = new ApiClient();
export { ApiClientError };
export type { ApiResponse, ApiError };
