import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminAnalyticsPage from './page'

const mockGet = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/analytics',
}))

const sampleResponse = {
  data: {
    kpis: {
      sent: 1234,
      delivered: 1180,
      deliveredPct: 95.6,
      bounced: 20,
      bouncePct: 1.6,
      opened: 700,
      openPct: 56.7,
      clicked: 120,
      clickPct: 9.7,
      avgDeliverMs: 12_000,
    },
    dailySent: Array.from({ length: 30 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      count: i,
    })),
    topSenders: [
      { userId: 'usr_1', name: 'Alice Owner', count: 500 },
      { userId: null, name: 'noreply@wistmail.example', count: 100 },
    ],
    rangeDays: 30,
  },
}

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue(sampleResponse)
  })

  it('renders the page heading', async () => {
    render(<AdminAnalyticsPage />)
    expect(screen.getByRole('heading', { name: 'Analytics' })).toBeInTheDocument()
  })

  it('shows the sent KPI once the API resolves', async () => {
    render(<AdminAnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByText('1,234')).toBeInTheDocument()
    })
    // Delivered % surfaces somewhere — the value is unique enough.
    expect(screen.getByText('95.6%')).toBeInTheDocument()
    expect(screen.getByText('1.6%')).toBeInTheDocument()
  })

  it('renders the active senders list', async () => {
    render(<AdminAnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByText('Alice Owner')).toBeInTheDocument()
    })
    expect(screen.getByText('noreply@wistmail.example')).toBeInTheDocument()
  })

  it('shows an empty state when no senders are returned', async () => {
    mockGet.mockResolvedValueOnce({
      data: { ...sampleResponse.data, topSenders: [] },
    })
    render(<AdminAnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByText(/No outbound mail/i)).toBeInTheDocument()
    })
  })
})
