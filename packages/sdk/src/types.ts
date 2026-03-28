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

// ─── Domains ───────────────────────────────────────────────────────────────

export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'suspended'

export interface DnsRecord {
  type: 'MX' | 'TXT' | 'CNAME'
  name: string
  value: string
  priority?: number
  verified: boolean
}

export interface Domain {
  id: string
  name: string
  status: DomainStatus
  records: DnsRecord[]
  createdAt: string
}

export interface DomainVerification {
  mx: boolean
  spf: boolean
  dkim: boolean
  dmarc: boolean
  verified: boolean
  status: DomainStatus
}

// ─── Templates ─────────────────────────────────────────────────────────────

export interface TemplateVariable {
  name: string
  defaultValue?: string | null
  required?: boolean
}

export interface Template {
  id: string
  name: string
  subject: string
  html: string
  variables: TemplateVariable[]
  createdAt: string
  updatedAt: string
}

export interface CreateTemplateParams {
  name: string
  subject: string
  html: string
  variables?: TemplateVariable[]
}

export interface UpdateTemplateParams {
  name?: string
  subject?: string
  html?: string
  variables?: TemplateVariable[]
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

// ─── Analytics ─────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  deliveryRate: number
  openRate: number
  clickRate: number
  bounceRate: number
  period: { from: string; to: string }
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
