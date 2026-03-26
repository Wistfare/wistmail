'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock, EyeOff, Eye, ArrowRight } from 'lucide-react'
import { api } from '@/lib/api-client'
import { InputField } from '@/components/ui/input-field'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const router = useRouter()

  function validate() {
    const newErrors: typeof errors = {}
    if (!email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Enter a valid email address'
    }
    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
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
      await api.post('/api/v1/auth/login', { email, password })
      router.push('/inbox')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid email or password'
      setErrors({ form: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Sign in</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Enter your credentials to access your inbox
        </p>
      </div>

      {errors.form && (
        <div className="border border-wm-error/30 bg-wm-error/10 px-4 py-3">
          <p className="font-mono text-xs text-wm-error">{errors.form}</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        <InputField
          label="Email address"
          type="email"
          placeholder="you@yourdomain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          icon={<Mail className="h-4.5 w-4.5" />}
          autoComplete="email"
          autoFocus
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs font-medium text-wm-text-secondary">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="font-mono text-[11px] text-wm-accent hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div
            className={`flex items-center gap-2.5 border bg-wm-surface px-4 py-3 transition-colors focus-within:border-wm-accent focus-within:ring-1 focus-within:ring-wm-accent/30 ${errors.password ? 'border-wm-error' : 'border-wm-border'}`}
          >
            <Lock className="h-4.5 w-4.5 text-wm-text-muted" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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
        </div>

        <Button
          type="submit"
          size="lg"
          loading={loading}
          icon={<ArrowRight className="h-4 w-4" />}
          className="w-full py-3.5"
        >
          Sign In
        </Button>

        <p className="text-center font-mono text-xs text-wm-text-muted">
          New to WistMail?{' '}
          <Link href="/register" className="font-medium text-wm-accent hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </form>
  )
}
