import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import Home from './page'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace }),
}))

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

/**
 * V3 root-route gating. The Home page calls `/api/v1/setup/status` and
 * decides where to send the user:
 *
 * - hasSession: true            → /inbox
 * - inProgress: true            → /setup (resume)
 * - else: ask /api/v1/auth/session
 *   - session.user present       → /inbox
 *   - session.user null         → /login
 * - any error                   → /login
 */
describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading spinner initially', () => {
    // Never-resolving promise so the component stays in loading state.
    mockGet.mockReturnValue(new Promise(() => {}))
    const { container } = render(<Home />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('redirects to /setup when setup is still in progress', async () => {
    mockGet.mockResolvedValue({ hasSession: false, inProgress: true })
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/setup')
    })
  })

  it('redirects to /login when there is no session and no setup in progress', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({ hasSession: false, inProgress: false })
      }
      if (path === '/api/v1/auth/session') {
        return Promise.resolve({ user: null })
      }
      return Promise.resolve({})
    })
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })

  it('redirects to /inbox when status reports an active session', async () => {
    mockGet.mockResolvedValue({ hasSession: true, inProgress: false })
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/inbox')
    })
  })

  it('redirects to /inbox when /auth/session resolves to a user', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({ hasSession: false, inProgress: false })
      }
      if (path === '/api/v1/auth/session') {
        return Promise.resolve({ user: { setupComplete: true } })
      }
      return Promise.resolve({})
    })
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/inbox')
    })
  })

  it('redirects to /login when the API call fails', async () => {
    mockGet.mockRejectedValue(new Error('API is down'))
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })
})
