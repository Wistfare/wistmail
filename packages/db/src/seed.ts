/**
 * System data seed — idempotent, ON CONFLICT DO NOTHING for inserts.
 *
 * Seeds:
 *   - 5 system roles (owner, admin, manager, finance, member) with `is_system=true`
 *   - role_permissions per role:
 *       owner   → "*"        (god mode, including org:transfer & org:delete)
 *       admin   → all except org:transfer & org:delete
 *       manager → users:read, users:invite, roles:assign (with maxLevel=60), audit:read
 *       finance → billing:*  + audit:read
 *       member  → no admin permissions (members do not see admin)
 *   - 1 default Team plan (code='team', $3/seat/month, 1 GB/seat, 7-day trial, 7-day grace)
 *   - 11 plan_features for the Team plan: app togglesi, storage, outbound, rate limit, MFA flags
 *
 * IDs are deterministic (rol_sys_<code>, perm_<role>_<perm>, pln_team, pf_team_<key>) so
 * re-runs hit the unique constraint cleanly. Run on every API boot via ensureSchema().
 */
import { sql } from 'drizzle-orm'
import type { Database } from './connection'

/** Permission strings used by the admin permission gate. Keep in sync with roles.ts header. */
const ALL_ADMIN_PERMISSIONS = [
  // Resources × actions. NOT exhaustive — extend as new resources land.
  'billing:read',
  'billing:write',
  'billing:export',
  'users:read',
  'users:invite',
  'users:write',
  'users:delete',
  'users:suspend',
  'roles:read',
  'roles:write',
  'roles:assign',
  'domains:read',
  'domains:write',
  'domains:delete',
  'audit:read',
  'audit:export',
  'org:read',
  'org:write',
  'api_keys:read',
  'api_keys:write',
  'api_keys:delete',
  'webhooks:read',
  'webhooks:write',
  'webhooks:delete',
  'security:read',
  'security:write',
  'analytics:read',
  'plans:read',
] as const

interface SystemRole {
  code: string
  name: string
  description: string
  level: number
  grantsAdminAccess: boolean
  permissions: readonly string[] // strings; "*" wildcard supported
}

const SYSTEM_ROLES: readonly SystemRole[] = [
  {
    code: 'owner',
    name: 'Owner',
    description: 'Workspace owner. Can do anything, including transfer and delete.',
    level: 100,
    grantsAdminAccess: true,
    permissions: ['*'],
  },
  {
    code: 'admin',
    name: 'Admin',
    description: 'Workspace admin. Everything except owner-transfer and workspace-deletion.',
    level: 80,
    grantsAdminAccess: true,
    permissions: ALL_ADMIN_PERMISSIONS,
  },
  {
    code: 'manager',
    name: 'Manager',
    description: 'Manages users and assigns roles below their level. No billing writes.',
    level: 60,
    grantsAdminAccess: true,
    permissions: ['users:read', 'users:invite', 'roles:assign', 'audit:read'],
  },
  {
    code: 'finance',
    name: 'Finance',
    description: 'Billing reads, writes, and exports. No user management.',
    level: 50,
    grantsAdminAccess: true,
    permissions: ['billing:read', 'billing:write', 'billing:export', 'audit:read'],
  },
  {
    code: 'member',
    name: 'Member',
    description: 'End user. No admin dashboard access.',
    level: 10,
    grantsAdminAccess: false,
    permissions: [],
  },
]

interface PlanFeature {
  key: string
  value: boolean | number | null
  label: string
}

const TEAM_PLAN_FEATURES: readonly PlanFeature[] = [
  { key: 'apps.mail', value: true, label: 'Email' },
  { key: 'apps.chat', value: true, label: 'Chat' },
  { key: 'apps.calendar', value: true, label: 'Calendar' },
  { key: 'apps.projects', value: true, label: 'Projects' },
  { key: 'apps.docs', value: true, label: 'Docs' },
  { key: 'apps.meetings', value: true, label: 'Meetings' },
  { key: 'storage.tier_mb', value: null, label: 'Workspace storage cap (null = sum of seat allowances)' },
  { key: 'outbound.daily', value: null, label: 'Outbound emails per day (null = unlimited)' },
  { key: 'api.rate_per_min', value: 600, label: 'API requests per minute per key' },
  { key: 'seats.max', value: null, label: 'Maximum seats (null = unlimited)' },
  { key: 'mfa.totp', value: true, label: 'TOTP authenticator MFA' },
  { key: 'mfa.email', value: true, label: 'Email-code MFA' },
]

