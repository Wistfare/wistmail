import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminBillingInvoicesPage from './page'

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/billing/invoices',
}))

describe('AdminBillingInvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the heading and table headers', async () => {
    mockGet.mockResolvedValue({ data: [], limit: 25, offset: 0 })
    render(<AdminBillingInvoicesPage />)
    expect(
      screen.getByRole('heading', { name: /invoices/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument()
    })
  })

  it('renders ledger rows with formatted amounts', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path.startsWith('/api/v1/billing/wallet/transactions')) {
        return Promise.resolve({
          data: [
            {
              id: 'wtx_1',
              amountCents: 600,
              balanceAfterCents: 600,
              reason: 'topup',
              note: null,
              provider: 'wistfare_collections',
              providerRef: 'col_stub_1',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'wtx_2',
              amountCents: -300,
              balanceAfterCents: 300,
              reason: 'renewal_charge',
              note: null,
              provider: null,
              providerRef: null,
              createdAt: new Date().toISOString(),
            },
          ],
          limit: 25,
          offset: 0,
        })
      }
      return Promise.resolve({ data: null })
    })
    render(<AdminBillingInvoicesPage />)
    await waitFor(() => {
      expect(screen.getByText('Top up')).toBeInTheDocument()
    })
    expect(screen.getByText(/\+\$6\.00/)).toBeInTheDocument()
    expect(screen.getByText(/−\$3\.00/)).toBeInTheDocument()
  })
})
