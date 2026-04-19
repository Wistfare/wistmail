import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

/// AES-256-GCM helper for storing MFA secrets at rest.
///
/// The key is read from MFA_SECRETS_KEY (32-byte value, base64 or hex).
/// In dev, if the env var isn't set we derive a deterministic 32-byte key
/// from a development passphrase so local-only flows still work — but the
/// API logs a warning so you can't ship that to prod by accident.
///
/// Encrypted blobs are formatted as `iv:authTag:ciphertext`, all base64.

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12

let cachedKey: Buffer | null = null
let cachedKeySource: 'env' | 'dev' | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey

  const raw = process.env.MFA_SECRETS_KEY
  if (raw && raw.trim().length > 0) {
    const trimmed = raw.trim()
    let buf: Buffer
    // Accept either hex (64 chars) or base64.
    if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64) {
      buf = Buffer.from(trimmed, 'hex')
    } else {
      buf = Buffer.from(trimmed, 'base64')
    }
    if (buf.length !== 32) {
      throw new Error(
        `MFA_SECRETS_KEY must decode to 32 bytes; got ${buf.length}. ` +
        'Generate with: openssl rand -hex 32',
      )
    }
    cachedKey = buf
    cachedKeySource = 'env'
    return cachedKey
  }

  // No env key — derive a dev-only key. Loud warning so this never goes to prod.
  console.warn(
    '[secret-crypto] MFA_SECRETS_KEY is not set. Deriving an INSECURE ' +
    'development key. Set the env var with `openssl rand -hex 32` before ' +
    'shipping to production — once secrets are encrypted with the dev key ' +
    'they cannot be decrypted with the real key.',
  )
  cachedKey = createHash('sha256').update('wistmail-dev-mfa-key').digest()
  cachedKeySource = 'dev'
  return cachedKey
}

export function isUsingDevKey(): boolean {
  loadKey()
  return cachedKeySource === 'dev'
}

export function encryptSecret(plain: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':')
}

export function decryptSecret(blob: string): string {
  const key = loadKey()
  const parts = blob.split(':')
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret blob')
  }
  const iv = Buffer.from(parts[0], 'base64')
  const tag = Buffer.from(parts[1], 'base64')
  const ct = Buffer.from(parts[2], 'base64')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
