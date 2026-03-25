import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from './api-client'
import { WistMailError } from '@wistmail/shared'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

describe('api client', () => {
  it('makes GET requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'test' }),
    })

    const result = await api.get('/api/v1/health')
    expect(result).toEqual({ data: 'test' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('makes POST requests with body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'eml_123' }),
    })

    const result = await api.post('/api/v1/emails', {
      from: 'a@test.com',
      to: 'b@test.com',
      subject: 'Test',
    })

    expect(result).toEqual({ id: 'eml_123' })
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/emails',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          from: 'a@test.com',
          to: 'b@test.com',
          subject: 'Test',
        }),
      }),
    )
  })

  it('throws WistMailError on API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: { field: 'email' },
          },
        }),
    })

    await expect(api.post('/api/v1/emails', {})).rejects.toThrow(WistMailError)

    try {
      await api.post('/api/v1/emails', {})
    } catch (err) {
      expect(err).toBeInstanceOf(WistMailError)
      const error = err as WistMailError
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(400)
    }
  })

  it('handles 204 No Content responses', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
    })

    const result = await api.delete('/api/v1/emails/123')
    expect(result).toBeUndefined()
  })

  it('makes PATCH requests', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ updated: true }),
    })

    const result = await api.patch('/api/v1/webhooks/123', { active: false })
    expect(result).toEqual({ updated: true })
  })

  it('includes credentials for cookies', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })

    await api.get('/test')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
