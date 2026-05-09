import { AuthShell } from '@/components/auth'

/**
 * V3 auth shell — left decorPane (logo + tagline) + right formPane.
 * Pencil reference: `LoginV3` / `MFAChallengeV3`.
 *
 * The decoration is the same on every auth screen (login, mfa,
 * forgot-password, reset-password); each child page renders its own form
 * card on the right.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell footer="Self-hosted · Open source · No telemetry">{children}</AuthShell>
}
