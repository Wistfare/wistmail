import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminDomainsPage from './page'

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/domains',
}))

const verifiedDomain = {
  id: 'dom_1',
  name: 'wistmail.example',
  verified: true,
  status: 'verified',
  mxVerified: true,
  spfVerified: true,
  dkimVerified: true,
  dmarcVerified: true,
  messages30d: 240,
  lastCheckedAt: '2026-05-09T10:00:00Z',
  createdAt: '2026-04-01T10:00:00Z',
}

const partialDomain = {
  ...verifiedDomain,
  id: 'dom_2',
  name: 'partial.example',
  verified: false,
  status: 'pending',
  dkimVerified: false,
  dmarcVerified: false,
  messages30d: 5,
}

describe('AdminDomainsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading', () => {
    mockGet.mockResolvedValue({ data: [] })
    render(<AdminDomainsPage />)
    expect(screen.getByRole('heading', { name: 'Domains' })).toBeInTheDocument()
  })

  it('shows the empty state when no domains exist', async () => {
    mockGet.mockResolvedValue({ data: [] })
    render(<AdminDomainsPage />)
    await waitFor(() => {
      expect(screen.getByText(/No sending domains yet/i)).toBeInTheDocument()
    })
  })

  it('renders a domain row with usage stats', async () => {
    mockGet.mockResolvedValue({ data: [verifiedDomain] })
    render(<AdminDomainsPage />)
    await waitFor(() => {
      expect(screen.getByText('wistmail.example')).toBeInTheDocument()
    })
    expect(screen.getByText('240')).toBeInTheDocument()
  })

  it('surfaces a warning card when a domain has DNS issues', async () => {
    mockGet.mockResolvedValue({ data: [partialDomain] })
    render(<AdminDomainsPage />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText(/1 domain has DNS issues/i)).toBeInTheDocument()
  })

  it('does not surface the warning card when every domain is fully verified', async () => {
    mockGet.mockResolvedValue({ data: [verifiedDomain] })
    render(<AdminDomainsPage />)
    await waitFor(() => {
      expect(screen.getByText('wistmail.example')).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
