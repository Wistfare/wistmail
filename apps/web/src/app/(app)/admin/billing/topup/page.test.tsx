import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminBillingTopupPage from './page'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPush = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => '/admin/billing/topup',
}))

describe('AdminBillingTopupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: { balanceCents: 0, currency: 'USD' } })
  })

  it('renders the page heading and form', () => {
    render(<AdminBillingTopupPage />)
    expect(
      screen.getByRole('heading', { name: /top up wallet/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument()
  })

  it('submits the form to /api/v1/billing/topup', async () => {
    mockPost.mockResolvedValue({
      data: {
        id: 'coa_x',
        status: 'pending',
        providerCollectionId: 'col_stub_1234567890abc',
        providerStatus: 'pending',
      },
    })
    render(<AdminBillingTopupPage />)
    fireEvent.change(screen.getByLabelText(/mobile number/i), {
      target: { value: '250788000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm top-up/i }))
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/billing/topup',
        expect.objectContaining({
          method: 'mtn_momo',
          msisdn: '250788000000',
        }),
      )
    })
  })

  it('surfaces the API error message when topup fails', async () => {
    mockPost.mockRejectedValue(new Error('insufficient agent float'))
    render(<AdminBillingTopupPage />)
    fireEvent.change(screen.getByLabelText(/mobile number/i), {
      target: { value: '250788000000' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm top-up/i }))
    await waitFor(() => {
      expect(screen.getByText(/insufficient agent float/i)).toBeInTheDocument()
    })
  })
})
