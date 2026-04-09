import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROVIDER_ID = 'mail.wistfare.com'
const SERVICE_ID = 'mail-setup'
const KEY_ID = '_domainconnect'

// Cloudflare Domain Connect apply URL base
const CF_DOMAIN_CONNECT_BASE = 'https://dash.cloudflare.com/cdn-cgi/domainconnect/v2/domainTemplates/providers'

let privateKey: string | null = null

function getPrivateKey(): string {
  if (privateKey) return privateKey

  // Try multiple locations for the key
  const paths = [
    resolve(process.cwd(), 'domain-connect/keys/domain-connect-private.pem'),
    resolve(process.cwd(), '../../domain-connect/keys/domain-connect-private.pem'),
    '/opt/wistmail/domain-connect/keys/domain-connect-private.pem',
  ]

  for (const p of paths) {
    try {
      privateKey = readFileSync(p, 'utf-8')
      return privateKey
    } catch {
      continue
    }
  }

  throw new Error('Domain Connect private key not found')
}

interface DomainConnectParams {
  domain: string
  serverIp: string
  dkimKey: string
  redirectUri: string
}

/**
 * Generate the signed Domain Connect apply URL for Cloudflare.
 *
 * Flow: User visits this URL → Cloudflare shows DNS changes → User authorizes → Redirect back
 */
export function generateDomainConnectUrl(params: DomainConnectParams): string {
  const { domain, serverIp, dkimKey, redirectUri } = params

  // Build the base apply URL
  const basePath = `${CF_DOMAIN_CONNECT_BASE}/${encodeURIComponent(PROVIDER_ID)}/services/${encodeURIComponent(SERVICE_ID)}/apply`

  // Query parameters (template variables + redirect)
  const queryParams = new URLSearchParams({
    domain,
    serverIp,
    dkimKey,
    redirect_uri: redirectUri,
  })

  // The content to sign is the path + query string (before adding sig and key)
  const contentToSign = `${basePath}?${queryParams.toString()}`

  // Sign with RSA-SHA256
  const key = getPrivateKey()
  const signer = createSign('RSA-SHA256')
  signer.update(contentToSign)
  const signature = signer.sign(key, 'base64url')

  // Append signature and key (must be last params per spec)
  queryParams.append('sig', signature)
  queryParams.append('key', KEY_ID)

  return `${basePath}?${queryParams.toString()}`
}

/**
 * Verify the callback from Cloudflare Domain Connect.
 * Returns success/error status from query params.
 */
export function verifyDomainConnectCallback(queryParams: Record<string, string>): {
  success: boolean
  error?: string
} {
  if (queryParams.error) {
    return {
      success: false,
      error: queryParams.error === 'access_denied'
        ? 'Authorization was denied. Please try again.'
        : queryParams.error === 'invalid_request'
          ? 'Invalid request. Please try again.'
          : `Authorization failed: ${queryParams.error}`,
    }
  }

  // No error param means success
  return { success: true }
}
