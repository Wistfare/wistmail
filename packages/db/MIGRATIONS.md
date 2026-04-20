# Migrations

Two paths into a live schema:

## 1. `ensureSchema` (default)

`apps/api/src/index.ts → ensureSchema()` runs a hand-maintained list
of idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD
COLUMN IF NOT EXISTS` statements on every API boot. This has been
the path since day one; it's what every existing WistMail install
is using.

Pros: zero risk, works on every restart regardless of DB state.
Cons: schema drift between the TS definitions and the SQL isn't
caught until runtime, and there's no audit trail of what changed
when.

## 2. Drizzle migrations

`pnpm --filter @wistmail/db generate` writes `.sql` files into
`packages/db/drizzle/` against the checked-in TS schema. `pnpm
--filter @wistmail/db migrate` applies them in order, keeping a
`__drizzle_migrations` table on the target DB so each migration
runs exactly once.

### For greenfield installs

Point `DATABASE_URL` at the fresh DB and:

```sh
pnpm --filter @wistmail/db migrate
```

Then boot the API with `DISABLE_ENSURE_SCHEMA=1` so `ensureSchema`
doesn't try to double-create what drizzle just made.

### For existing installs

`ensureSchema` has already applied the whole current schema. To
switch that DB to migration-based management without re-running
CREATE statements:

```sh
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS __drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash TEXT NOT NULL,
    created_at BIGINT NOT NULL
  );
  INSERT INTO __drizzle_migrations (hash, created_at)
  SELECT hash, (extract(epoch from now()) * 1000)::bigint
  FROM (VALUES
    ('<hash from drizzle/meta/_journal.json>')
  ) AS t(hash)
  ON CONFLICT DO NOTHING;
"
```

Replace `<hash>` with the hash from `packages/db/drizzle/meta/_journal.json`
for the migration you want to mark as already-applied (usually
`0000_snapshot_from_ensure_schema`). Subsequent `drizzle-kit migrate`
runs pick up only new migrations.

### Adding a new migration

1. Edit the schema in `packages/db/src/schema/*.ts`.
2. `pnpm --filter @wistmail/db generate` — writes a new `.sql`.
3. Commit both the schema change and the migration file together.
4. Deploy: run `migrate` before starting the new API build.
5. Mirror the change in `apps/api/src/index.ts → ensureSchema()` so
   the legacy path keeps working for deploys still using it.

Step 5 is annoying but keeps both paths honest until we fully
deprecate `ensureSchema`.
