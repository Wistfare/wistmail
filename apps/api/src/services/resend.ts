const RESEND_API_BASE = 'https://api.resend.com'

/**
 * ResendService manages domain provisioning in Resend.
 * When a new organization signs up with their domain, we create it in Resend
 * so emails from that domain can be delivered via Resend's relay.
 */
export class ResendService {
  private apiKey: string

  constructor() {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not configured')
    this.apiKey = key
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * Add a domain to Resend for email sending.
   * Returns the DNS records that need to be configured.
   */
  async addDomain(domainName: string): Promise<{
    id: string
    records: Array<{ type: string; name: string; value: string; priority?: number }>
    error?: string
  }> {
    try {
      const res = await fetch(`${RESEND_API_BASE}/domains`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          name: domainName,
          region: 'eu-west-1',
        }),
      })

      const data = (await res.json()) as {
        id?: string
        name?: string
        records?: Array<{ type: string; name: string; value: string; priority?: string }>
        message?: string
      }

      if (!res.ok) {
        console.error(`Resend addDomain failed for ${domainName}:`, data.message)
        return { id: '', records: [], error: data.message || `Failed with status ${res.status}` }
      }

      const records = (data.records || []).map((r) => ({
        type: r.type,
        name: r.name,
        value: r.value,
        priority: r.priority ? parseInt(r.priority) : undefined,
      }))

      console.log(`Domain ${domainName} added to Resend (id: ${data.id})`)
      return { id: data.id || '', records }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Resend addDomain error for ${domainName}:`, msg)
      return { id: '', records: [], error: msg }
    }
  }

  /**
   * Check domain verification status in Resend.
   */
  async verifyDomain(resendDomainId: string): Promise<{ verified: boolean; error?: string }> {
    try {
      const res = await fetch(`${RESEND_API_BASE}/domains/${resendDomainId}/verify`, {
        method: 'POST',
        headers: this.headers(),
      })

      if (!res.ok) {
        const data = (await res.json()) as { message?: string }
        return { verified: false, error: data.message }
      }

      return { verified: true }
    } catch (err) {
      return { verified: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Get domain status from Resend.
   */
  async getDomainStatus(resendDomainId: string): Promise<{ status: string; error?: string }> {
    try {
      const res = await fetch(`${RESEND_API_BASE}/domains/${resendDomainId}`, {
        headers: this.headers(),
      })

      const data = (await res.json()) as { status?: string; message?: string }

      if (!res.ok) {
        return { status: 'unknown', error: data.message }
      }

      return { status: data.status || 'unknown' }
    } catch (err) {
      return { status: 'unknown', error: err instanceof Error ? err.message : String(err) }
    }
  }
}
