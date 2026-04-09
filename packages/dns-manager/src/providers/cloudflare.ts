import type { DnsProvider, DnsRecordInput, DnsRecordResult } from '../types.js'

const CF_API = 'https://api.cloudflare.com/client/v4'

interface CloudflareConfig {
  apiToken: string
  zoneId?: string
}

interface CfResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  result: T
}

export class CloudflareProvider implements DnsProvider {
  private apiToken: string

  constructor(config: CloudflareConfig) {
    this.apiToken = config.apiToken
  }

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    }
  }

  async verifyConnection(domain: string): Promise<{ valid: boolean; zoneId?: string; error?: string }> {
    try {
      // Verify the token is valid
      const verifyRes = await fetch(`${CF_API}/user/tokens/verify`, { headers: this.headers() })
      const verifyData = (await verifyRes.json()) as CfResponse<{ status: string }>

      if (!verifyData.success || verifyData.result?.status !== 'active') {
        return { valid: false, error: 'Invalid or inactive API token' }
      }

      // Find the zone for this domain
      const zoneRes = await fetch(`${CF_API}/zones?name=${encodeURIComponent(domain)}&status=active`, {
        headers: this.headers(),
      })
      const zoneData = (await zoneRes.json()) as CfResponse<Array<{ id: string; name: string }>>

      if (!zoneData.success || zoneData.result.length === 0) {
        return { valid: false, error: `No active Cloudflare zone found for ${domain}. Ensure the domain is added to your Cloudflare account.` }
      }

      const zoneId = zoneData.result[0].id
      return { valid: true, zoneId }
    } catch (err) {
      return { valid: false, error: err instanceof Error ? err.message : 'Failed to connect to Cloudflare' }
    }
  }

  async createRecords(zoneId: string, records: DnsRecordInput[]): Promise<DnsRecordResult[]> {
    const results = await Promise.allSettled(
      records.map(async (record) => {
        const body: Record<string, unknown> = {
          type: record.type,
          name: record.name,
          content: record.content,
          ttl: record.ttl || 1, // 1 = auto
          proxied: false,
        }
        if (record.priority !== undefined) {
          body.priority = record.priority
        }

        const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as CfResponse<{ id: string; type: string; name: string; content: string }>

        if (!data.success) {
          const errMsg = data.errors.map((e) => e.message).join(', ')
          return {
            id: '',
            type: record.type,
            name: record.name,
            content: record.content,
            success: false,
            error: errMsg,
          } satisfies DnsRecordResult
        }

        return {
          id: data.result.id,
          type: data.result.type,
          name: data.result.name,
          content: data.result.content,
          success: true,
        } satisfies DnsRecordResult
      }),
    )

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      return {
        id: '',
        type: records[i].type,
        name: records[i].name,
        content: records[i].content,
        success: false,
        error: r.reason instanceof Error ? r.reason.message : 'Unknown error',
      }
    })
  }

  async listRecords(zoneId: string): Promise<DnsRecordResult[]> {
    const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records?per_page=100`, {
      headers: this.headers(),
    })
    const data = (await res.json()) as CfResponse<Array<{ id: string; type: string; name: string; content: string }>>

    if (!data.success) return []

    return data.result.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      content: r.content,
      success: true,
    }))
  }

  async deleteRecord(zoneId: string, recordId: string): Promise<boolean> {
    const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records/${recordId}`, {
      method: 'DELETE',
      headers: this.headers(),
    })
    const data = (await res.json()) as CfResponse<{ id: string }>
    return data.success
  }
}
