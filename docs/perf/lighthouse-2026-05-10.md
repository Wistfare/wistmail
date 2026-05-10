# Lighthouse pass — 2026-05-10

Phase J / Task 5.

## Status

This worktree environment doesn't have a usable Chrome+lighthouse
install (no `lighthouse` on PATH; no Docker daemon to run a
chrome-headless image, see
`api-response-times-2026-05-10.md`). The recipe below is the
intended invocation for the next environment that has them.

## Recipe

```sh
# 1. Build + boot production bundle
pnpm --filter @wistmail/web build
pnpm --filter @wistmail/web start &  # listens on :3000

# 2. Install lighthouse if needed
pnpm dlx lighthouse@latest --version

# 3. Run for each target route
mkdir -p /tmp/lighthouse
for route in /inbox /calendar /work /admin; do
  slug=$(echo "$route" | tr '/' '_' | sed 's/^_//')
  pnpm dlx lighthouse@latest \
    "http://localhost:3000$route" \
    --output json --output-path "/tmp/lighthouse/$slug.json" \
    --only-categories=performance,accessibility \
    --chrome-flags='--headless=new --no-sandbox' \
    --quiet
done

# 4. Pull the headline scores out of each JSON
for f in /tmp/lighthouse/*.json; do
  node -e "
    const r = JSON.parse(require('fs').readFileSync('$f','utf8'));
    const perf = Math.round(r.categories.performance.score * 100);
    const a11y = Math.round(r.categories.accessibility.score * 100);
    const lcp = r.audits['largest-contentful-paint'].displayValue;
    const cls = r.audits['cumulative-layout-shift'].displayValue;
    const tti = r.audits['interactive']?.displayValue ?? '—';
    console.log('$f', { perf, a11y, lcp, cls, tti });
  "
done
```

Targets per the plan: **performance ≥ 80, accessibility ≥ 90**.

## Authenticated routes — note

`/inbox`, `/calendar`, `/work`, `/admin` all redirect unauthenticated
visitors to `/login`. Lighthouse'ing them as-is measures the login
page, which is misleading. To audit the real authenticated page:

1. Boot the API and seed a demo session
   (`pnpm --filter @wistmail/api dev:seed`).
2. Use Lighthouse's `--extra-headers` flag with the session cookie:

   ```sh
   COOKIE=$(curl -s -c - -X POST http://localhost:8000/api/v1/auth/login \
     -H 'content-type: application/json' \
     -d '{"email":"demo@example.com","password":"demo-password"}' \
     | awk '/wm_session/ {print $7}')

   pnpm dlx lighthouse@latest http://localhost:3000/inbox \
     --output json --output-path /tmp/lighthouse/inbox.json \
     --extra-headers="{\"cookie\":\"wm_session=$COOKIE\"}" \
     --only-categories=performance,accessibility \
     --chrome-flags='--headless=new --no-sandbox'
   ```

## Deferred — what to look for if scores miss target

If `performance < 80` on a route after the run, the most likely
culprits given the bundle audit (see `bundle-audit-2026-05-10.md`):

- **LCP** — every route ships ≥ 270 KB gz of JavaScript before
  the page becomes interactive. Look at the LCP element; if it's
  hidden behind a hydration boundary, consider rendering a static
  shell.
- **TTI / TBT** — driven by main-thread blocking from React
  hydration. If TBT > 600 ms, more `next/dynamic` boundaries
  inside the heavy routes (`/inbox`, `/work`) are the lever.
- **CLS** — most likely cause is the avatar `<Image>` boundary in
  the inbox feed if `width`/`height` props are missing on a row.

If `accessibility < 90` the most common offenders in this codebase
historically have been `aria-label` on icon-only buttons; check
whatever the audit flags first — the project already has lint
discipline around this.

## Deliverable

Recipe + interpretation guide. Re-run on the next environment
with Chrome available, paste scores into this file, and resolve
the largest opportunity if a target is missed.
