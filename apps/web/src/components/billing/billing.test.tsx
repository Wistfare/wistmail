import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  PaymentMethodRow,
  PlanCard,
  TopupForm,
  TransactionRow,
  WalletCard,
} from './index'

/**
 * Component-level tests for the billing primitives. These keep us honest
 * about the contracts the pages depend on: money formatting, sign of the
 * transaction amount, and the topup form's submit-gating.
 */

describe('WalletCard', () => {
  it('formats balance in USD', () => {
    render(<WalletCard balanceCents={4_000} />)
    expect(screen.getByText('$40.00')).toBeInTheDocument()
  })

  it('renders the auto-renew pill when active', () => {
    render(<WalletCard balanceCents={0} autoRenew />)
    expect(screen.getByText(/auto-renew on/i)).toBeInTheDocument()
  })

  it('omits the auto-renew pill when undefined', () => {
    render(<WalletCard balanceCents={0} />)
    expect(screen.queryByText(/auto-renew/i)).not.toBeInTheDocument()
  })

  it('points the CTA at the supplied href', () => {
    render(<WalletCard balanceCents={0} topUpHref="/somewhere" />)
    const cta = screen.getByText(/top up wallet/i).closest('a')
    expect(cta).toHaveAttribute('href', '/somewhere')
  })
})

describe('PlanCard', () => {
  it('renders the price line', () => {
    render(
      <PlanCard
        code="team"
        name="Team"
        perSeatCents={300}
        ctaLabel="Choose Team"
      />,
    )
    expect(screen.getByText('$3.00')).toBeInTheDocument()
    expect(screen.getByText(/user/i)).toBeInTheDocument()
  })

  it('shows "Free" instead of $0.00 when perSeatCents is 0', () => {
    const { container } = render(
      <PlanCard code="free" name="Free" perSeatCents={0} ctaLabel="Pick" />,
    )
    // Two "Free" matches: tier name + price. Both must be rendered; the
    // price node is the larger 36px text, which we assert against directly.
    const priceNode = container.querySelector('.text-\\[36px\\]')
    expect(priceNode?.textContent).toBe('Free')
    // No "/user/mo" suffix when the price is free.
    expect(screen.queryByText(/\/ user \/ mo/i)).not.toBeInTheDocument()
  })

  it('disables the CTA when ctaDisabled is true', () => {
    render(
      <PlanCard
        code="team"
        name="Team"
        perSeatCents={300}
        ctaLabel="Current plan"
        ctaDisabled
      />,
    )
    const cta = screen.getByRole('button', { name: /current plan/i })
    expect(cta).toBeDisabled()
  })

  it('fires onCtaClick when not disabled', () => {
    const onCtaClick = vi.fn()
    render(
      <PlanCard
        code="team"
        name="Team"
        perSeatCents={300}
        ctaLabel="Choose"
        onCtaClick={onCtaClick}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /choose/i }))
    expect(onCtaClick).toHaveBeenCalledOnce()
  })
})

describe('TransactionRow', () => {
  it('renders a + prefix for credits and lime amount', () => {
    const { container } = render(
      <TransactionRow
        amountCents={500}
        reason="topup"
        createdAt={new Date()}
      />,
    )
    // The amount node carries .text-wm-accent AND tabular-nums — narrow on
    // the latter to skip the icon node which also renders in lime.
    const amount = container.querySelector('.tabular-nums')
    expect(amount?.textContent).toContain('+')
    expect(amount?.textContent).toContain('$5.00')
    expect(amount?.className).toContain('text-wm-accent')
  })

  it('renders a − prefix for debits in primary text', () => {
    const { container } = render(
      <TransactionRow
        amountCents={-300}
        reason="renewal_charge"
        createdAt={new Date()}
      />,
    )
    expect(container.textContent).toContain('−$3.00')
  })

  it('shows a friendly label for known reasons', () => {
    render(
      <TransactionRow
        amountCents={500}
        reason="trial_credit"
        createdAt={new Date()}
      />,
    )
    expect(screen.getByText(/trial credit/i)).toBeInTheDocument()
  })
})

describe('PaymentMethodRow', () => {
  it('shows the friendly method name', () => {
    render(<PaymentMethodRow method="mtn_momo" msisdn="250788000000" />)
    expect(screen.getByText('MTN MoMo')).toBeInTheDocument()
  })

  it('masks all but the last 4 digits of the msisdn', () => {
    render(<PaymentMethodRow method="airtel_money" msisdn="250788000123" />)
    expect(screen.getByText(/0123/)).toBeInTheDocument()
    expect(screen.queryByText('250788000123')).not.toBeInTheDocument()
  })

  it('renders the default pill when isDefault is true', () => {
    render(
      <PaymentMethodRow
        method="mtn_momo"
        msisdn="250788000000"
        isDefault
      />,
    )
    expect(screen.getByText(/default/i)).toBeInTheDocument()
  })
})

describe('TopupForm', () => {
  it('disables the confirm CTA until msisdn is valid', () => {
    render(<TopupForm />)
    const confirm = screen.getByRole('button', { name: /confirm top-up/i })
    expect(confirm).toBeDisabled()
  })

  it('enables the CTA once a valid msisdn is supplied', () => {
    render(<TopupForm />)
    const msisdn = screen.getByLabelText(/mobile number/i)
    fireEvent.change(msisdn, { target: { value: '250788000000' } })
    expect(
      screen.getByRole('button', { name: /confirm top-up/i }),
    ).not.toBeDisabled()
  })

  it('passes amount/method/msisdn to onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<TopupForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText(/mobile number/i), {
      target: { value: '250788000123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm top-up/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce()
    })
    expect(onSubmit).toHaveBeenCalledWith({
      amountCents: 2500,
      method: 'mtn_momo',
      msisdn: '250788000123',
    })
  })

  it('switches the selected payment method when the airtel pill is clicked', () => {
    const onSubmit = vi.fn()
    render(<TopupForm onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText(/airtel money/i))
    fireEvent.change(screen.getByLabelText(/mobile number/i), {
      target: { value: '250733111222' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirm top-up/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'airtel_money' }),
    )
  })

  it('rejects an msisdn with letters', () => {
    render(<TopupForm />)
    fireEvent.change(screen.getByLabelText(/mobile number/i), {
      target: { value: 'abc' },
    })
    expect(
      screen.getByRole('button', { name: /confirm top-up/i }),
    ).toBeDisabled()
  })
})
