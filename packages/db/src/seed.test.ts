/**
 * Phase C schema + seed tests.
 *
 * Uses PGlite (in-process WASM Postgres) so we exercise the real .sql files
 * shipped to production, not a re-implementation. The fixture imports every
 * checked-in drizzle/*.sql in numeric order — if a migration is broken, the
 * fixture itself fails and we get a clear failure here.
 */
import { describe, expect, test, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as schema from './schema/index'
import { wallets, subscriptions, walletTransactions, collectionAttempts } from './schema/index'
import { seedSystemData } from './seed'

let pg: PGlite
let db: ReturnType<typeof drizzle>

async function applyMigrations(target: PGlite): Promise<void> {
  // Vitest runs from the package root (packages/db) when invoked via
  // `pnpm --filter @wistmail/db test`, so drizzle/ is at cwd.
  const migrationsDir = resolve(process.cwd(), 'drizzle')
  const entries = await readdir(migrationsDir)
  const files = entries.filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
  for (const file of files) {
    const content = await readFile(resolve(migrationsDir, file), 'utf8')
    const stmts = content
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of stmts) {
      await target.exec(stmt)
    }
  }
}

beforeAll(async () => {
  pg = new PGlite()
  await applyMigrations(pg)
  db = drizzle(pg, { schema })
})

