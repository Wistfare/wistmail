import { Shield, Sparkles, Code, Zap } from 'lucide-react'

const features = [
  { icon: Shield, text: 'Self-hosted SMTP & IMAP — own your data' },
  { icon: Sparkles, text: 'AI-powered inbox with smart categorization' },
  { icon: Code, text: 'Transactional API with SDKs for 8+ languages' },
  { icon: Zap, text: 'Deploy in 5 minutes with Docker' },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Branding column */}
      <div className="hidden lg:flex flex-1 flex-col items-center justify-center bg-wm-surface px-16 py-20 gap-10">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center bg-wm-accent">
            <span className="text-wm-text-on-accent text-2xl font-bold">W</span>
          </div>
          <span className="font-mono text-2xl font-semibold tracking-[4px] text-wm-text-primary">
            WISTFARE MAIL
          </span>
        </div>

        <p className="max-w-md text-center text-2xl font-light leading-relaxed text-wm-text-secondary">
          Your email infrastructure,
          <br />
          fully under your control.
        </p>

        <div className="flex flex-col gap-4 max-w-sm">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.text} className="flex items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-wm-accent" />
                <span className="font-mono text-xs text-wm-text-tertiary">{feature.text}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Form column */}
      <div className="flex flex-1 lg:max-w-[500px] flex-col items-center justify-center border-l border-wm-border px-10 py-16 lg:px-16">
        {children}
      </div>
    </div>
  )
}
