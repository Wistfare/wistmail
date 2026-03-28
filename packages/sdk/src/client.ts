import type {
  WistMailConfig,
  SendEmailParams,
  SendEmailResponse,
  BatchSendResponse,
  EmailStatusResponse,
  Domain,
  DomainVerification,
  Template,
  CreateTemplateParams,
  UpdateTemplateParams,
  Webhook,
  CreateWebhookParams,
  UpdateWebhookParams,
  Audience,
  AudienceContact,
  CreateContactParams,
  UpdateContactParams,
  AnalyticsOverview,
  PaginatedResponse,
  PaginationParams,
  WistMailErrorResponse,
} from './types.js'
import { WistMailError, AuthenticationError, RateLimitError, ValidationError, NotFoundError } from './errors.js'

const DEFAULT_BASE_URL = 'https://api.wistmail.com'
const DEFAULT_TIMEOUT = 30000
const SDK_VERSION = '0.1.0'

export class WistMail {
  private apiKey: string
  private baseUrl: string
  private timeout: number

  readonly emails: Emails
  readonly domains: Domains
  readonly templates: Templates
  readonly webhooks: Webhooks
  readonly audiences: Audiences
  readonly analytics: Analytics

  constructor(config: WistMailConfig) {
    if (!config.apiKey) {
      throw new Error('WistMail: apiKey is required')
    }

    this.apiKey = config.apiKey
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeout = config.timeout || DEFAULT_TIMEOUT

    this.emails = new Emails(this)
    this.domains = new Domains(this)
    this.templates = new Templates(this)
    this.webhooks = new Webhooks(this)
    this.audiences = new Audiences(this)
    this.analytics = new Analytics(this)
  }

  /** @internal */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': `wistmail-node/${SDK_VERSION}`,
      }

      if (body !== undefined) {
        headers['Content-Type'] = 'application/json'
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      if (!res.ok) {
        await this.handleError(res)
      }

      if (res.status === 204) {
        return undefined as T
      }

      return (await res.json()) as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async handleError(res: Response): Promise<never> {
    let errorBody: WistMailErrorResponse | null = null
    try {
      errorBody = (await res.json()) as WistMailErrorResponse
    } catch {}

    const message = errorBody?.error?.message || `Request failed with status ${res.status}`
    const code = errorBody?.error?.code || 'UNKNOWN'
    const details = errorBody?.error?.details

    switch (res.status) {
      case 401:
        throw new AuthenticationError(message)
      case 429: {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
        throw new RateLimitError(retryAfter)
      }
      case 400:
        throw new ValidationError(message, details)
      case 404:
        throw new NotFoundError(message)
      default:
        throw new WistMailError(message, code, res.status, details)
    }
  }
}

// ─── Resource Classes ──────────────────────────────────────────────────────

class Emails {
  constructor(private client: WistMail) {}

  async send(params: SendEmailParams): Promise<SendEmailResponse> {
    const body = {
      ...params,
      to: Array.isArray(params.to) ? params.to : [params.to],
      scheduledAt:
        params.scheduledAt instanceof Date ? params.scheduledAt.toISOString() : params.scheduledAt,
      attachments: params.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        contentType: a.contentType,
      })),
    }
    return this.client.request<SendEmailResponse>('POST', '/emails', body)
  }

  async batchSend(emails: SendEmailParams[]): Promise<BatchSendResponse> {
    const body = {
      emails: emails.map((e) => ({
        ...e,
        to: Array.isArray(e.to) ? e.to : [e.to],
        scheduledAt: e.scheduledAt instanceof Date ? e.scheduledAt.toISOString() : e.scheduledAt,
      })),
    }
    return this.client.request<BatchSendResponse>('POST', '/emails/batch', body)
  }

  async get(emailId: string): Promise<EmailStatusResponse> {
    return this.client.request<EmailStatusResponse>('GET', `/emails/${emailId}`)
  }

  async cancel(emailId: string): Promise<void> {
    await this.client.request<void>('PATCH', `/emails/${emailId}/cancel`)
  }
}

class Domains {
  constructor(private client: WistMail) {}

  async create(name: string): Promise<Domain> {
    return this.client.request<Domain>('POST', '/domains', { name })
  }

