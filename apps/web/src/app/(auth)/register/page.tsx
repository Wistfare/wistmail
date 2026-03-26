'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User, Mail, Lock, EyeOff, Eye, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import { InputField } from '@/components/ui/input-field'
import { Button } from '@/components/ui/button'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{
    name?: string
    email?: string
    password?: string
    form?: string
  }>({})
  const router = useRouter()

  function validate() {
    const newErrors: typeof errors = {}
    if (!name.trim()) {
      newErrors.name = 'Name is required'
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }
    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Enter a valid email address'
    }
    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      newErrors.password = 'Must include uppercase, lowercase, and a number'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setErrors({})

    try {
      await api.post('/api/v1/auth/register', { name, email, password })
      // New accounts always need setup first
      router.push('/setup')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred. Please try again.'
      setErrors({ form: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Create account</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Set up your WistMail account in seconds
        </p>
      </div>

      {errors.form && (
        <div className="border border-wm-error/30 bg-wm-error/10 px-4 py-3">
          <p className="font-mono text-xs text-wm-error">{errors.form}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <InputField
          label="Full name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          icon={<User className="h-4.5 w-4.5" />}
          autoComplete="name"
          autoFocus
        />

        <InputField
          label="Email address"
          type="email"
          placeholder="you@yourdomain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="h-4.5 w-4.5" />}
          autoComplete="email"
        />

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">Password</label>
          <div
            className={`flex items-center gap-2.5 border bg-wm-surface px-4 py-3 transition-colors focus-within:border-wm-accent focus-within:ring-1 focus-within:ring-wm-accent/30 ${errors.password ? 'border-wm-error' : 'border-wm-border'}`}
          >
            <Lock className="h-4.5 w-4.5 text-wm-text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="flex-1 bg-transparent font-mono text-sm text-wm-text-primary placeholder:text-wm-text-muted outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-wm-text-muted hover:text-wm-text-secondary cursor-pointer"
            >
              {showPassword ? <Eye className="h-4.5 w-4.5" /> : <EyeOff className="h-4.5 w-4.5" />}
            </button>
          </div>
          {errors.password && (
            <p className="font-mono text-xs text-wm-error">{errors.password}</p>
          )}
          {!errors.password && password.length > 0 && (
            <div className="flex items-center gap-2 font-mono text-[10px]">
              <span className={password.length >= 8 ? 'text-wm-accent' : 'text-wm-text-muted'}>
                {password.length >= 8 ? '✓' : '○'} 8+ chars
              </span>
              <span
                className={
                  /[A-Z]/.test(password) ? 'text-wm-accent' : 'text-wm-text-muted'
                }
              >
                {/[A-Z]/.test(password) ? '✓' : '○'} Uppercase
              </span>
              <span
                className={/\d/.test(password) ? 'text-wm-accent' : 'text-wm-text-muted'}
              >
                {/\d/.test(password) ? '✓' : '○'} Number
              </span>
            </div>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          loading={loading}
          icon={<ArrowRight className="h-4 w-4" />}
          className="w-full py-3.5"
        >
          Create Account
        </Button>

        <p className="text-center font-mono text-xs text-wm-text-muted">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-wm-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </form>
  )
}
