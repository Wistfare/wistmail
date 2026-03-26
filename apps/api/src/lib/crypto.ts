import { generateKeyPairSync } from 'node:crypto'

export async function generateDkimKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  })

  // Extract the base64 key content for DNS TXT record
  const publicKeyBase64 = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '')
    .trim()

  const publicKeyDns = `v=DKIM1; k=rsa; p=${publicKeyBase64}`

  return { privateKey, publicKeyDns }
}
