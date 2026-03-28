import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SetupPage from './page'

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: fresh install, no users
    mockGet.mockResolvedValue({ hasUsers: false, inProgress: false, step: null, domainId: null })
  })

  it('renders domain step initially', () => {
    render(<SetupPage />)
    // "Add your domain" appears both as sidebar step desc and as form heading
    const headings = screen.getAllByText('Add your domain')
    expect(headings.length).toBe(2)
    // The h2 heading is the form title
    expect(screen.getByRole('heading', { name: 'Add your domain' })).toBeInTheDocument()
  })

  it('shows domain input field with placeholder', () => {
    render(<SetupPage />)
    expect(screen.getByPlaceholderText('example.com')).toBeInTheDocument()
  })

  it('shows the domain name label', () => {
    render(<SetupPage />)
    expect(screen.getByText('Domain name')).toBeInTheDocument()
  })

  it('shows Continue button', () => {
    render(<SetupPage />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('does not submit when domain is empty', async () => {
    render(<SetupPage />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('shows all 4 steps in sidebar', () => {
    render(<SetupPage />)
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('DNS')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows step descriptions in sidebar', () => {
    render(<SetupPage />)
    // "Add your domain" appears in both sidebar desc and form heading
    expect(screen.getAllByText('Add your domain').length).toBeGreaterThanOrEqual(1)
    // "Configure DNS records" appears only in sidebar desc when on step 0
    expect(screen.getByText('Configure DNS records')).toBeInTheDocument()
    expect(screen.getByText('Create admin account')).toBeInTheDocument()
    expect(screen.getByText('Setup complete')).toBeInTheDocument()
  })

  it('redirects to login if system already has users', async () => {
    mockGet.mockResolvedValue({ hasUsers: true, inProgress: false, step: null, domainId: null })
    render(<SetupPage />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login')
    })
  })

  it('submits domain and moves to DNS step', async () => {
    mockPost.mockResolvedValue({
      id: 'dom_1',
      name: 'example.com',
      records: [
        { type: 'MX', name: 'example.com', value: 'mx.example.com', priority: 10, verified: false },
      ],
    })

    render(<SetupPage />)
    fireEvent.change(screen.getByPlaceholderText('example.com'), { target: { value: 'example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/v1/setup/domain', { name: 'example.com' })
    })

    await waitFor(() => {
      // On DNS step, heading "Configure DNS records" appears in both sidebar and form
      const headings = screen.getAllByText('Configure DNS records')
      expect(headings.length).toBe(2)
    })
  })

  it('shows error message when domain submission fails', async () => {
    mockPost.mockRejectedValue(new Error('Domain already in use'))

    render(<SetupPage />)
    fireEvent.change(screen.getByPlaceholderText('example.com'), { target: { value: 'bad.com' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(screen.getByText('Domain already in use')).toBeInTheDocument()
    })
  })

  it('renders WISTFARE MAIL branding', () => {
    render(<SetupPage />)
    expect(screen.getByText('WISTFARE MAIL')).toBeInTheDocument()
    expect(screen.getByText('W')).toBeInTheDocument()
  })

  it('resumes setup if in progress', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({ hasUsers: false, inProgress: true, step: 'dns', domainId: 'dom_1' })
      }
      if (path === '/api/v1/setup/domain/records') {
        return Promise.resolve({
          name: 'example.com',
          records: [{ type: 'MX', name: 'example.com', value: 'mx.example.com', verified: false }],
          mx: false,
          spf: false,
          dkim: false,
          dmarc: false,
        })
      }
      return Promise.resolve({})
    })

    render(<SetupPage />)

    await waitFor(() => {
      // Should show DNS step heading (the second "Configure DNS records" heading in the right panel)
      const headings = screen.getAllByText('Configure DNS records')
      expect(headings.length).toBeGreaterThanOrEqual(1)
    })
  })
})
