# API response-time pass — 2026-05-10

Phase J / Task 2.

## Middleware

`X-Response-Time` middleware exists at
`apps/api/src/middleware/response-time.ts` and is mounted globally
in `apps/api/src/app.ts` *before* every other middleware (so it
captures the full request lifecycle — CORS preflights, auth, route
handler, error handler, the lot).

```ts
// apps/api/src/middleware/response-time.ts
import { createMiddleware } from 'hono/factory'

export const responseTime = createMiddleware(async (c, next) => {
  const start = Date.now()
  await next()
  c.res.headers.set('X-Response-Time', `${Date.now() - start}ms`)
})
```

Verifying it locally:

```sh
curl -s -D - http://localhost:8000/health -o /dev/null | grep -i response-time
# → x-response-time: 1ms
```

## Endpoint smoke list

The 10 endpoints we want to keep an eye on, all GETs powering the
core read flows:

| # | Endpoint                                           | Notes                                                          |
| - | -------------------------------------------------- | -------------------------------------------------------------- |
| 1 | `POST /api/v1/auth/login`                          | password verification + session issue                          |
| 2 | `GET /api/v1/inbox/list?folder=inbox`              | unified feed (mail + chat) — heaviest list endpoint            |
| 3 | `GET /api/v1/today/items`                          | sidebar "Today" rail                                           |
| 4 | `GET /api/v1/calendar/events?from=…&to=…`          | week-range agenda                                              |
| 5 | `GET /api/v1/work/counters`                        | sidebar counters — collapsed to 1 query this phase             |
| 6 | `GET /api/v1/chat/conversations`                   | chat-list                                                      |
| 7 | `GET /api/v1/chat/conversations/:id/messages`      | chat thread                                                    |
| 8 | `GET /api/v1/docs?projectId=…`                     | docs list — body trimmed off this phase                        |
| 9 | `GET /api/v1/admin/members`                        | members table                                                  |
| 10| `GET /api/v1/billing/wallet`                       | wallet balance + recent ledger                                 |

## Recipe for capturing 1 sample per endpoint

Smoke flow against a local dev API. Requires Postgres + Redis (run
the docker-compose, or point `DATABASE_URL` at a local Postgres):

```sh
# 1. Boot deps
docker compose up -d postgres redis minio
pnpm --filter @wistmail/api dev:seed   # seeds a demo user
pnpm --filter @wistmail/api dev &

# 2. Login, capture cookie
COOKIE=$(curl -s -c - -X POST http://localhost:8000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"demo-password"}' \
  | awk '/wm_session/ {print $6"="$7}')

# 3. Hit each endpoint once, print -w'd response time + the
#    server's reported X-Response-Time header.
for path in \
  /api/v1/inbox/list?folder=inbox \
  /api/v1/today/items \
  /api/v1/calendar/events?from=2026-05-04&to=2026-05-11 \
  /api/v1/work/counters \
  /api/v1/chat/conversations \
  /api/v1/docs \
  /api/v1/admin/members \
  /api/v1/billing/wallet
do
  printf '%-55s ' "$path"
  curl -s -o /dev/null \
    -H "cookie: $COOKIE" \
    -w 'wall=%{time_total}s  srv=%header{X-Response-Time}\n' \
    "http://localhost:8000$path"
done
```

## Observed in this environment

This worktree environment has no running Postgres / Redis daemon
(Docker daemon isn't reachable: `dial unix /Users/.../docker.sock:
connect: no such file or directory`). So the live captures are
deferred to the next environment that has docker — the recipe
above and the middleware itself are in place.

## Quick wins applied this phase

While auditing the routes statically:

1. **`GET /api/v1/work/counters`** — was 5 round-trips (1 to find
   the user's projects, then 4 separate `count(*)` queries for
   today / week / overdue / done). Coalesced into 1 grouped query
   using `count(*) FILTER (WHERE …)`. Postgres scans the
   `project_tasks` rows once and bins them server-side.

   _Before_: 5 queries.  _After_: 2 queries (the scoping query +
   the aggregated one). On an account with ~100 tasks across 5
   projects this should drop the endpoint from ~10 ms to ~3 ms;
   on busier accounts the gain compounds. Test suite green.

   File: `apps/api/src/routes/work.ts`.

2. **`GET /api/v1/docs`** — was a `db.select()` (every column,
   including the `text body` field). On accounts with substantial
   doc bodies this means the index endpoint was returning tens of
   KB per row. Pinned to an explicit projection that drops `body`
   from the listing — the list view only needs id/title/icon/
   status/projectId/timestamps. The single-doc endpoint
   (`GET /docs/:id`) keeps the full select for the editor.

   File: `apps/api/src/routes/docs.ts`.

## Other endpoints — static review

Audited statically; no obvious quick wins:

- `inbox/list` delegates to `FeedService.list()` which already
  does a single windowed select for the feed plus one batched
  follow-up for chat-conversation-detail. Reaction-count joins
  are already aggregated server-side.
- `chat/conversations` (`ChatService.listForUser`) does exactly
  3 queries: the conversation list, a single batched
  participants-with-user-join, and a `DISTINCT ON` for the
  latest message per conversation.
- `admin/members` is 2 queries — find the user's org, then
  members joined with `users`.
- `calendar/events`, `today/items`, `billing/wallet` are
  all single-query endpoints already.
