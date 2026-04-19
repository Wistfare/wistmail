import { eq } from 'drizzle-orm'
import { organizations, orgMembers, domains } from '@wistmail/db'
import type { Database } from '@wistmail/db'

/// Resolve the org name and the verified domain for the user's outbound
/// notification mail. Used by every flow that sends mail on behalf of a
/// user (invitation, reset, MFA codes).
export async function resolveOrgFrom(
  db: Database,
  userId: string,
  fallbackDomain: string,
): Promise<{ orgName: string; fromDomain: string }> {
  const orgRow = await db
    .select({
      orgName: organizations.name,
      ownerId: organizations.ownerId,
    })
    .from(organizations)
    .innerJoin(orgMembers, eq(orgMembers.orgId, organizations.id))
    .where(eq(orgMembers.userId, userId))
    .limit(1)

  const orgName = orgRow[0]?.orgName || fallbackDomain
  const ownerId = orgRow[0]?.ownerId

  let fromDomain = fallbackDomain
  if (ownerId) {
    const dom = await db
      .select({ name: domains.name })
      .from(domains)
      .where(eq(domains.userId, ownerId))
      .limit(1)
    if (dom.length > 0) fromDomain = dom[0].name
  }
  return { orgName, fromDomain }
}
