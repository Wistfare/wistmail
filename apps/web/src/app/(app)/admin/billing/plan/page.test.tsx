import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminBillingPlanPage from './page'

const mockGet = vi.fn()
const mockPost = vi.fn()

vi.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/billing/plan',
}))

describe('AdminBillingPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page heading', () => {
    mockGet.mockResolvedValue({ data: [] })
    render(<AdminBillingPlanPage />)
    expect(
      screen.getByRole('heading', {
        name: /choose the plan that fits your team/i,
      }),
    ).toBeInTheDocument()
  })

  it('renders all four lineup tiers from the catalog', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/billing/plans') {
        return Promise.resolve({
          data: [
            {
              id: 'p_team',
              code: 'team',
              name: 'Team',
              description: 'Best fit',
              perSeatCents: 300,
              includedStorageMbPerSeat: 1024,
              trialDays: 7,
              currency: 'USD',
              features: [{ key: 'apps.mail', label: 'Mail', value: true }],
            },
          ],
        })
      }
      if (path === '/api/v1/billing/subscription') {
        return Promise.resolve({ data: null })
      }
      return Promise.resolve({ data: [] })
    })

    const { container } = render(<AdminBillingPlanPage />)
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument()
    })
    // Each placeholder card is identified by data-plan-code so we don't
    // collide on shared copy like "Free" appearing as both tier name and
    // price.
    expect(container.querySelector('[data-plan-code="free"]')).toBeTruthy()
    expect(container.querySelector('[data-plan-code="business"]')).toBeTruthy()
    expect(container.querySelector('[data-plan-code="enterprise"]')).toBeTruthy()
  })

  it('flags the active plan as current', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/billing/plans') {
        return Promise.resolve({
          data: [
            {
              id: 'p_team',
              code: 'team',
              name: 'Team',
              description: null,
              perSeatCents: 300,
              includedStorageMbPerSeat: 1024,
              trialDays: 7,
              currency: 'USD',
              features: [],
            },
          ],
        })
      }
      if (path === '/api/v1/billing/subscription') {
        return Promise.resolve({
          data: {
            status: 'active',
            seats: 3,
            currentPeriodEnd: null,
            plan: {
              code: 'team',
              name: 'Team',
              perSeatCents: 300,
              currency: 'USD',
            },
          },
        })
      }
      return Promise.resolve({ data: null })
    })

    render(<AdminBillingPlanPage />)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /current plan/i }),
      ).toBeDisabled()
    })
  })
})
