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

export class DomainService {
  constructor(private db: Database) {}

  async create(userId: string, name: string) {
    const domainName = name.trim().toLowerCase()

    if (!isValidDomain(domainName)) {
      throw new ValidationError('Invalid domain name')
    }

    // Check if domain already exists
    const existing = await this.db
      .select()
      .from(domains)
      .where(eq(domains.name, domainName))
      .limit(1)
    if (existing.length > 0) {
      throw new ConflictError('Domain already registered')
    }

    // Generate DKIM key pair
    const { privateKey, publicKeyDns } = await generateDkimKeyPair()

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
      createdAt: now,
      updatedAt: now,
    })

    return {
      id: domainId,
      name: domainName,
      status: 'pending' as const,
      records: this.getDnsRecords(domainName, publicKeyDns),
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
      records: this.getDnsRecords(domain.name, domain.dkimPublicKey || ''),
    }
  }

  async verify(domainId: string, userId: string) {
    const domain = await this.getById(domainId, userId)

    // In production, this would do real DNS lookups
    // For now, simulate verification checks
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

  private getDnsRecords(domainName: string, dkimPublicKey: string) {
    return [
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
        value: `v=spf1 a mx ip4:YOUR_SERVER_IP ~all`,
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
