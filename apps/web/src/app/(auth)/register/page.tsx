export default function RegisterPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-wm-text-primary">Create account</h1>
        <p className="font-mono text-xs text-wm-text-tertiary">
          Set up your WistMail account in seconds
        </p>
      </div>

      {/* Placeholder — RegisterForm component will be built in PR #3 */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">Full name</label>
          <div className="flex items-center gap-2.5 rounded-md border border-wm-border bg-wm-surface px-4 py-3.5">
            <span className="font-mono text-sm text-wm-text-muted">Your name</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">
            Email address
          </label>
          <div className="flex items-center gap-2.5 rounded-md border border-wm-border bg-wm-surface px-4 py-3.5">
            <span className="font-mono text-sm text-wm-text-muted">you@yourdomain.com</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-mono text-xs font-medium text-wm-text-secondary">Password</label>
          <div className="flex items-center gap-2.5 rounded-md border border-wm-border bg-wm-surface px-4 py-3.5">
            <span className="font-mono text-sm text-wm-text-muted">Minimum 8 characters</span>
          </div>
        </div>

        <button className="flex items-center justify-center gap-2 bg-wm-accent px-4 py-3.5 font-mono text-sm font-semibold text-wm-text-on-accent hover:bg-wm-accent-hover transition-colors">
          Create Account
        </button>

        <p className="text-center font-mono text-xs text-wm-text-muted">
          Already have an account?{' '}
          <a href="/login" className="font-medium text-wm-accent">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
