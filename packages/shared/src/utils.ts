import { randomBytes } from 'node:crypto'
import { API_KEY_LENGTH, API_KEY_PREFIX } from './constants.js'

// ─── ID Generation ──────────────────────────────────────────────────────────

/**
 * Generate a prefixed unique ID.
 * Format: prefix_<random hex>
 */
export function generateId(prefix: string, length: number = 16): string {
  const bytes = randomBytes(length)
  return `${prefix}_${bytes.toString('hex')}`
}

/**
 * Generate a new API key.
 * Format: wm_<random hex>
 */
export function generateApiKey(): { key: string; prefix: string } {
  const bytes = randomBytes(API_KEY_LENGTH)
  const key = `${API_KEY_PREFIX}${bytes.toString('hex')}`
  const prefix = key.slice(0, 10)
  return { key, prefix }
}

/**
 * Generate a webhook signing secret.
 */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`
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
  const random = randomBytes(12).toString('hex')
  return `<${random}@${domain}>`
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
 */
export async function computeHmac(payload: string, secret: string): Promise<string> {
  const { createHmac } = await import('node:crypto')
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Verify a webhook signature.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await computeHmac(payload, secret)
  // Constant-time comparison
  if (expected.length !== signature.length) return false
  const { timingSafeEqual } = await import('node:crypto')
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// ─── Array Utilities ────────────────────────────────────────────────────────

/**
 * Ensure a value is an array.
 */
export function toArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}
