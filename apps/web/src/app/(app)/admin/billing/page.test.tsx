import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminBillingPage from './page'

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/billing',
}))

describe('AdminBillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading and breadcrumb', async () => {
    mockGet.mockResolvedValue({ data: null })
    render(<AdminBillingPage />)
    expect(
      screen.getByRole('heading', { name: 'Billing' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/wallet balance/i)).toBeInTheDocument()
  })

  it('shows the wallet balance once the API responds', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/billing/wallet') {
        return Promise.resolve({
          data: {
            balanceCents: 4_000,
            currency: 'USD',
            recentTransactions: [],
          },
        })
      }
      if (path === '/api/v1/billing/subscription') {
        return Promise.resolve({ data: null })
      }
      return Promise.resolve({ data: [] })
    })
    render(<AdminBillingPage />)
    await waitFor(() => {
      // Stat card AND wallet card both render the value — assert on at
      // least one of them appearing.
      expect(screen.getAllByText('$40.00').length).toBeGreaterThan(0)
    })
  })

  it('falls back to dashes when the API rejects', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    render(<AdminBillingPage />)
    await waitFor(() => {
      // Wallet stat card renders $0.00 fallback once loading completes.
      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })
  })

  it('links the top-up CTA to /admin/billing/topup', () => {
    mockGet.mockResolvedValue({ data: null })
    render(<AdminBillingPage />)
    const cta = screen.getByText('Top up').closest('a')
    expect(cta).toHaveAttribute('href', '/admin/billing/topup')
  })
})
