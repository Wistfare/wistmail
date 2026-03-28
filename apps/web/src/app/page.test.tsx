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

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading spinner initially', () => {
    // Never-resolving promise so the component stays in loading state
    mockGet.mockReturnValue(new Promise(() => {}))
    const { container } = render(<Home />)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('redirects to setup when no users exist', async () => {
    mockGet.mockResolvedValue({ hasUsers: false, inProgress: false })
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/setup')
    })
  })

  it('redirects to setup when setup is in progress', async () => {
    mockGet.mockResolvedValue({ hasUsers: false, inProgress: true })
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/setup')
    })
  })

  it('redirects to login when users exist but no session', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({ hasUsers: true, inProgress: false })
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

  it('redirects to inbox when user is logged in', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({ hasUsers: true, inProgress: false })
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

  it('redirects to login when API call fails', async () => {
    mockGet.mockRejectedValue(new Error('API is down'))
    render(<Home />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })
})
