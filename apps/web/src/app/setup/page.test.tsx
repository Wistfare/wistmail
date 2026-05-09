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
    // Default: fresh install, no session yet — V3 status response shape:
    // `{ hasSession, inProgress, step, domainId }`.
    mockGet.mockResolvedValue({
      hasSession: false,
      inProgress: false,
      step: null,
      domainId: null,
    })
  })

  it('renders domain step initially', () => {
    render(<SetupPage />)
    // V3 layout: heading "Add your domain" lives only in the form pane;
    // sidebar uses step labels (Domain / DNS / Account / Done) + descs
    // (Verify your domain / Configure DNS records / …).
    expect(screen.getByRole('heading', { name: 'Add your domain' })).toBeInTheDocument()
  })

  it('shows domain input with placeholder', () => {
    render(<SetupPage />)
    expect(screen.getByPlaceholderText('example.com')).toBeInTheDocument()
  })

  it('shows the Domain name label', () => {
    render(<SetupPage />)
    expect(screen.getByText('Domain name')).toBeInTheDocument()
  })

  it('shows the Continue CTA', () => {
    render(<SetupPage />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('does not submit when domain is empty', () => {
    render(<SetupPage />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('renders all 4 step labels in the wizard sidebar', () => {
    render(<SetupPage />)
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('DNS')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders the V3 step descriptions in the wizard sidebar', () => {
    render(<SetupPage />)
    expect(screen.getByText('Verify your domain')).toBeInTheDocument()
    expect(screen.getByText('Configure DNS records')).toBeInTheDocument()
    expect(screen.getByText('Create admin account')).toBeInTheDocument()
    expect(screen.getByText('Setup complete')).toBeInTheDocument()
  })

  it('redirects to /inbox if a session already exists', async () => {
    mockGet.mockResolvedValue({
      hasSession: true,
      inProgress: false,
      step: null,
      domainId: null,
    })
    render(<SetupPage />)
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/inbox')
    })
  })

  it('submits domain via /domain/check + /domain and moves to DNS step', async () => {
    mockPost
      .mockResolvedValueOnce({
        domainExists: true,
        resolvedIps: ['1.2.3.4'],
        serverIp: '1.2.3.4',
      })
      .mockResolvedValueOnce({
        id: 'dom_1',
        name: 'example.com',
        records: [
          {
            type: 'MX',
            name: 'example.com',
            value: 'mx.example.com',
            priority: 10,
            verified: false,
          },
        ],
        serverIp: '1.2.3.4',
      })

    render(<SetupPage />)
    fireEvent.change(screen.getByPlaceholderText('example.com'), {
      target: { value: 'example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/api/v1/setup/domain/check', {
        name: 'example.com',
      })
      expect(mockPost).toHaveBeenCalledWith('/api/v1/setup/domain', {
        name: 'example.com',
      })
    })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Configure DNS records' }),
      ).toBeInTheDocument()
    })
  })

  it('shows error message when domain submission fails', async () => {
    mockPost
      .mockResolvedValueOnce({
        domainExists: true,
        resolvedIps: [],
        serverIp: '1.2.3.4',
      })
      .mockRejectedValueOnce(new Error('Domain already in use'))
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({
          hasSession: false,
          inProgress: false,
          step: null,
          domainId: null,
        })
      }
      return Promise.reject(new Error('Domain already in use'))
    })

    render(<SetupPage />)
    fireEvent.change(screen.getByPlaceholderText('example.com'), {
      target: { value: 'bad.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(screen.getByText('Domain already in use')).toBeInTheDocument()
    })
  })

  it('renders the V3 brandmark', () => {
    render(<SetupPage />)
    // V3 BrandMark renders the literal node text "WISTFARE MAIL" plus
    // the wistfare_mail_logo.png image (alt text exposes it via role).
    expect(screen.getByText('WISTFARE MAIL')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /Wistfare Mail logo/ }),
    ).toBeInTheDocument()
  })

  it('resumes setup if it is in progress', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/setup/status') {
        return Promise.resolve({
          hasSession: false,
          inProgress: true,
          step: 'dns',
          domainId: 'dom_1',
        })
      }
      if (path === '/api/v1/setup/domain/records') {
        return Promise.resolve({
          name: 'example.com',
          records: [
            {
              type: 'MX',
              name: 'example.com',
              value: 'mx.example.com',
              verified: false,
            },
          ],
          serverIp: '1.2.3.4',
        })
      }
      return Promise.resolve({})
    })

    render(<SetupPage />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Configure DNS records' }),
      ).toBeInTheDocument()
    })
  })
})
