/**
 * Role-Based Access Control schema.
 *
 * Three layers, on purpose:
 *   1. `roles`            — role definitions, scoped to either "system" (built-in,
 *                           seeded once, never deleted) or to an org (custom roles
 *                           the workspace creates later).
 *   2. `rolePermissions`  — permission rows attached to a role. Permissions are
 *                           "<resource>:<action>" strings (e.g. "billing:write",
 *                           "users:invite"). Wildcards: "*" or "billing:*".
 *   3. `orgRoleAssignments` — joins users → roles inside an organization.
 *                             Replaces the legacy single `org_members.role` enum.
 *
 * The legacy `org_members.role` column stays for backwards compatibility — the
 * permission helper falls back to it when no orgRoleAssignment row exists yet.
 *
 * System roles seeded by 0008 migration / seed.ts:
 *   - owner    — wildcard "*" (everything, including billing & domain destruction)
 *   - admin    — everything except owner-transfer & workspace-deletion
 *   - manager  — user invites, role assignments below their level, no billing writes
 *   - finance  — billing reads + writes, no user management
 *   - member   — end user, NO admin dashboard access
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { organizations } from './organizations'
import { users } from './users'

export const roles = pgTable(
  'roles',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    /**
     * Stable machine code. For system roles: "owner", "admin", "manager",
     * "finance", "member". For custom roles: any unique string within the
     * org (e.g. "billing_viewer").
     */
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    /**
     * NULL = system role (shared by every org). Otherwise = custom role
     * scoped to that org.
     */
    orgId: varchar('org_id', { length: 64 }).references(
      () => organizations.id,
      { onDelete: 'cascade' },
    ),
    /**
     * System roles cannot be edited or deleted from the UI. Set TRUE for
     * the seeded rows and never flip to FALSE.
     */
    isSystem: boolean('is_system').notNull().default(false),
    /**
     * Higher number = more authority. Used to enforce "you can only assign
     * roles at or below your own level" in the manager flow.
     *
     * Seed: owner=100, admin=80, manager=60, finance=50, member=10.
     */
    level: integer('level').notNull().default(10),
    /**
     * Whether this role grants any access to the admin dashboard at all.
     * Members are FALSE — the web shell uses this to hide /admin/* entirely.
     */
    grantsAdminAccess: boolean('grants_admin_access').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // System roles: code is globally unique. Custom roles: code unique per org.
    uniqueIndex('roles_system_code_uidx')
      .on(table.code)
      .where(sql`org_id IS NULL`),
    uniqueIndex('roles_org_code_uidx')
      .on(table.orgId, table.code)
      .where(sql`org_id IS NOT NULL`),
    index('roles_org_idx').on(table.orgId),
  ],
)

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    /**
     * Permission string, "<resource>:<action>". Supports two wildcard forms:
     *   - "*"             — all permissions (owner only)
     *   - "billing:*"     — all actions on resource
     *
     * Canonical action verbs: read, write, delete, invite, suspend, manage,
     * export. Resources: billing, users, roles, domains, audit, org,
     * api_keys, webhooks, security, analytics, plans.
     */
    permission: varchar('permission', { length: 128 }).notNull(),
    /** Optional metadata (e.g. constraints scoped to a sub-resource). */
    constraints: jsonb('constraints').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('role_permissions_uidx').on(table.roleId, table.permission),
    index('role_permissions_role_idx').on(table.roleId),
  ],
)

export const orgRoleAssignments = pgTable(
  'org_role_assignments',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    orgId: varchar('org_id', { length: 64 })
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id', { length: 64 })
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    /** Who assigned this role. */
    assignedBy: varchar('assigned_by', { length: 64 }).references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A user can hold multiple roles in an org, but never the same role twice.
    uniqueIndex('org_role_assignments_uidx').on(
      table.orgId,
      table.userId,
      table.roleId,
    ),
    index('org_role_assignments_org_user_idx').on(table.orgId, table.userId),
    index('org_role_assignments_role_idx').on(table.roleId),
  ],
)