describe('Phase C schema presence', () => {
  test('wallets table is defined with expected columns', () => {
    expect(wallets).toBeDefined()
    expect(wallets.id).toBeDefined()
    expect(wallets.orgId).toBeDefined()
    expect(wallets.balanceCents).toBeDefined()
    expect(wallets.frozen).toBeDefined()
  })

  test('subscriptions table is defined with state-machine columns', () => {
    expect(subscriptions).toBeDefined()
    expect(subscriptions.status).toBeDefined()
    expect(subscriptions.planId).toBeDefined()
    expect(subscriptions.trialEndsAt).toBeDefined()
    expect(subscriptions.currentPeriodEnd).toBeDefined()
    expect(subscriptions.graceEndsAt).toBeDefined()
  })

  test('wallet_transactions ledger is defined', () => {
    expect(walletTransactions).toBeDefined()
    expect(walletTransactions.amountCents).toBeDefined()
    expect(walletTransactions.balanceAfterCents).toBeDefined()
    expect(walletTransactions.provider).toBeDefined()
    expect(walletTransactions.providerRef).toBeDefined()
  })

  test('collection_attempts table is defined', () => {
    expect(collectionAttempts).toBeDefined()
    expect(collectionAttempts.idempotencyKey).toBeDefined()
    expect(collectionAttempts.providerCollectionId).toBeDefined()
    expect(collectionAttempts.method).toBeDefined()
  })

  test('all four billing tables exist in the live database', async () => {
    const res = await pg.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('wallets', 'subscriptions', 'wallet_transactions', 'collection_attempts')
      ORDER BY table_name
    `)
    expect(res.rows.map((r) => r.table_name).sort()).toEqual([
      'collection_attempts',
      'subscriptions',
      'wallet_transactions',
      'wallets',
    ])
  })
})

describe('seedSystemData', () => {
  test('greenfield: seeds 5 system roles, default Team plan, plan features', async () => {
    await seedSystemData(db as never)

    const roleRows = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM roles WHERE is_system = true`,
    )
    expect(Number(roleRows.rows[0].count)).toBe(5)

    const planRows = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM plans WHERE code = 'team'`,
    )
    expect(Number(planRows.rows[0].count)).toBe(1)

    const featureRows = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM plan_features WHERE plan_id = 'pln_team'`,
    )
    expect(Number(featureRows.rows[0].count)).toBe(12)

    // Spot-check: owner has wildcard, member has zero permissions.
    const ownerPerms = await pg.query<{ permission: string }>(
      `SELECT permission FROM role_permissions WHERE role_id = 'rol_sys_owner'`,
    )
    expect(ownerPerms.rows.map((r) => r.permission)).toEqual(['*'])

    const memberPerms = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM role_permissions WHERE role_id = 'rol_sys_member'`,
    )
    expect(Number(memberPerms.rows[0].count)).toBe(0)
  })

  test('idempotent: re-running produces no extra rows', async () => {
    // First run already happened above. Run twice more — counts must hold.
    await seedSystemData(db as never)
    await seedSystemData(db as never)

    const r = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM roles WHERE is_system = true`,
    )
    expect(Number(r.rows[0].count)).toBe(5)

    const f = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM plan_features WHERE plan_id = 'pln_team'`,
    )
    expect(Number(f.rows[0].count)).toBe(12)
  })
})

describe('billing constraints', () => {
  test('wallet_transactions: same (provider, provider_ref) cannot insert twice', async () => {
    // Need an org + user + wallet to satisfy FKs.
    await pg.exec(`
      INSERT INTO users (id, email, name, password_hash) VALUES ('u_idem', 'idem@test.com', 'Idem', 'x') ON CONFLICT DO NOTHING;
      INSERT INTO organizations (id, name, slug, owner_id) VALUES ('o_idem', 'Idem Org', 'idem-org', 'u_idem') ON CONFLICT DO NOTHING;
      INSERT INTO wallets (id, org_id) VALUES ('w_idem', 'o_idem') ON CONFLICT DO NOTHING;
    `)
    await pg.exec(`
      INSERT INTO wallet_transactions (id, wallet_id, org_id, amount_cents, balance_after_cents, reason, provider, provider_ref)
      VALUES ('tx_idem_1', 'w_idem', 'o_idem', 1000, 1000, 'topup', 'wistfare_collections', 'col_abc')
    `)
    let threw = false
    try {
      await pg.exec(`
        INSERT INTO wallet_transactions (id, wallet_id, org_id, amount_cents, balance_after_cents, reason, provider, provider_ref)
        VALUES ('tx_idem_2', 'w_idem', 'o_idem', 1000, 2000, 'topup', 'wistfare_collections', 'col_abc')
      `)
    } catch (err) {
      threw = true
      expect(String(err)).toMatch(/wallet_transactions_provider_ref_uidx|duplicate/i)
    }
    expect(threw).toBe(true)
  })

  test('subscriptions: only one non-cancelled subscription per org', async () => {
    await pg.exec(`
      INSERT INTO users (id, email, name, password_hash) VALUES ('u_sub', 'sub@test.com', 'Sub', 'x') ON CONFLICT DO NOTHING;
      INSERT INTO organizations (id, name, slug, owner_id) VALUES ('o_sub', 'Sub Org', 'sub-org', 'u_sub') ON CONFLICT DO NOTHING;
    `)
    // First non-cancelled sub OK.
    await pg.exec(`
      INSERT INTO subscriptions (id, org_id, plan_id, status, seats)
      VALUES ('sub_1', 'o_sub', 'pln_team', 'trial', 1)
    `)
    // Second one should be rejected.
    let threw = false
    try {
      await pg.exec(`
        INSERT INTO subscriptions (id, org_id, plan_id, status, seats)
        VALUES ('sub_2', 'o_sub', 'pln_team', 'active', 1)
      `)
    } catch (err) {
      threw = true
      expect(String(err)).toMatch(/subscriptions_org_active_uidx|duplicate/i)
    }
    expect(threw).toBe(true)

    // After cancelling the first, second insert succeeds.
    await pg.exec(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = now() WHERE id = 'sub_1'`)
    await pg.exec(`
      INSERT INTO subscriptions (id, org_id, plan_id, status, seats)
      VALUES ('sub_3', 'o_sub', 'pln_team', 'active', 1)
    `)
    const rows = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM subscriptions WHERE org_id = 'o_sub' AND status <> 'cancelled'`,
    )
    expect(Number(rows.rows[0].count)).toBe(1)
  })
})
