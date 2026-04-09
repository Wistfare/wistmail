import type { DnsProvider, DnsProviderConfig } from './types.js'
import { CloudflareProvider } from './providers/cloudflare.js'
import { ManualProvider } from './providers/manual.js'

export function createDnsProvider(config: DnsProviderConfig): DnsProvider {
  switch (config.provider) {
    case 'cloudflare':
      if (!config.cloudflare?.apiToken) {
        throw new Error('Cloudflare API token is required')
      }
      return new CloudflareProvider(config.cloudflare)
    case 'manual':
      return new ManualProvider()
    default:
      throw new Error(`Unknown DNS provider: ${config.provider}`)
  }
}
