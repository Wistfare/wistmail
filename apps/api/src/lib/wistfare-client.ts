/**
 * Thin typed wrapper around the Wistfare Collections REST API.
 *
 * We deliberately don't depend on the `@wistfare/payments` SDK — the surface
 * we need is small (one POST + one GET), and a fetch-based client keeps the
 * test story simple (no SDK to mock, just `globalThis.fetch`).
 *
 * Auth: `X-API-Key: wf_live_xxx` (or test key in non-prod).
 *
 * In test/dev when `WISTFARE_API_KEY` is unset we short-circuit and return a
 * synthetic response so unit tests don't depend on the real provider being up.
 */

import { WistMailError, ErrorCode } from '@wistmail/shared'

export interface InitiateCollectionParams {
  /** Wistfare business id we transact under. */
  businessId: string
  /** Wistfare destination wallet id. */
  walletId: string
  /** Customer phone in MSISDN form, e.g. 250788000000. */
  customerPhone: string
  /** Local-currency amount as a string (Wistfare convention). */
  amount: string
  /** mtn_momo | airtel_money */
  paymentMethod: 'mtn_momo' | 'airtel_money'
  /** Currency code, e.g. RWF. */
  currency: string
  /** Our reference — we send `collection_attempts.idempotencyKey`. */
  referenceId: string
  /** Human-readable description. */
  description?: string
}

export interface WistfareCollectionResponse {
  id: string
  businessId: string
  walletId: string
  customerPhone: string
  amount: string
  currency: string
  paymentMethod: string
  referenceId: string
  status: 'pending' | 'completed' | 'failed' | 'expired' | string
  description?: string
  createdAt: string
  updatedAt: string
}

export class BillingProviderError extends WistMailError {
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super(ErrorCode.SERVICE_UNAVAILABLE, message, status >= 500 ? 502 : 400, details)
    this.name = 'BillingProviderError'
  }
}

export interface WistfareClientOptions {
  apiKey?: string
  apiUrl?: string
  /** Override fetch — used by tests. */
  fetchImpl?: typeof fetch
}

export class WistfareClient {
  private readonly apiKey: string
  private readonly apiUrl: string
  private readonly fetchImpl: typeof fetch
  /** When true, calls return synthetic responses instead of hitting the network. */
  readonly stubbed: boolean

  constructor(opts: WistfareClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.WISTFARE_API_KEY ?? ''
    this.apiUrl =
      opts.apiUrl ??
      process.env.WISTFARE_API_URL ??
      'https://api-production.wistfare.com'
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
    // Test/dev convenience: no key configured → return stubbed responses so
    // local + CI runs don't need a live provider.
    this.stubbed =
      !this.apiKey ||
      process.env.NODE_ENV === 'test' ||
      process.env.VITEST === 'true'
  }

  async initiateCollection(
    params: InitiateCollectionParams,
  ): Promise<WistfareCollectionResponse> {
    if (this.stubbed) {
      const now = new Date().toISOString()
      return {
        id: `col_stub_${params.referenceId}`,
        businessId: params.businessId,
        walletId: params.walletId,
        customerPhone: params.customerPhone,
        amount: params.amount,
        currency: params.currency,
        paymentMethod: params.paymentMethod,
        referenceId: params.referenceId,
        status: 'pending',
        description: params.description,
        createdAt: now,
        updatedAt: now,
      }
    }

    const res = await this.fetchImpl(`${this.apiUrl}/v1/collections`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const body = await safeJson(res)
      throw new BillingProviderError(
        `Wistfare collections rejected request (${res.status})`,
        res.status,
        { providerStatus: res.status, providerBody: body },
      )
    }

    return (await res.json()) as WistfareCollectionResponse
  }

  async getCollection(id: string): Promise<WistfareCollectionResponse | null> {
    if (this.stubbed) return null
    const res = await this.fetchImpl(`${this.apiUrl}/v1/collections/${encodeURIComponent(id)}`, {
      headers: { 'X-API-Key': this.apiKey },
    })
    if (res.status === 404) return null
    if (!res.ok) {
      throw new BillingProviderError(
        `Wistfare get collection failed (${res.status})`,
        res.status,
      )
    }
    return (await res.json()) as WistfareCollectionResponse
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    try {
      return await res.text()
    } catch {
      return null
    }
  }
}

let cached: WistfareClient | null = null
/** Process-wide singleton, lazy. */
export function getWistfareClient(): WistfareClient {
  if (!cached) cached = new WistfareClient()
  return cached
}

/** Test hook — reset the singleton between tests if needed. */
export function __resetWistfareClient() {
  cached = null
}
