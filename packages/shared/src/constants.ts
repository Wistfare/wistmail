// ─── Email Folders ──────────────────────────────────────────────────────────

export const EMAIL_FOLDERS = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'archive'] as const

export const DEFAULT_FOLDERS = ['inbox', 'sent', 'drafts', 'trash', 'spam'] as const

// ─── Limits ─────────────────────────────────────────────────────────────────

export const MAX_EMAIL_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB
export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB
export const MAX_ATTACHMENTS_PER_EMAIL = 20
export const MAX_RECIPIENTS_PER_EMAIL = 50
export const MAX_BATCH_SIZE = 100
export const MAX_SUBJECT_LENGTH = 998 // RFC 2822
export const DEFAULT_MAILBOX_QUOTA_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

// ─── API ────────────────────────────────────────────────────────────────────

export const API_KEY_PREFIX = 'wm_'
export const API_KEY_LENGTH = 32
export const API_VERSION = 'v1'
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
export const RATE_LIMIT_DEFAULT = 10 // requests per second
export const IDEMPOTENCY_KEY_TTL_SECONDS = 86400 // 24 hours

// ─── SMTP ───────────────────────────────────────────────────────────────────

export const SMTP_DEFAULT_PORT = 25
export const SMTP_SUBMISSION_PORT = 587
export const SMTP_SSL_PORT = 465
export const IMAP_DEFAULT_PORT = 143
export const IMAP_SSL_PORT = 993

export const SMTP_MAX_MESSAGE_SIZE = MAX_EMAIL_SIZE_BYTES
export const SMTP_MAX_RECIPIENTS = 100
export const SMTP_TIMEOUT_SECONDS = 300
export const SMTP_MAX_CONNECTIONS = 100
export const SMTP_MAX_AUTH_ATTEMPTS = 3

// ─── DKIM ───────────────────────────────────────────────────────────────────

export const DKIM_SELECTOR = 'wistmail'
export const DKIM_KEY_SIZE = 2048

// ─── Webhooks ───────────────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.complained',
  'email.failed',
  'email.received',
] as const

export const WEBHOOK_MAX_RETRIES = 5
export const WEBHOOK_RETRY_DELAYS_MS = [1000, 5000, 30000, 120000, 600000] // 1s, 5s, 30s, 2m, 10m
export const WEBHOOK_TIMEOUT_MS = 10000

// ─── AI ─────────────────────────────────────────────────────────────────────

export const AI_PROVIDERS = ['ollama', 'openai', 'anthropic'] as const
export const AI_MAX_TOKENS = 2048
export const AI_TEMPERATURE = 0.7

// ─── Spam ───────────────────────────────────────────────────────────────────

export const SPAM_THRESHOLD = 5.0
export const SPAM_HIGH_THRESHOLD = 10.0

// ─── DNS ────────────────────────────────────────────────────────────────────

export const DNS_PROPAGATION_CHECK_INTERVAL_MS = 30000 // 30 seconds
export const DNS_PROPAGATION_MAX_ATTEMPTS = 60 // 30 minutes total
