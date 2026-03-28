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

// Mock next/link to render as a plain anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sign in heading', () => {
    render(<LoginPage />)
    expect(screen.getByText('Sign in')).toBeInTheDocument()
  })

  it('renders subtitle text', () => {
    render(<LoginPage />)
    expect(screen.getByText('Enter your credentials to access your inbox')).toBeInTheDocument()
  })

  it('shows email input field', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText('you@yourdomain.com')).toBeInTheDocument()
  })

  it('shows email address label', () => {
    render(<LoginPage />)
    expect(screen.getByText('Email address')).toBeInTheDocument()
  })

  it('shows password input field', () => {
    render(<LoginPage />)
    expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument()
  })

  it('shows password label', () => {
    render(<LoginPage />)
    expect(screen.getByText('Password')).toBeInTheDocument()
  })

  it('shows "Set up your domain" link instead of "Create an account"', () => {
    render(<LoginPage />)
    const setupLink = screen.getByText('Set up your domain')
    expect(setupLink).toBeInTheDocument()
    expect(setupLink.closest('a')).toHaveAttribute('href', '/setup')
    expect(screen.queryByText('Create an account')).not.toBeInTheDocument()
  })

  it('shows "Forgot password?" link', () => {
    render(<LoginPage />)
    const forgotLink = screen.getByText('Forgot password?')
    expect(forgotLink).toBeInTheDocument()
    expect(forgotLink.closest('a')).toHaveAttribute('href', '/forgot-password')
  })

  it('shows password toggle button', () => {
    render(<LoginPage />)
    // There should be a button to toggle password visibility
    const passwordInput = screen.getByPlaceholderText('Enter your password')
    expect(passwordInput).toHaveAttribute('type', 'password')

    // Find the toggle button (sibling button in the password field container)
    const toggleButton = passwordInput.parentElement?.querySelector('button')
    expect(toggleButton).toBeInTheDocument()
  })

  it('toggles password visibility when toggle button is clicked', () => {
    render(<LoginPage />)
    const passwordInput = screen.getByPlaceholderText('Enter your password')
    const toggleButton = passwordInput.parentElement?.querySelector('button')

    expect(passwordInput).toHaveAttribute('type', 'password')
    fireEvent.click(toggleButton!)
    expect(passwordInput).toHaveAttribute('type', 'text')
    fireEvent.click(toggleButton!)
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('shows Sign In submit button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('shows validation error when email is empty on submit', async () => {
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid email format', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'bad-email' } })
    // Use form submit directly to bypass HTML5 email type validation in jsdom
    const form = screen.getByPlaceholderText('you@yourdomain.com').closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    })
  })

  it('shows validation error when password is empty', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument()
    })
  })

  it('shows validation error for short password', async () => {
    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    })
  })

  it('submits valid credentials and redirects to inbox', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.post).mockResolvedValue({ user: { setupComplete: true } })

    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/v1/auth/login', {
        email: 'user@example.com',
        password: 'Password123',
      })
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/inbox')
    })
  })

  it('redirects to setup if user setup not complete', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.post).mockResolvedValue({ user: { setupComplete: false } })

    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/setup')
    })
  })

  it('shows form error on login failure', async () => {
    const { api } = await import('@/lib/api-client')
    vi.mocked(api.post).mockRejectedValue(new Error('Invalid email or password'))

    render(<LoginPage />)
    fireEvent.change(screen.getByPlaceholderText('you@yourdomain.com'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Enter your password'), { target: { value: 'Password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })
})
