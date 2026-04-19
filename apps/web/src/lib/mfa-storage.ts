/// Tiny helper around sessionStorage for the in-progress MFA login. Used
/// to bridge from /login → /mfa/challenge → /mfa/backup-code without
/// stuffing the pending token into the URL or relying on a global store.
///
/// Cleared on completion or when the user navigates back to /login.

const KEY = 'wm_mfa_pending'

export type PendingMfa = {
  pendingToken: string
  methods: { type: string; label?: string | null }[]
}

export function readPendingMfa(): PendingMfa | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PendingMfa
    if (typeof parsed.pendingToken !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingMfa(value: PendingMfa) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, JSON.stringify(value))
}

export function clearPendingMfa() {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(KEY)
}
