import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Globe } from 'lucide-react'
import {
  AuthButton,
  AuthCard,
  AuthDivider,
  AuthHeading,
  AuthInput,
  AuthShell,
  BrandMark,
  OtpInput,
  WizardLayout,
  type WizardStep,
} from './index'

describe('AuthShell', () => {
  it('renders default decor + form children + footer', () => {
    render(
      <AuthShell footer="Self-hosted">
        <p>form</p>
      </AuthShell>,
    )
    expect(screen.getByText('WISTFARE MAIL')).toBeInTheDocument()
    expect(screen.getByText('YOUR INBOX,')).toBeInTheDocument()
    expect(screen.getByText('BUILT FOR FOCUS.')).toBeInTheDocument()
    expect(screen.getByText('form')).toBeInTheDocument()
    expect(screen.getByText('Self-hosted')).toBeInTheDocument()
  })

  it('overrides decor when provided', () => {
    render(
      <AuthShell decor={<span>custom-decor</span>}>
        <p>form</p>
      </AuthShell>,
    )
    expect(screen.getByText('custom-decor')).toBeInTheDocument()
    expect(screen.queryByText('YOUR INBOX,')).toBeNull()
  })
})

describe('BrandMark + AuthHeading + AuthCard + AuthDivider', () => {
  it('renders brandmark text', () => {
    render(<BrandMark />)
    expect(screen.getByText('WISTFARE MAIL')).toBeInTheDocument()
  })
  it('renders heading eyebrow / title / description', () => {
    render(<AuthHeading eyebrow="Sign in" title="Welcome" description="hi" />)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument()
    expect(screen.getByText('hi')).toBeInTheDocument()
  })
  it('AuthCard wraps children', () => {
    render(<AuthCard><p>x</p></AuthCard>)
    expect(screen.getByText('x')).toBeInTheDocument()
  })
  it('AuthDivider shows label', () => {
    render(<AuthDivider label="OR" />)
    expect(screen.getByText('OR')).toBeInTheDocument()
  })
})

describe('AuthInput', () => {
  it('shows label, takes value, surfaces error', () => {
    render(
      <AuthInput
        label="Email"
        value="x"
        onChange={() => {}}
        error="bad"
        icon={<Globe data-testid="icon" />}
      />,
    )
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByText('bad')).toBeInTheDocument()
    expect(screen.getByDisplayValue('x')).toBeInTheDocument()
  })

  it('toggles password reveal when reveal=true', () => {
    function H() {
      const [v, setV] = useState('secret')
      return <AuthInput label="Pwd" type="password" reveal value={v} onChange={(e) => setV(e.target.value)} />
    }
    render(<H />)
    const input = screen.getByDisplayValue('secret') as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: /Show password/ }))
    expect(input.type).toBe('text')
    fireEvent.click(screen.getByRole('button', { name: /Hide password/ }))
    expect(input.type).toBe('password')
  })
})

describe('AuthButton', () => {
  it('fires onClick and renders trailing icon', () => {
    const onClick = vi.fn()
    render(
      <AuthButton onClick={onClick} trailingIcon={<span data-testid="t">→</span>}>
        Go
      </AuthButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Go/ }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByTestId('t')).toBeInTheDocument()
  })

  it('disables and shows spinner when loading', () => {
    render(<AuthButton loading>Go</AuthButton>)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument()
  })
})

describe('OtpInput', () => {
  function H({ onComplete }: { onComplete?: (v: string) => void }) {
    const [v, setV] = useState('')
    return <OtpInput value={v} onChange={setV} onComplete={onComplete} />
  }

  it('renders 6 inputs by default', () => {
    render(<H />)
    expect(screen.getAllByLabelText(/Digit \d of 6/)).toHaveLength(6)
  })

  it('typing distributes single digits and fires onComplete on last', () => {
    const onComplete = vi.fn()
    render(<H onComplete={onComplete} />)
    const cells = screen.getAllByLabelText(/Digit \d of 6/) as HTMLInputElement[]
    fireEvent.change(cells[0], { target: { value: '1' } })
    fireEvent.change(cells[1], { target: { value: '2' } })
    fireEvent.change(cells[2], { target: { value: '3' } })
    fireEvent.change(cells[3], { target: { value: '4' } })
    fireEvent.change(cells[4], { target: { value: '5' } })
    fireEvent.change(cells[5], { target: { value: '6' } })
    expect(onComplete).toHaveBeenLastCalledWith('123456')
  })

  it('paste distributes a 6-digit code at once', () => {
    const onComplete = vi.fn()
    render(<H onComplete={onComplete} />)
    const cells = screen.getAllByLabelText(/Digit \d of 6/) as HTMLInputElement[]
    fireEvent.paste(cells[0], { clipboardData: { getData: () => '987654' } })
    expect(onComplete).toHaveBeenCalledWith('987654')
  })

  it('numeric mode strips letters', () => {
    function HN() {
      const [v, setV] = useState('')
      return <OtpInput value={v} onChange={setV} inputMode="numeric" />
    }
    render(<HN />)
    const cells = screen.getAllByLabelText(/Digit \d of 6/) as HTMLInputElement[]
    fireEvent.change(cells[0], { target: { value: 'a' } })
    expect(cells[0].value).toBe('')
    fireEvent.change(cells[0], { target: { value: '7' } })
    expect(cells[0].value).toBe('7')
  })
})

describe('WizardLayout', () => {
  const STEPS: WizardStep[] = [
    { id: 'a', label: 'Domain', caption: 'Verify your domain', icon: Globe },
    { id: 'b', label: 'DNS', caption: 'Configure DNS records', icon: Globe },
    { id: 'c', label: 'Account', caption: 'Create admin account', icon: Globe },
    { id: 'd', label: 'Finish', caption: 'Setup complete', icon: Globe },
  ]

  it('shows step counter and renders children', () => {
    render(
      <WizardLayout steps={STEPS} currentStep={1}>
        <p>step body</p>
      </WizardLayout>,
    )
    // V3 sideBar wording: "Setup wizard · step 2 of 4" — case-insensitive.
    expect(
      screen.getByText(/setup wizard · step 2 of 4/i),
    ).toBeInTheDocument()
    expect(screen.getByText('step body')).toBeInTheDocument()
  })

  it('renders all step labels in order', () => {
    render(
      <WizardLayout steps={STEPS} currentStep={2}>
        <p />
      </WizardLayout>,
    )
    expect(screen.getByText('Domain')).toBeInTheDocument()
    expect(screen.getByText('DNS')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Finish')).toBeInTheDocument()
  })
})
