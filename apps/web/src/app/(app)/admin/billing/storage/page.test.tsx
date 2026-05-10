import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminBillingStoragePage from './page'

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/billing/storage',
}))

describe('AdminBillingStoragePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading', () => {
    mockGet.mockResolvedValue({ data: null })
    render(<AdminBillingStoragePage />)
    expect(
      screen.getByRole('heading', { name: 'Storage' }),
    ).toBeInTheDocument()
  })

  it('renders category buckets and per-user list', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/billing/storage-breakdown') {
        return Promise.resolve({
          data: {
            totalBytes: 17_500,
            byCategory: {
              mail: 5_000,
              attachments: 10_000,
              drafts: 500,
              trash: 2_000,
            },
            byUser: [
              { userId: 'u_1', name: 'Alex', bytes: 7_500 },
              { userId: 'u_2', name: 'Bea', bytes: 0 },
            ],
          },
        })
      }
      if (path === '/api/v1/billing/subscription') {
        return Promise.resolve({
          data: {
            seats: 2,
            plan: {
              name: 'Team',
              perSeatCents: 300,
              includedStorageMbPerSeat: 1024,
            },
          },
        })
      }
      return Promise.resolve({ data: null })
    })
    render(<AdminBillingStoragePage />)
    await waitFor(() => {
      expect(screen.getByText('Mail')).toBeInTheDocument()
    })
    expect(screen.getByText('Alex')).toBeInTheDocument()
    expect(screen.getByText('Bea')).toBeInTheDocument()
  })

  it('renders the empty state when no users have any usage', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/billing/storage-breakdown') {
        return Promise.resolve({
          data: {
            totalBytes: 0,
            byCategory: { mail: 0, attachments: 0, drafts: 0, trash: 0 },
            byUser: [],
          },
        })
      }
      return Promise.resolve({ data: null })
    })
    render(<AdminBillingStoragePage />)
    await waitFor(() => {
      expect(screen.getByText(/no usage yet/i)).toBeInTheDocument()
    })
  })
})
