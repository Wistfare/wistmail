import { desc, eq } from 'drizzle-orm'
import { auditLogs, users } from '@wistmail/db'
import { generateId } from '@wistmail/shared'
import type { Database } from '@wistmail/db'

export class AuditService {
  constructor(private db: Database) {}

  async log(input: {
    userId: string | null
    action: string
    resource: string
    resourceId?: string
    details?: Record<string, unknown>
    ipAddress?: string
    userAgent?: string
  }) {
    const logId = generateId('aud')
    await this.db.insert(auditLogs).values({
      id: logId,
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId || null,
      details: input.details || {},
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
    })
    return logId
  }

  async list(options: { userId?: string; limit?: number; offset?: number } = {}) {
    const limit = options.limit || 50
    const offset = options.offset || 0

    let query = this.db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        action: auditLogs.action,
        resource: auditLogs.resource,
        resourceId: auditLogs.resourceId,
        details: auditLogs.details,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset)

    return query
  }
}
