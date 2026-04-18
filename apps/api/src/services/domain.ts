import { eq } from 'drizzle-orm'
import { domains } from '@wistmail/db'
import {
  generateId,
  ValidationError,
  NotFoundError,
  ConflictError,
  isValidDomain,
  DKIM_SELECTOR,
} from '@wistmail/shared'
import type { Database } from '@wistmail/db'
import { generateDkimKeyPair } from '../lib/crypto.js'
import { getServerIp } from '../lib/server-ip.js'

export class DomainService {
  constructor(private db: Database) {}

  async create(userId: string, name: string) {
    const domainName = name.trim().toLowerCase()

    if (!isValidDomain(domainName)) {
      throw new ValidationError('Invalid domain name')
    }

    const existing = await this.db
      .select()
      .from(domains)
      .where(eq(domains.name, domainName))
      .limit(1)
    if (existing.length > 0) {
      throw new ConflictError('Domain already registered')
    }

    const { privateKey, publicKeyDns } = await generateDkimKeyPair()
    const serverIp = await getServerIp()

    const domainId = generateId('dom')
    const now = new Date()

    await this.db.insert(domains).values({
      id: domainId,
      name: domainName,
      userId,
      status: 'pending',
      dkimSelector: DKIM_SELECTOR,
      dkimPrivateKey: privateKey,
      dkimPublicKey: publicKeyDns,
      serverIp,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id: domainId,
      name: domainName,
      status: 'pending' as const,
      serverIp,
      records: this.getDnsRecords(domainName, publicKeyDns, serverIp),
    }
  }

  async createWithoutUser(name: string) {
    const domainName = name.trim().toLowerCase()

    if (!isValidDomain(domainName)) {
      throw new ValidationError('Invalid domain name')
    }

    const existing = await this.db
      .select()
      .from(domains)
      .where(eq(domains.name, domainName))
      .limit(1)
    if (existing.length > 0) {
      throw new ConflictError('Domain already registered')
    }

    const { privateKey, publicKeyDns } = await generateDkimKeyPair()
    const serverIp = await getServerIp()

    const domainId = generateId('dom')
    const now = new Date()

    await this.db.insert(domains).values({
      id: domainId,
      name: domainName,
      userId: null,
      status: 'pending',
      dkimSelector: DKIM_SELECTOR,
      dkimPrivateKey: privateKey,
      dkimPublicKey: publicKeyDns,
      serverIp,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id: domainId,
      name: domainName,
      status: 'pending' as const,
      serverIp,
      records: this.getDnsRecords(domainName, publicKeyDns, serverIp),
    }
  }

  async verifyById(domainId: string) {
    const result = await this.db.select().from(domains).where(eq(domains.id, domainId)).limit(1)
    if (result.length === 0) {
      throw new NotFoundError('Domain', domainId)
    }

    const domain = result[0]
    const checks = {
      mx: await this.checkMx(domain.name),
      spf: await this.checkSpf(domain.name),
      dkim: await this.checkDkim(domain.name, domain.dkimSelector),
      dmarc: await this.checkDmarc(domain.name),
    }

    const allVerified = checks.mx && checks.spf && checks.dkim && checks.dmarc
    const newStatus = allVerified ? 'active' : 'verifying'

    await this.db
      .update(domains)
      .set({
        mxVerified: checks.mx,
        spfVerified: checks.spf,
        dkimVerified: checks.dkim,
        dmarcVerified: checks.dmarc,
        verified: allVerified,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId))

    return { ...checks, verified: allVerified, status: newStatus }
  }

  async getRecordsById(domainId: string) {
    const result = await this.db.select().from(domains).where(eq(domains.id, domainId)).limit(1)
    if (result.length === 0) {
      throw new NotFoundError('Domain', domainId)
    }
    const domain = result[0]
    return {
      id: domain.id,
      name: domain.name,
      serverIp: domain.serverIp,
      records: this.getDnsRecords(domain.name, domain.dkimPublicKey || '', domain.serverIp || undefined),
      mx: domain.mxVerified,
      spf: domain.spfVerified,
      dkim: domain.dkimVerified,
      dmarc: domain.dmarcVerified,
    }
  }

  async list(userId: string) {
    return this.db.select().from(domains).where(eq(domains.userId, userId))
  }

  async getById(domainId: string, userId: string) {
    const result = await this.db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1)

    if (result.length === 0) {
      throw new NotFoundError('Domain', domainId)
    }

    const domain = result[0]
    if (domain.userId !== userId) {
      throw new NotFoundError('Domain', domainId)
    }

    return {
      ...domain,
      records: this.getDnsRecords(domain.name, domain.dkimPublicKey || '', domain.serverIp || undefined),
    }
  }

  async verify(domainId: string, userId: string) {
    const domain = await this.getById(domainId, userId)

    const checks = {
      mx: await this.checkMx(domain.name),
      spf: await this.checkSpf(domain.name),
      dkim: await this.checkDkim(domain.name, domain.dkimSelector),
      dmarc: await this.checkDmarc(domain.name),
    }

    const allVerified = checks.mx && checks.spf && checks.dkim && checks.dmarc
    const newStatus = allVerified ? 'active' : 'verifying'

    await this.db
      .update(domains)
      .set({
        mxVerified: checks.mx,
        spfVerified: checks.spf,
        dkimVerified: checks.dkim,
        dmarcVerified: checks.dmarc,
        verified: allVerified,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId))

    return { ...checks, verified: allVerified, status: newStatus }
  }

  async delete(domainId: string, userId: string) {
    const domain = await this.getById(domainId, userId)
    await this.db.delete(domains).where(eq(domains.id, domain.id))
  }

  async updateCloudflare(domainId: string, zoneId: string) {
    await this.db
      .update(domains)
      .set({
        dnsProvider: 'cloudflare',
        cloudflareZoneId: zoneId,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, domainId))
  }

  getDnsRecords(domainName: string, dkimPublicKey: string, serverIp?: string) {
    return [
      // A record for the MX target. MUST be unproxied (DNS-only) — if this
      // sits behind Cloudflare's orange cloud, inbound port 25 is silently
      // dropped and no external mail can be delivered.
      {
        type: 'A' as const,
        name: `mail.${domainName}`,
        value: serverIp || 'YOUR_SERVER_IP',
        verified: false,
      },
      {
        type: 'MX' as const,
        name: domainName,
        value: `mail.${domainName}`,
        priority: 10,
        verified: false,
      },
      {
        type: 'TXT' as const,
        name: domainName,
        value: `v=spf1 a mx ip4:${serverIp || 'YOUR_SERVER_IP'} ~all`,
        verified: false,
      },
      {
        type: 'TXT' as const,
        name: `${DKIM_SELECTOR}._domainkey.${domainName}`,
        value: dkimPublicKey,
        verified: false,
      },
      {
        type: 'TXT' as const,
        name: `_dmarc.${domainName}`,
        value: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainName}`,
        verified: false,
      },
    ]
  }

  private async checkMx(domain: string): Promise<boolean> {
    try {
      const { promises: dns } = await import('node:dns')
      const records = await dns.resolveMx(domain)
      return records.length > 0
    } catch {
      return false
    }
  }

  private async checkSpf(domain: string): Promise<boolean> {
    try {
      const { promises: dns } = await import('node:dns')
      const records = await dns.resolveTxt(domain)
      return records.some((r) => r.join('').startsWith('v=spf1'))
    } catch {
      return false
    }
  }

  private async checkDkim(domain: string, selector: string): Promise<boolean> {
    try {
      const { promises: dns } = await import('node:dns')
      const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`)
      return records.some((r) => r.join('').includes('v=DKIM1'))
    } catch {
      return false
    }
  }

  private async checkDmarc(domain: string): Promise<boolean> {
    try {
      const { promises: dns } = await import('node:dns')
      const records = await dns.resolveTxt(`_dmarc.${domain}`)
      return records.some((r) => r.join('').startsWith('v=DMARC1'))
    } catch {
      return false
    }
  }
}