  async list(): Promise<Domain[]> {
    const res = await this.client.request<{ data: Domain[] }>('GET', '/domains')
    return res.data
  }

  async get(domainId: string): Promise<Domain> {
    return this.client.request<Domain>('GET', `/domains/${domainId}`)
  }

  async verify(domainId: string): Promise<DomainVerification> {
    return this.client.request<DomainVerification>('POST', `/domains/${domainId}/verify`)
  }

  async delete(domainId: string): Promise<void> {
    await this.client.request<void>('DELETE', `/domains/${domainId}`)
  }
}

class Templates {
  constructor(private client: WistMail) {}

  async create(params: CreateTemplateParams): Promise<Template> {
    return this.client.request<Template>('POST', '/templates', params)
  }

  async list(pagination?: PaginationParams): Promise<PaginatedResponse<Template>> {
    const query = pagination ? `?page=${pagination.page || 1}&pageSize=${pagination.pageSize || 25}` : ''
    return this.client.request<PaginatedResponse<Template>>('GET', `/templates${query}`)
  }

  async get(templateId: string): Promise<Template> {
    return this.client.request<Template>('GET', `/templates/${templateId}`)
  }

  async update(templateId: string, params: UpdateTemplateParams): Promise<Template> {
    return this.client.request<Template>('PATCH', `/templates/${templateId}`, params)
  }

  async delete(templateId: string): Promise<void> {
    await this.client.request<void>('DELETE', `/templates/${templateId}`)
  }
}

class Webhooks {
  constructor(private client: WistMail) {}

  async create(params: CreateWebhookParams): Promise<Webhook> {
    return this.client.request<Webhook>('POST', '/webhooks', params)
  }

  async list(): Promise<Webhook[]> {
    const res = await this.client.request<{ data: Webhook[] }>('GET', '/webhooks')
    return res.data
  }

  async get(webhookId: string): Promise<Webhook> {
    return this.client.request<Webhook>('GET', `/webhooks/${webhookId}`)
  }

  async update(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.client.request<Webhook>('PATCH', `/webhooks/${webhookId}`, params)
  }

  async delete(webhookId: string): Promise<void> {
    await this.client.request<void>('DELETE', `/webhooks/${webhookId}`)
  }

  async test(webhookId: string): Promise<{ status: number }> {
    return this.client.request<{ status: number }>('POST', `/webhooks/${webhookId}/test`)
  }
}

class Audiences {
  constructor(private client: WistMail) {}

  async create(name: string): Promise<Audience> {
    return this.client.request<Audience>('POST', '/audiences', { name })
  }

  async list(): Promise<Audience[]> {
    const res = await this.client.request<{ data: Audience[] }>('GET', '/audiences')
    return res.data
  }

  async get(audienceId: string): Promise<Audience> {
    return this.client.request<Audience>('GET', `/audiences/${audienceId}`)
  }

  async delete(audienceId: string): Promise<void> {
    await this.client.request<void>('DELETE', `/audiences/${audienceId}`)
  }

  async addContact(audienceId: string, params: CreateContactParams): Promise<AudienceContact> {
    return this.client.request<AudienceContact>('POST', `/audiences/${audienceId}/contacts`, params)
  }

  async listContacts(audienceId: string, pagination?: PaginationParams): Promise<PaginatedResponse<AudienceContact>> {
    const query = pagination ? `?page=${pagination.page || 1}&pageSize=${pagination.pageSize || 25}` : ''
    return this.client.request<PaginatedResponse<AudienceContact>>('GET', `/audiences/${audienceId}/contacts${query}`)
  }

  async updateContact(contactId: string, params: UpdateContactParams): Promise<AudienceContact> {
    return this.client.request<AudienceContact>('PATCH', `/contacts/${contactId}`, params)
  }

  async deleteContact(contactId: string): Promise<void> {
    await this.client.request<void>('DELETE', `/contacts/${contactId}`)
  }
}

class Analytics {
  constructor(private client: WistMail) {}

  async overview(): Promise<AnalyticsOverview> {
    return this.client.request<AnalyticsOverview>('GET', '/analytics/overview')
  }
}
