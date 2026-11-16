import { auth } from './firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export function resolveApiUrl(url: string): string {
  if (url.startsWith('/api') && API_BASE_URL) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function doFetch(url: string, options: RequestInit, forceRefresh = false): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string>) || {}),
  };

  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken(forceRefresh);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without token if refresh fails
    }
  }

  return fetch(resolveApiUrl(url), {
    ...options,
    headers,
  });
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  let response = await doFetch(url, options, false);

  if (response.status === 401 && auth.currentUser) {
    response = await doFetch(url, options, true);
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Unexpected response format' };
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `Request failed with HTTP ${response.status}`,
      response.status,
      data?.code
    );
  }

  return data as T;
}
