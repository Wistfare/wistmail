import { describe, it, expect, beforeAll } from 'vitest'
import { TOTP, Secret } from 'otpauth'
import { encryptSecret, decryptSecret } from '../lib/secret-crypto.js'

beforeAll(() => {
  // Make sure the dev key path runs without throwing.
  delete process.env.MFA_SECRETS_KEY
})

describe('secret-crypto', () => {
  it('roundtrips a TOTP secret through AES-GCM', () => {
    const plain = new Secret({ size: 20 }).base32
    const blob = encryptSecret(plain)
    expect(blob).not.toContain(plain)
    expect(blob.split(':')).toHaveLength(3)
    expect(decryptSecret(blob)).toBe(plain)
  })

  it('produces different ciphertext on each encrypt (random IV)', () => {
    const plain = 'JBSWY3DPEHPK3PXP'
    const a = encryptSecret(plain)
    const b = encryptSecret(plain)
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe(plain)
    expect(decryptSecret(b)).toBe(plain)
  })

  it('rejects a tampered ciphertext', () => {
    const blob = encryptSecret('hello')
    // Flip a byte in the last segment
    const parts = blob.split(':')
    const ct = Buffer.from(parts[2], 'base64')
    ct[0] = ct[0] ^ 0x01
    parts[2] = ct.toString('base64')
    expect(() => decryptSecret(parts.join(':'))).toThrow()
  })
})

describe('TOTP code generation (sanity check)', () => {
  it('verifies its own generated code within the window', () => {
    const secret = new Secret({ size: 20 }).base32
    const totp = new TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    })
    const code = totp.generate()
    expect(code).toMatch(/^\d{6}$/)
    expect(totp.validate({ token: code, window: 1 })).not.toBeNull()
  })
})
