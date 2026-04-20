import { WistMailError, ErrorCode } from '@wistmail/shared'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

type RequestOptions = {
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
    signal: options?.signal,
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null)

    if (errorBody?.error) {
      throw new WistMailError(
        errorBody.error.code || ErrorCode.INTERNAL_ERROR,
        errorBody.error.message || 'An error occurred',
        res.status,
        errorBody.error.details,
      )
    }

    throw new WistMailError(
      ErrorCode.INTERNAL_ERROR,
      `Request failed with status ${res.status}`,
      res.status,
    )
  }

  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

export const api = {
  get<T>(path: string, options?: RequestOptions) {
    return request<T>('GET', path, undefined, options)
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return request<T>('POST', path, body, options)
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return request<T>('PATCH', path, body, options)
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return request<T>('PUT', path, body, options)
  },

  delete<T>(path: string, options?: RequestOptions) {
    return request<T>('DELETE', path, undefined, options)
  },
}
