import { z } from 'zod'

// ─── Email Schemas ──────────────────────────────────────────────────────────

const emailAddress = z.string().email('Invalid email address')
const emailOrArray = z.union([emailAddress, z.array(emailAddress).min(1).max(50)])

export const attachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1), // base64 encoded
  contentType: z.string().optional(),
})

export const sendEmailSchema = z.object({
  from: z.string().min(1, 'From address is required'),
  to: emailOrArray,
  cc: emailOrArray.optional(),
  bcc: emailOrArray.optional(),
  subject: z.string().max(998, 'Subject too long'),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.union([emailAddress, z.array(emailAddress)]).optional(),
  headers: z.record(z.string()).optional(),
  attachments: z.array(attachmentSchema).max(20).optional(),
  tags: z.record(z.string()).optional(),
  scheduledAt: z.string().datetime().optional(),
  templateId: z.string().optional(),
  variables: z.record(z.string()).optional(),
})

export const batchSendSchema = z.object({
  emails: z.array(sendEmailSchema).min(1).max(100),
})

// ─── Domain Schemas ─────────────────────────────────────────────────────────

export const createDomainSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(253)
    .regex(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/, 'Invalid domain name'),
})

// ─── API Key Schemas ────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z
    .array(
      z.enum([
        'emails:send',
        'emails:read',
        'domains:manage',
        'templates:manage',
        'contacts:manage',
        'webhooks:manage',
        'analytics:read',
      ]),
    )
    .min(1),
  domainId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
})

// ─── Webhook Schemas ────────────────────────────────────────────────────────

export const createWebhookSchema = z.object({
  url: z.string().url('Invalid webhook URL'),
  events: z
    .array(
      z.enum([
        'email.sent',
        'email.delivered',
        'email.bounced',
        'email.opened',
        'email.clicked',
        'email.complained',
        'email.failed',
        'email.received',
      ]),
    )
    .min(1),
  domainId: z.string().optional(),
})

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z
    .array(
      z.enum([
        'email.sent',
        'email.delivered',
        'email.bounced',
        'email.opened',
        'email.clicked',
        'email.complained',
        'email.failed',
        'email.received',
      ]),
    )
    .min(1)
    .optional(),
  active: z.boolean().optional(),
})

// ─── Template Schemas ───────────────────────────────────────────────────────

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().max(998),
  html: z.string(),
  variables: z
    .array(
      z.object({
        name: z.string(),
        defaultValue: z.string().nullable().optional(),
        required: z.boolean().default(false),
      }),
    )
    .optional(),
})

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject: z.string().max(998).optional(),
  html: z.string().optional(),
  variables: z
    .array(
      z.object({
        name: z.string(),
        defaultValue: z.string().nullable().optional(),
        required: z.boolean().default(false),
      }),
    )
    .optional(),
})

// ─── Audience Schemas ───────────────────────────────────────────────────────

export const createAudienceSchema = z.object({
  name: z.string().min(1).max(255),
})

export const createContactSchema = z.object({
  email: emailAddress,
  name: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  topics: z.array(z.string()).optional(),
})

export const updateContactSchema = z.object({
  name: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  topics: z.array(z.string()).optional(),
})

// ─── Pagination ─────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export type SendEmailInput = z.infer<typeof sendEmailSchema>
export type BatchSendInput = z.infer<typeof batchSendSchema>
export type CreateDomainInput = z.infer<typeof createDomainSchema>
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>
export type CreateAudienceInput = z.infer<typeof createAudienceSchema>
export type CreateContactInput = z.infer<typeof createContactSchema>
export type UpdateContactInput = z.infer<typeof updateContactSchema>
