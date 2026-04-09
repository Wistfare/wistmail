import type { DnsProvider, DnsRecordInput, DnsRecordResult } from '../types.js'

export class ManualProvider implements DnsProvider {
  async verifyConnection(): Promise<{ valid: boolean }> {
    return { valid: true }
  }

  async createRecords(_zoneId: string, _records: DnsRecordInput[]): Promise<DnsRecordResult[]> {
    throw new Error('Manual provider does not support auto-configuration. Records must be added manually.')
  }

  async listRecords(): Promise<DnsRecordResult[]> {
    return []
  }

  async deleteRecord(): Promise<boolean> {
    throw new Error('Manual provider does not support record deletion.')
  }
}
