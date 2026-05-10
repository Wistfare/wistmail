# Local development with Docker Compose

> **Note for reviewers.** This runbook ships alongside the Phase I
> infra change. The smoke script at `scripts/docker-smoke.sh` and the
> `docker compose up` flow described below were **not** executed inside
> the agent worktree (no docker daemon was reachable from that
> environment). Validate the run locally before merge — see [Smoke
> test](#smoke-test) for the one-liner.

---

## TL;DR

```bash
cp .env.example .env       # then edit secrets if you like — defaults work
docker compose up -d       # postgres, redis, minio, meili, mail-engine,
                           # api, web, docs, ai-worker, billing-cron
```

The first run takes a while because it builds three Node images and the
Go mail engine. Subsequent runs are cached — under a minute on a warm
machine.

Open <http://localhost:3000> for the web client. The api is on
<http://localhost:3001>, docs on <http://localhost:3002>, MinIO console
on <http://localhost:9001>.

---

## What runs

| Service        | Port (host)         | Image / build                             | Purpose                              |
| -------------- | ------------------- | ----------------------------------------- | ------------------------------------ |
| `postgres`     | _(internal only)_   | `postgres:16-alpine`                      | Primary datastore                    |
| `redis`        | _(internal only)_   | `redis:7-alpine`                          | BullMQ queues, pub/sub, hot caches   |
| `minio`        | `9000` API, `9001` console | `minio/minio:latest`               | S3-compatible attachment storage     |
| `meilisearch`  | _(internal only)_   | `getmeili/meilisearch:latest`             | Email full-text search index         |
| `mail-engine`  | `25/587/143/993`    | `packages/mail-engine/Dockerfile`         | Go SMTP + IMAP + DKIM/SPF/DMARC      |
| `api`          | `3001`              | `apps/api/Dockerfile`                     | Hono REST + WebSocket gateway        |
| `web`          | `3000`              | `apps/web/Dockerfile`                     | Next.js client                       |
| `docs`         | `3002`              | `apps/docs/Dockerfile`                    | Public docs site                     |
| `ai-worker`    | _(none)_            | `apps/ai-worker/Dockerfile`               | BullMQ consumer for classify/draft   |
| `billing-cron` | _(none)_            | `scripts/Dockerfile.cron`                 | Hits `/billing/internal/tick` every 5min |
| `caddy`        | `80/443` (profile)  | `caddy:2-alpine`                          | Reverse proxy — only under `--profile proxy` |

`docker compose up -d` brings up everything except `caddy`. To exercise
the full reverse-proxy path (rare in local dev), use:

```bash
docker compose --profile proxy up -d
```

---

## Logs

Stream all services:

```bash
docker compose logs -f
```

Just one:

```bash
docker compose logs -f api
docker compose logs -f mail-engine
docker compose logs -f billing-cron     # heartbeat: "tick ok status=200 …"
```

A clean api boot prints `Database schema verified`, `System seed data
verified`, then `Wistfare Mail API running on http://localhost:3001`.

---

## Smoke test

`scripts/docker-smoke.sh` is a POSIX bash script that boots the stack,
drives a representative happy-path flow, and tears down.

```bash
bash scripts/docker-smoke.sh
```

The flow it runs (each step exits non-zero on the first unexpected
status code):

1. `POST /api/v1/setup/domain` — claim a fresh domain, takes the
   setup-token cookie
2. `POST /api/v1/setup/skip-dns` — advance past DNS verify (requires
   `ALLOW_SKIP_DNS=true`, set in `.env.example`)
3. `POST /api/v1/setup/account` — create the admin user + org +
   session cookie. WistMail has no `/auth/signup`; the setup wizard is
   the front door.
4. `POST /api/v1/admin/users/create` — invite a teammate
5. `POST /api/v1/billing/subscribe` — start a trial on the seeded
   `team` plan (precondition for the renewal tick to do anything
   visible)
6. `POST /api/v1/billing/topup` — initiate a Wistfare collection.
   `WISTFARE_API_KEY` is unset in `.env.example`, so the client returns
   a stubbed `col_stub_<idem>` response.
7. `POST /api/v1/billing/webhooks/wistfare` — simulate
   `collection.completed` for that attempt
8. `POST /api/v1/billing/internal/tick` — force a renewal cycle with
   `X-Inbound-Secret`
9. `GET /api/v1/billing/wallet` — assert a `topup` ledger row landed
10. `POST /api/v1/auth/logout`

A successful run ends with `SMOKE OK`. Failure dumps the offending
response body to stderr. The trap on `EXIT` always runs
`docker compose down -v --remove-orphans` so the host is left clean.

---

## Seeding test data

`apps/api/src/dev/seed.ts` is the development seed. Invoke it from the
host (it talks to the same Postgres the api container uses):

```bash
pnpm --filter @wistmail/api dev:seed
```

The base system seed (plans, system roles) runs automatically on api
boot via `seedSystemData`. There is no fixture seed for emails / chat
yet — the `dev:seed` script handles a small workspace fixture.

---

## Tear-down

```bash
docker compose down -v
```

Drops every named volume — Postgres, Redis, MinIO, Meili, Caddy data.
Use `docker compose stop` to keep volumes if you want to resume.

---

## Common issues

- **Port 25/587 already in use.** macOS doesn't ship anything on these
  by default, but Linux distros sometimes do. Override with
  `SMTP_PORT_HOST=2525` etc. in `.env`.
- **`api` never becomes healthy.** Check `docker compose logs api`
  — almost always a missing required env var. Compose fails up-front
  with "X is required" for the obvious ones; the api itself logs
  schema bootstrap errors clearly.
- **MinIO healthcheck fails on first boot.** Give it ~10s; it
  initializes the data dir on first launch. The compose healthcheck
  retries for 50s.
- **billing-cron logs `INBOUND_SECRET not set`.** It pulls the secret
  from the same `.env`; a stale secret-mismatch will print
  `tick non-2xx status=401` on every cycle.
