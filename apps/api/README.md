# @wistmail/api

Hono-based HTTP + WebSocket API for Wistfare Mail.

## Dev setup

```bash
pnpm install
pnpm dev   # http://localhost:3001 + ws://localhost:3001/api/v1/stream
```

Requires `DATABASE_URL` (Postgres) and `REDIS_URL` in `.env`.

## Firebase Cloud Messaging

The backend sends push notifications on new email / new chat message using
the Firebase Admin SDK. Credentials are resolved in this order:

| Priority | Env var                         | Use                                             |
| -------- | ------------------------------- | ----------------------------------------------- |
| 1        | `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON **contents** as the value. For CI/prod secrets. |
| 2        | `GOOGLE_APPLICATION_CREDENTIALS`| **Path** to a JSON file. For local dev + Docker bind-mounts. |
| 3        | (none)                          | Falls back to Application Default Credentials (gcloud / workload identity). |

If none resolve, push becomes a silent no-op — the rest of the app works
unchanged.

### Local dev

The service account JSON lives at `.secrets/firebase-service-account.json`
(gitignored). `.env` already points `GOOGLE_APPLICATION_CREDENTIALS` at it:

```env
GOOGLE_APPLICATION_CREDENTIALS=./.secrets/firebase-service-account.json
FIREBASE_PROJECT_ID=wistfare-1756656058858
```

**Never commit the JSON.** The `.gitignore` blocks `.secrets/` and any file
matching `*firebase-adminsdk*.json` or `*service-account*.json` as belt-and-
suspenders.

### GitHub Actions / production

Store the JSON contents as a GitHub repo secret named
`FIREBASE_SERVICE_ACCOUNT_JSON`. Inject it into jobs that need to send
pushes:

```yaml
- name: Deploy api
  env:
    FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
    FIREBASE_PROJECT_ID: wistfare-1756656058858
  run: ...
```

For PR test runs, **don't** inject the secret — tests no-op gracefully
without credentials. Only deploy / integration jobs that actually exercise
FCM need it.

### Docker

Two options:

**Bind-mount the file** (recommended if the key lives on the host):

```yaml
services:
  api:
    volumes:
      - ./apps/api/.secrets:/app/.secrets:ro
    environment:
      GOOGLE_APPLICATION_CREDENTIALS: /app/.secrets/firebase-service-account.json
      FIREBASE_PROJECT_ID: wistfare-1756656058858
```

**Inline via env** (if the JSON is managed by your orchestrator's secret
manager — Docker Swarm secrets, K8s secrets, etc.):

```yaml
services:
  api:
    environment:
      FIREBASE_SERVICE_ACCOUNT_JSON: ${FIREBASE_SERVICE_ACCOUNT_JSON}
      FIREBASE_PROJECT_ID: wistfare-1756656058858
```

### Rotating the key

Firebase Console → Project Settings → Service accounts → delete the old key,
generate a new one, drop the replacement at
`.secrets/firebase-service-account.json` (for local) and update the
`FIREBASE_SERVICE_ACCOUNT_JSON` GitHub secret (for deploys). No code change
required.
