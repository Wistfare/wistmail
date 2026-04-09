export type DnsProviderType = 'cloudflare' | 'manual'

export interface DnsProviderConfig {
  provider: DnsProviderType
  cloudflare?: {
    apiToken: string
    zoneId?: string
  }
}

export interface DnsRecordInput {
  type: 'MX' | 'TXT' | 'CNAME' | 'A'
  name: string
  content: string
  priority?: number
  ttl?: number
  proxied?: boolean
}

export interface DnsRecordResult {
  id: string
  type: string
  name: string
  content: string
  success: boolean
  error?: string
}

export interface DnsProvider {
  verifyConnection(domain: string): Promise<{ valid: boolean; zoneId?: string; error?: string }>
  createRecords(zoneId: string, records: DnsRecordInput[]): Promise<DnsRecordResult[]>
  listRecords(zoneId: string): Promise<DnsRecordResult[]>
  deleteRecord(zoneId: string, recordId: string): Promise<boolean>
}
