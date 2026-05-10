import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminBillingPaymentPage from './page'

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/billing/payment',
}))

describe('AdminBillingPaymentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the heading', () => {
    mockGet.mockResolvedValue({ data: [] })
    render(<AdminBillingPaymentPage />)
    expect(
      screen.getByRole('heading', { name: /payment methods/i }),
    ).toBeInTheDocument()
  })

  it('renders the empty state when no methods exist', async () => {
    mockGet.mockResolvedValue({ data: [] })
    render(<AdminBillingPaymentPage />)
    await waitFor(() => {
      expect(
        screen.getByText(/no payment methods yet/i),
      ).toBeInTheDocument()
    })
  })

  it('renders saved methods returned by the API', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          method: 'mtn_momo',
          msisdn: '250788000000',
          lastUsedAt: new Date().toISOString(),
          attempts: 2,
        },
        {
          method: 'airtel_money',
          msisdn: '250733111222',
          lastUsedAt: new Date().toISOString(),
          attempts: 1,
        },
      ],
    })
    render(<AdminBillingPaymentPage />)
    await waitFor(() => {
      expect(screen.getByText('MTN MoMo')).toBeInTheDocument()
    })
    expect(screen.getByText('Airtel Money')).toBeInTheDocument()
    // Default pill on the first method only.
    expect(screen.getAllByText(/default/i).length).toBeGreaterThan(0)
  })
})
