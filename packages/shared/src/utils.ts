import { API_KEY_LENGTH, API_KEY_PREFIX } from './constants'

// ─── ID Generation ──────────────────────────────────────────────────────────

/**
 * Get cryptographically-random bytes using Web Crypto, which is the
 * shared baseline on every runtime we target (Node ≥ 19, browsers,
 * edge). Importing `node:crypto` at module scope used to drag the
 * Node `stream`/`buffer`/`crypto-browserify` polyfill chain (~127 KB
 * gzipped) into every web route via the `@wistmail/shared` barrel —
 * even though the web bundle never calls these functions.
 */
function getRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length)
  globalThis.crypto.getRandomValues(buf)
  return buf
}

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Generate a prefixed unique ID.
 * Format: prefix_<random hex>
 */
export function generateId(prefix: string, length: number = 16): string {
  return `${prefix}_${bytesToHex(getRandomBytes(length))}`
}

/**
 * Generate a new API key.
 * Format: wm_<random hex>
 */
export function generateApiKey(): { key: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${bytesToHex(getRandomBytes(API_KEY_LENGTH))}`
  const prefix = key.slice(0, 10)
  return { key, prefix }
}

/**
 * Generate a webhook signing secret.
 */
export function generateWebhookSecret(): string {
  return `whsec_${bytesToHex(getRandomBytes(24))}`
}

// ─── Email Validation ───────────────────────────────────────────────────────

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  if (email.length > 254) return false
  return EMAIL_REGEX.test(email)
}

/**
 * Extract the domain part from an email address.
 */
export function extractDomain(email: string): string {
  const parts = email.split('@')
  return parts[parts.length - 1].toLowerCase()
}

/**
 * Extract the local part from an email address.
 */
export function extractLocalPart(email: string): string {
  return email.split('@')[0]
}

/**
 * Normalize an email address (lowercase, trim).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// ─── Domain Validation ──────────────────────────────────────────────────────

const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

/**
 * Validate a domain name format.
 */
export function isValidDomain(domain: string): boolean {
  if (domain.length > 253) return false
  return DOMAIN_REGEX.test(domain)
}

// ─── String Utilities ───────────────────────────────────────────────────────

/**
 * Truncate a string to a maximum length, adding ellipsis if truncated.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

/**
 * Generate a message ID for an email.
 * Format: <random@domain>
 */
export function generateMessageId(domain: string): string {
  return `<${bytesToHex(getRandomBytes(12))}@${domain}>`
}

// ─── Date Utilities ─────────────────────────────────────────────────────────

/**
 * Format a date to RFC 2822 format for email headers.
 */
export function toRfc2822(date: Date): string {
  return date.toUTCString()
}

/**
 * Parse an RFC 2822 date string.
 */
export function fromRfc2822(dateStr: string): Date {
  return new Date(dateStr)
}

// ─── Size Formatting ────────────────────────────────────────────────────────

/**
 * Format bytes to human-readable size.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ─── HMAC for Webhooks ──────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 for webhook signature verification.
 *
 * Uses Web Crypto's SubtleCrypto so the function is portable across
 * Node ≥ 19, edge runtimes, and the browser. The previous `node:crypto`
 * implementation pulled the Node `crypto-browserify` polyfill chain
 * (~127 KB gzipped) into every web bundle that touched
 * `@wistmail/shared`, even on routes that never call this function.
 */
export async function computeHmac(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return bytesToHex(new Uint8Array(sig))
}

/**
 * Verify a webhook signature.
 *
 * Constant-time comparison via XOR-OR'd diff so we don't short-circuit
 * on the first mismatching byte.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await computeHmac(payload, secret)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

// ─── Array Utilities ────────────────────────────────────────────────────────

/**
 * Ensure a value is an array.
 */
export function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}
