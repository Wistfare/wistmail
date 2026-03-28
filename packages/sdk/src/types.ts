// ─── Configuration ─────────────────────────────────────────────────────────

export interface WistMailConfig {
  apiKey: string
  baseUrl?: string
  timeout?: number
}

// ─── Email ─────────────────────────────────────────────────────────────────

export interface SendEmailParams {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  cc?: string | string[]
  bcc?: string | string[]
  replyTo?: string | string[]
  headers?: Record<string, string>
  attachments?: Attachment[]
  tags?: Record<string, string>
  scheduledAt?: string | Date
  templateId?: string
  variables?: Record<string, string>
}

export interface Attachment {
  filename: string
  content: string | Buffer
  contentType?: string
}

export interface SendEmailResponse {
  id: string
}

export interface BatchSendResponse {
  ids: string[]
}

export type EmailStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'complained'

export interface EmailStatusResponse {
  id: string
  status: EmailStatus
  from: string
  to: string[]
  subject: string
  createdAt: string
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  bouncedAt: string | null
}

// ─── Webhooks ──────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'email.sent'
  | 'email.delivered'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked'
  | 'email.complained'
  | 'email.failed'
  | 'email.received'

export interface Webhook {
  id: string
  url: string
  events: WebhookEvent[]
  secret: string
  active: boolean
  createdAt: string
}

export interface CreateWebhookParams {
  url: string
  events: WebhookEvent[]
}

export interface UpdateWebhookParams {
  url?: string
  events?: WebhookEvent[]
  active?: boolean
}

// ─── Audiences ─────────────────────────────────────────────────────────────

export interface Audience {
  id: string
  name: string
  contactCount: number
  createdAt: string
}

export interface AudienceContact {
  id: string
  email: string
  name: string | null
  metadata: Record<string, unknown>
  topics: string[]
  subscribedAt: string
  unsubscribedAt: string | null
}

export interface CreateContactParams {
  email: string
  name?: string
  metadata?: Record<string, unknown>
  topics?: string[]
}

export interface UpdateContactParams {
  name?: string
  metadata?: Record<string, unknown>
  topics?: string[]
}

// ─── Pagination ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

// ─── Errors ────────────────────────────────────────────────────────────────

export interface WistMailErrorResponse {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}