const TEAM_PLAN = {
  id: 'pln_team',
  code: 'team',
  name: 'Team',
  description: '$3 per seat per month. All apps, 1 GB storage per seat, 7-day trial, 7-day grace.',
  perSeatCents: 300,
  includedStorageMbPerSeat: 1024,
  trialDays: 7,
  gracePeriodDays: 7,
  currency: 'USD',
  active: true,
  sortOrder: 100,
} as const

/**
 * Seed system data into the given DB. Idempotent: re-running produces no
 * additional rows and never throws.
 *
 * Strategy: raw SQL via drizzle's `sql` helper. We bypass the typed query
 * builder so the seed stays usable from `ensureSchema()` (which itself uses
 * raw SQL) and so deterministic IDs land via `INSERT ... ON CONFLICT DO NOTHING`
 * regardless of column-default oddities.
 */
export async function seedSystemData(db: Database): Promise<void> {
  // Insert system roles. Partial unique indexes can't be used as ON CONFLICT
  // targets in postgres, so we conflict on the primary key instead — works
  // because IDs are deterministic (rol_sys_<code>).
  for (const role of SYSTEM_ROLES) {
    const roleId = `rol_sys_${role.code}`
    await db.execute(sql`
      INSERT INTO roles (id, code, name, description, org_id, is_system, level, grants_admin_access)
      VALUES (
        ${roleId},
        ${role.code},
        ${role.name},
        ${role.description},
        NULL,
        true,
        ${role.level},
        ${role.grantsAdminAccess}
      )
      ON CONFLICT (id) DO NOTHING
    `)

    for (const permission of role.permissions) {
      const permId = `perm_${role.code}_${permission.replace(/[^a-z0-9]/gi, '_')}`
      await db.execute(sql`
        INSERT INTO role_permissions (id, role_id, permission, constraints)
        VALUES (
          ${permId},
          ${roleId},
          ${permission},
          ${role.code === 'manager' && permission === 'roles:assign'
            ? sql`'{"maxLevel":60}'::jsonb`
            : sql`NULL`}
        )
        ON CONFLICT (id) DO NOTHING
      `)
    }
  }

  // Insert default Team plan.
  await db.execute(sql`
    INSERT INTO plans (
      id, code, name, description, per_seat_cents, included_storage_mb_per_seat,
      trial_days, grace_period_days, currency, active, sort_order
    )
    VALUES (
      ${TEAM_PLAN.id},
      ${TEAM_PLAN.code},
      ${TEAM_PLAN.name},
      ${TEAM_PLAN.description},
      ${TEAM_PLAN.perSeatCents},
      ${TEAM_PLAN.includedStorageMbPerSeat},
      ${TEAM_PLAN.trialDays},
      ${TEAM_PLAN.gracePeriodDays},
      ${TEAM_PLAN.currency},
      ${TEAM_PLAN.active},
      ${TEAM_PLAN.sortOrder}
    )
    ON CONFLICT (id) DO NOTHING
  `)

  // Insert plan_features.
  for (const feat of TEAM_PLAN_FEATURES) {
    const pfId = `pf_team_${feat.key.replace(/\./g, '_')}`
    await db.execute(sql`
      INSERT INTO plan_features (id, plan_id, key, value, label)
      VALUES (
        ${pfId},
        ${TEAM_PLAN.id},
        ${feat.key},
        ${feat.value === null ? sql`NULL` : sql`${JSON.stringify(feat.value)}::jsonb`},
        ${feat.label}
      )
      ON CONFLICT (id) DO NOTHING
    `)
  }
}
