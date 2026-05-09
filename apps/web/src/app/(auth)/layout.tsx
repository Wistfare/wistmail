import { AuthShell } from '@/components/auth'

/**
 * V3 auth shell — left decorPane (logo + tagline) + right formPane.
 * Pencil reference: `Screen/LoginV3` (`Ar0aI`).
 *
 * The decorPane is identical across login, MFA, forgot, and reset
 * password — none of those frames in Pencil show a bottom footer line,
 * so we leave `footer` unset.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell>{children}</AuthShell>
}
