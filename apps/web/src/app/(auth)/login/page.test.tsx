import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from './page'

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('@/lib/api-client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Render Next Link as a plain anchor so href assertions work in jsdom.
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the V3 sign-in heading and description', () => {
    render(<LoginPage />)
    // "Sign in" appears twice — eyebrow + submit button label.
    expect(screen.getAllByText('Sign in').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByText('Enter your credentials to access your inbox.')).toBeInTheDocument()
  })

  it('shows email + password fields', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText('you@yourdomain.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
    expect(screen.getByText('Email address')).toBeInTheDocument()
    expect(screen.getByText('Password')).toBeInTheDocument()
  })

  it('links to /setup and /forgot-password', () => {
    render(<LoginPage />)
    const setupLink = screen.getByText(/Set up your domain/)
    expect(setupLink.closest('a')).toHaveAttribute('href', '/setup')
    const forgotLink = screen.getByText('Forgot?')
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/forgot-password')
  })

  it('reveals password when toggled', () => {
    render(<LoginPage />)
    const passwordInput = screen.getByPlaceholderText('Enter your password')
    expect(passwordInput).toHaveAttribute('type', 'password')
    const toggle = screen.getByRole('button', { name: /Show password/i })
    fireEvent.click(toggle)
    expect(passwordInput).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: /Hide password/i }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('renders the Sign in CTA', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument()
  })

  it('flags missing email on submit', async () => {
    render(<LoginPage />)
    const form = screen.getByPlaceholderText('you@yourdomain.com').closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument()
    })
  })

  it('flags invalid email format', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'bad-email' } })
    const form = screen.getByPlaceholderText('you@yourdomain.com').closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email')).toBeInTheDocument()
    })
  })

  it('flags missing password', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    const form = screen.getByPlaceholderText('you@yourdomain.com').closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument()
    })
  })

  it('flags short password', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'short' } })
    const form = screen.getByPlaceholderText('you@yourdomain.com').closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
    })
  })

  it('redirects to /inbox on successful sign-in (setup complete)', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.post).mockResolvedValue({ user: { setupComplete: true } })

    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/login', {
        email: 'user@example.com',
        password: 'Password123',
      })
      expect(mockPush).toHaveBeenCalledWith('/inbox')
    })
  })

  it('redirects to /setup if setup not complete', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.post).mockResolvedValue({ user: { setupComplete: false } })

    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/setup')
    })
  })

  it('surfaces backend error on failed sign-in', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.post).mockRejectedValue(new Error('Invalid email or password'))

    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })
})
