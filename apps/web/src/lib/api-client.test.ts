import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api-client'
import { WistMailError, ErrorCode } from '@wistmail/shared'

const originalFetch = globalThis.fetch

describe('api-client', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(status: number, body: unknown, ok = status >= 200 && status < 300) {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
    } as Response)
  }

  describe('api.get', () => {
    it('makes a GET request with correct URL and headers', async () => {
      mockFetch(200, { data: 'test' })
      await api.get('/api/v1/test')
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          credentials: 'include',
          body: undefined,
        }),
      )
    })

    it('returns parsed JSON response', async () => {
      mockFetch(200, { users: [{ id: 1, name: 'Alice' }] })
      const result = await api.get<{ users: { id: number; name: string }[] }>('/api/v1/users')
      expect(result).toEqual({ users: [{ id: 1, name: 'Alice' }] })
    })
  })

  describe('api.post', () => {
    it('makes a POST request with JSON body', async () => {
      mockFetch(200, { id: '1' })
      await api.post('/api/v1/domains', { name: 'example.com' })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/domains',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'example.com' }),
        }),
      )
    })

    it('makes a POST request without body', async () => {
      mockFetch(200, { ok: true })
      await api.post('/api/v1/verify')
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/verify',
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        }),
      )
    })
  })

  describe('api.patch', () => {
    it('makes a PATCH request with JSON body', async () => {
      mockFetch(200, { updated: true })
      await api.patch('/api/v1/users/1', { name: 'Bob' })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Bob' }),
        }),
      )
    })
  })

  describe('api.delete', () => {
    it('makes a DELETE request', async () => {
      mockFetch(200, { deleted: true })
      await api.delete('/api/v1/users/1')
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/users/1',
        expect.objectContaining({
          method: 'DELETE',
          body: undefined,
        }),
      )
    })
  })

  describe('error handling', () => {
    it('throws WistMailError with error details from response body', async () => {
      mockFetch(400, {
        error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid domain name' },
      }, false)

      await expect(api.post('/api/v1/domains', { name: '' })).rejects.toThrow(WistMailError)
    })

    it('throws WistMailError with correct error message', async () => {
      mockFetch(400, {
        error: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid domain name' },
      }, false)

      await expect(api.post('/api/v1/domains', { name: '' })).rejects.toThrow('Invalid domain name')
    })

    it('throws WistMailError with INTERNAL_ERROR when response has no error body', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      } as Response)

      await expect(api.get('/api/v1/broken')).rejects.toThrow('Request failed with status 500')
    })

    it('throws WistMailError with status code', async () => {
      mockFetch(403, {
        error: { code: ErrorCode.FORBIDDEN, message: 'Access denied' },
      }, false)

      try {
        await api.get('/api/v1/admin')
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(WistMailError)
        expect((err as WistMailError).statusCode).toBe(403)
        expect((err as WistMailError).code).toBe(ErrorCode.FORBIDDEN)
      }
    })
  })

  describe('204 No Content', () => {
    it('returns undefined for 204 responses', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error('no body')),
      } as Response)

      const result = await api.delete('/api/v1/users/1')
      expect(result).toBeUndefined()
    })
  })

  describe('custom options', () => {
    it('merges custom headers', async () => {
      mockFetch(200, {})
      await api.get('/api/v1/test', { headers: { 'X-Custom': 'value' } })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom': 'value',
          }),
        }),
      )
    })

    it('passes abort signal', async () => {
      const controller = new AbortController()
      mockFetch(200, {})
      await api.get('/api/v1/test', { signal: controller.signal })
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: controller.signal,
        }),
      )
    })
  })
})
