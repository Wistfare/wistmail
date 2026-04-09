// ─── Core Entity Types ───────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  createdAt: Date
  updatedAt: Date
}

export interface Domain {
  id: string
  name: string
  userId: string
  verified: boolean
  status: DomainStatus
  dkimPublicKey: string | null
  dkimPrivateKey: string | null
  dkimSelector: string
  spfRecord: string | null
  dmarcRecord: string | null
  mxVerified: boolean
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  dnsProvider: DnsProviderType
  cloudflareZoneId: string | null
  serverIp: string | null
  createdAt: Date
  updatedAt: Date
}

export type DomainStatus = 'pending' | 'verifying' | 'active' | 'failed' | 'suspended'

export type DnsProviderType = 'cloudflare' | 'manual'

export interface DomainCheckResult {
  domainExists: boolean
  resolvedIps: string[]
  serverIp: string
}

export interface CloudflareConnectResult {
  valid: boolean
  zoneId?: string
  error?: string
}

export interface CloudflareCreateResult {
  results: Array<{
    type: string
    name: string
    success: boolean
    error?: string
  }>
  allCreated: boolean
}

export interface Mailbox {
  id: string
  address: string
  displayName: string
  domainId: string
  userId: string
  quotaBytes: number
  usedBytes: number
  createdAt: Date
  updatedAt: Date
}

export interface Email {
  id: string
  messageId: string
  fromAddress: string
  toAddresses: string[]
  cc: string[]
  bcc: string[]
  subject: string
  textBody: string | null
  htmlBody: string | null
  mailboxId: string
  folder: EmailFolder
  isRead: boolean
  isStarred: boolean
  isDraft: boolean
  threadId: string | null
  inReplyTo: string | null
  references: string[]
  headers: Record<string, string>
  sizeBytes: number
  createdAt: Date
}

export type EmailFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive'

export interface Attachment {
  id: string
  emailId: string
  filename: string
  contentType: string
  sizeBytes: number
  storageKey: string
}

export interface Thread {
  id: string
  subject: string
  lastEmailAt: Date
  mailboxId: string
  participantAddresses: string[]
  emailCount: number
}

export interface Label {
  id: string
  name: string
  color: string
  mailboxId: string
}

export interface Contact {
  id: string
  email: string
  name: string | null
  userId: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ─── API Types ───────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: ApiKeyScope[]
  domainId: string | null
  userId: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

export type ApiKeyScope =
  | 'emails:send'
  | 'emails:read'
  | 'domains:manage'
  | 'templates:manage'
  | 'contacts:manage'
  | 'webhooks:manage'
  | 'analytics:read'

export interface Webhook {
  id: string
  url: string
  events: WebhookEvent[]
  secret: string
  domainId: string | null
  userId: string
  active: boolean
  createdAt: Date
}

export type WebhookEvent =
  | 'email.sent'
  | 'email.delivered'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked'
  | 'email.complained'
  | 'email.failed'
  | 'email.received'

export interface WebhookLog {
  id: string
  webhookId: string
  event: WebhookEvent
  payload: Record<string, unknown>
  responseStatus: number | null
  attempts: number
  createdAt: Date
}

export interface Template {
  id: string
  name: string
  subject: string
  html: string
  variables: TemplateVariable[]
  userId: string
  createdAt: Date
  updatedAt: Date
}

export interface TemplateVariable {
  name: string
  defaultValue: string | null
  required: boolean
}

export interface SendingLog {
  id: string
  emailId: string
  apiKeyId: string | null
  status: SendingStatus
  openedAt: Date | null
  clickedAt: Date | null
  bouncedAt: Date | null
  deliveredAt: Date | null
  metadata: Record<string, unknown>
  createdAt: Date
}

export type SendingStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'failed'
  | 'complained'

// ─── Audience & Contact Management ──────────────────────────────────────────

export interface Audience {
  id: string
  name: string
  userId: string
  contactCount: number
  createdAt: Date
}

export interface AudienceContact {
  id: string
  audienceId: string
  contactId: string
  subscribedAt: Date
  unsubscribedAt: Date | null
  topics: string[]
}

// ─── API Request/Response Types ─────────────────────────────────────────────

export interface SendEmailRequest {
  from: string
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  subject: string
  html?: string
  text?: string
  replyTo?: string | string[]
  headers?: Record<string, string>
  attachments?: AttachmentInput[]
  tags?: Record<string, string>
  scheduledAt?: string
  templateId?: string
  variables?: Record<string, string>
}

export interface AttachmentInput {
  filename: string
  content: string // base64 encoded
  contentType?: string
}

export interface SendEmailResponse {
  id: string
}

export interface BatchSendRequest {
  emails: SendEmailRequest[]
}

export interface BatchSendResponse {
  ids: string[]
}

export interface EmailStatusResponse {
  id: string
  status: SendingStatus
  from: string
  to: string[]
  subject: string
  createdAt: string
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  bouncedAt: string | null
}

export interface DomainCreateRequest {
  name: string
}

export interface DomainResponse {
  id: string
  name: string
  status: DomainStatus
  records: DnsRecord[]
  createdAt: string
}

export interface DnsRecord {
  type: 'MX' | 'TXT' | 'CNAME'
  name: string
  value: string
  priority?: number
  verified: boolean
}

// ─── Pagination ─────────────────────────────────────────────────────────────

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

// ─── AI Types ───────────────────────────────────────────────────────────────

export type AiProvider = 'ollama' | 'openai' | 'anthropic'

export interface AiConfig {
  provider: AiProvider
  fallbackProvider?: AiProvider
  ollama?: {
    url: string
    model: string
  }
  openai?: {
    apiKey: string
    model: string
  }
  anthropic?: {
    apiKey: string
    model: string
  }
}

export interface AiComposeRequest {
  prompt: string
  context?: string
  tone?: 'formal' | 'casual' | 'friendly' | 'professional'
  maxLength?: number
}

export interface AiReplyRequest {
  emailContent: string
  emailSubject: string
  instructions?: string
  tone?: 'formal' | 'casual' | 'friendly' | 'professional'
}

export interface AiSummarizeRequest {
  emails: Array<{
    from: string
    subject: string
    body: string
    date: string
  }>
}

export interface AiCategorizeRequest {
  from: string
  subject: string
  bodyPreview: string
  existingLabels: string[]
}
