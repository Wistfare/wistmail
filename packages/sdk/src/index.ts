export { WistMail } from './client.js'
export type {
  WistMailConfig,
  SendEmailParams,
  SendEmailResponse,
  BatchSendResponse,
  EmailStatus,
  EmailStatusResponse,
  Webhook,
  WebhookEvent,
  CreateWebhookParams,
  UpdateWebhookParams,
  Audience,
  AudienceContact,
  CreateContactParams,
  UpdateContactParams,
  PaginatedResponse,
  PaginationParams,
  Attachment,
} from './types.js'
export {
  WistMailError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
} from './errors.js'
