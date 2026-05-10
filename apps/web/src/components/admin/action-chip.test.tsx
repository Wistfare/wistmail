import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActionChip, categorizeAction } from './action-chip'

describe('categorizeAction', () => {
  it.each([
    ['auth.signin', 'auth'],
    ['mfa.totp.confirm', 'auth'],
    ['member.added', 'member'],
    ['user.created', 'member'],
    ['member.role_changed', 'role'],
    ['role.assigned', 'role'],
    ['billing.subscribe', 'billing'],
    ['plan.changed', 'billing'],
    ['topup.created', 'billing'],
    ['wallet.credited', 'billing'],
    ['member.removed', 'danger'],
    ['organization.deleted', 'danger'],
    ['something.unknown', 'neutral'],
  ])('maps %s to %s', (action, expected) => {
    expect(categorizeAction(action)).toBe(expected)
  })
})

describe('ActionChip', () => {
  it('renders the action label with underscores replaced by spaces', () => {
    render(<ActionChip action="member.role_changed" />)
    expect(screen.getByText('member.role changed')).toBeInTheDocument()
  })

  it('exposes the category on data-attribute', () => {
    const { container } = render(<ActionChip action="auth.signin" />)
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute('data-category')).toBe('auth')
  })

  it('falls back to neutral category for unrecognised actions', () => {
    const { container } = render(<ActionChip action="weird.thing" />)
    const el = container.firstChild as HTMLElement
    expect(el.getAttribute('data-category')).toBe('neutral')
  })
})
