export default function LoginPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Sign in</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Enter your credentials to access your inbox
        </p>
      </div>

      {/* Placeholder — LoginForm component will be built in PR #3 */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">
            Email address
          </label>
          <div className="flex items-center gap-2.5 rounded-md border border-wm-border bg-wm-surface px-4 py-3.5">
            <span className="font-mono text-sm text-wm-text-muted">you@yourdomain.com</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-mono text-xs font-medium text-wm-text-secondary">
              Password
            </label>
            <span className="font-mono text-[11px] text-wm-accent cursor-pointer">
              Forgot password?
            </span>
          </div>
          <div className="flex items-center gap-2.5 rounded-md border border-wm-border bg-wm-surface px-4 py-3.5">
            <span className="font-mono text-sm text-wm-text-muted">Enter your password</span>
          </div>
        </div>

        <button className="flex items-center justify-center gap-2 bg-wm-accent px-4 py-3.5 font-mono text-sm font-semibold text-wm-text-on-accent hover:bg-wm-accent-hover transition-colors">
          Sign In
        </button>

        <p className="text-center font-mono text-xs text-wm-text-muted">
          New to WistMail?{' '}
          <a href="/register" className="font-medium text-wm-accent">
            Create an account
          </a>
        </p>
      </div>
    </div>
  )
}
