/**
 * Cheap, deterministic display-name derivation from an email's
 * local-part. Runs before the AI fallback — most addresses with
 * separators (`john.doe`, `alex_chen`, `maria-rodriguez`) resolve here
 * in microseconds with no model call.
 *
 * Returns a confidence score so the caller can decide whether to
 * accept this result or kick off the heavier AI job. The threshold
 * is the caller's choice — we just report.
 */

export interface HeuristicResult {
  name: string
  confidence: number
}

/// Common role/system addresses we never want to humanise. Returning
/// confidence 1.0 for these stops the caller from wasting an AI call.
const ROLE_ADDRESSES = new Set([
  'admin', 'administrator',
  'support', 'help', 'helpdesk',
  'info', 'contact', 'hello', 'hi',
  'sales', 'marketing', 'billing', 'invoice', 'invoices',
  'noreply', 'no-reply', 'do-not-reply', 'donotreply',
  'mailer-daemon', 'postmaster', 'abuse',
  'notifications', 'notify', 'alerts',
  'security', 'privacy', 'legal',
  'hr', 'jobs', 'careers', 'recruiting',
  'team', 'dev', 'developers',
])

export function deriveLocalPartName(localPart: string): HeuristicResult {
  const lp = localPart.toLowerCase().trim()
  if (lp.length === 0) return { name: '', confidence: 1 }

  // Strip trailing tags some users add: "name+tag" → "name". Gmail's
  // plus-addressing convention.
  const cleaned = lp.split('+')[0]!

  // Role/system address detection — fast path before tokenisation.
  if (ROLE_ADDRESSES.has(cleaned)) {
    return { name: '', confidence: 1 }
  }

  // Split on the conventional separators. Any split into 2+ tokens
  // with at least one alphabetic token is high confidence — that's
  // exactly the shape of `firstname.lastname` and friends.
  const tokens = cleaned
    .split(/[._\-]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  // Reject tokens that look numeric / opaque ID. A token like "u8217"
  // signals an account id, not a name.
  const alphaTokens = tokens.filter((t) => /^[a-z][a-z']*$/.test(t) && t.length >= 2)

  if (alphaTokens.length >= 2) {
    // Title-case + join. `john.doe` → "John Doe".
    const name = alphaTokens
      .map((t) => t[0]!.toUpperCase() + t.slice(1))
      .join(' ')
    return { name, confidence: 0.9 }
  }

  if (alphaTokens.length === 1) {
    const t = alphaTokens[0]!
    // Single short token — likely an initial-handle (`jdoe`,
    // `alex`). We can't confidently split it, so we surface the
    // capitalised form at moderate confidence and let the AI step
    // do better if it decides to.
    if (t.length >= 4) {
      return {
        name: t[0]!.toUpperCase() + t.slice(1),
        confidence: 0.45,
      }
    }
    // Very short tokens (`jd`, `as`) — almost certainly an initial.
    // Don't pretend it's a name.
    return { name: '', confidence: 0.3 }
  }

  // No alpha tokens — pure digits, opaque hash, etc. Definitely
  // not a person.
  return { name: '', confidence: 0.95 }
}
