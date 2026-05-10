# Web bundle audit — 2026-05-10

Phase J / Task 1. Snapshot of `apps/web` bundle sizes after `pnpm
--filter @wistmail/web build` (Next 16.2.1 + Turbopack), with the
optimizations applied this phase.

## How sizes were measured

Next 16's CLI build no longer prints the `First Load JS` column the
old webpack output did. The numbers below come from
`apps/web/.next/diagnostics/route-bundle-stats.json`, summed across
each route's `firstLoadChunkPaths`. Both the raw size (what the
diagnostics file reports as `firstLoadUncompressedJsBytes`) and a
gzipped size (what the user actually downloads when the CDN serves
`Content-Encoding: gzip`) are listed.

Quick recipe:

```js
node -e "
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const stats = JSON.parse(fs.readFileSync('apps/web/.next/diagnostics/route-bundle-stats.json', 'utf8'));
const sized = stats.map(r => ({
  route: r.route,
  raw: r.firstLoadUncompressedJsBytes,
  gz: r.firstLoadChunkPaths.reduce((s, p) =>
    s + zlib.gzipSync(fs.readFileSync('apps/web/' + p), { level: 9 }).length, 0),
})).sort((a,b) => b.gz - a.gz);
for (const r of sized.slice(0, 10))
  console.log((r.gz/1024).toFixed(1) + 'KB gz / ' + (r.raw/1024).toFixed(0) + 'KB raw  ' + r.route);
"
```

## Top 10 routes — before / after

| Route                                    | Before raw | Before gz | After raw  | After gz   |
| ---------------------------------------- | ---------: | --------: | ---------: | ---------: |
| `/inbox`                                 | 1271.9 KB  | 368.5 KB  | 1194.9 KB  | 348.1 KB   |
| `/work`                                  | 1154.9 KB  | 336.2 KB  | 1154.9 KB  | 336.1 KB   |
| `/work/projects/[id]`                    | 1153.3 KB  | 335.7 KB  | 1153.3 KB  | 335.7 KB   |
| `/docs/[id]`                             | 1150.8 KB  | 335.7 KB  | 1150.9 KB  | 335.7 KB   |
| `/settings/two-factor/setup-totp`        | 1148.1 KB  | 336.1 KB  | 1148.1 KB  | 336.1 KB   |
| `/docs`                                  | 1146.4 KB  | 334.2 KB  | 1146.4 KB  | 334.2 KB   |
| `/settings/domains`                      | 1145.5 KB  | —         | 1145.5 KB  | —          |
| `/admin/billing`                         | 1144.7 KB  | 333.6 KB  | 1144.7 KB  | 333.5 KB   |
| `/search`                                | 1144.3 KB  | 334.2 KB  | 1144.3 KB  | 334.1 KB   |
| `/admin/billing/payment`                 | 1143.1 KB  | 333.1 KB  | 1143.1 KB  | 333.0 KB   |

Bottom of the table (for context — these are below the 250 KB target
in the plan):

| Route             | After gz  |
| ----------------- | --------: |
| `/`               | 271.7 KB  |
| `/dev/components` | 167.2 KB  |
| `/mfa/setup`      | 165.0 KB  |
| `/_not-found`     | 143.0 KB  |

## What moved

### `/inbox` — `-77 KB raw` / `-20 KB gz`

The inbox page eagerly imported five heavyweight components — most
of them only mount after the user clicks something. Switched to
`next/dynamic` so they ship as on-demand chunks:

- `ThreadReader` (and transitively `EmailBody` → `isomorphic-dompurify`).
  The iframe email renderer never runs until a thread is selected.
  Loading skeleton is the existing `EmailReadingSkeleton`.
- `InlineComposer` — only mounts when the user clicks Reply / Reply
  All / Forward.
- `ChatThreadView` — only mounts when a chat row is selected.
- `ChatInfoPanel` — sibling of `ChatThreadView`. Existing
  `ChatInfoPanelSkeleton` is the loading fallback.

`ssr: false` on each because every one is a client component using
browser-only APIs (iframes for email, IntersectionObserver for chat
scroll, etc.) — keeping them out of SSR also speeds up the server
build.

The deeper-nested `EmailBody` is also wrapped in `next/dynamic`
inside `thread-reader.tsx` so when ThreadReader does mount, the
DOMPurify dep is split into yet another async chunk.

Files:
- `apps/web/src/app/(app)/inbox/page.tsx`
- `apps/web/src/components/email/thread-reader.tsx`

### `@wistmail/shared` — Web Crypto migration

Replaced the eager `import { randomBytes } from 'node:crypto'` at the
top of `packages/shared/src/utils.ts` with a Web-Crypto-based helper.
The lazy `await import('node:crypto')` paths in `computeHmac` /
`verifyWebhookSignature` are gone too, swapped for `globalThis.crypto.
subtle`.

Why: the `node:crypto` import lives at module scope on a barrel that
the web bundles via `transpilePackages: ['@wistmail/shared']`. Even
though no web route calls these functions, the bundler couldn't
tree-shake the dependency and Next was inlining the
`crypto-browserify` / `stream-browserify` / `buffer` shim chain into
the shared chunk.

In the current build the same shim chunk is still emitted by Next's
own runtime (the chunk is identifiable by paths like
`next/dist/compiled/crypto-browserify/`), so the user-visible First
Load size on every route hasn't moved by this change alone — but the
project no longer authors any user code that pulls these shims.
Filed as a Next-runtime issue rather than user-code, and worth
revisiting when Next ships the [edge-style minimal runtime] for App
Router routes.

Files:
- `packages/shared/src/utils.ts`

## Routes still over 250 KB gz

Every route except the four at the bottom of the table still ships
≥ 270 KB gz. The dominant cost is a single ~127 KB gz chunk
(`crypto-browserify` + `buffer` + `stream-browserify` + `vm-
browserify` + `events` + `util`) that turbopack emits as part of its
compatibility runtime, not as user code:

```text
node_modules/next/dist/compiled/buffer/
node_modules/next/dist/compiled/events/
node_modules/next/dist/compiled/util/
node_modules/next/dist/compiled/stream-browserify/
node_modules/next/dist/compiled/vm-browserify/
node_modules/next/dist/compiled/crypto-browserify/
```

Removing it would require either:

1. Upstream Next change (`turbopack.fallback` or a
   per-runtime opt-out) that drops these shims when no user code
   references them. Tracked by Next 16's milestone.
2. Switching off Turbopack for the production build (`next build
   --webpack`, if Next still supports it on this version) and
   verifying the webpack output also doesn't ship these.

Both are out of scope for this phase. The good news is that the
chunk hash is stable across all routes, so users only download it
once — every subsequent navigation is the per-route `30–40 KB gz`
delta on top.

## Observations / not done this round

- `qrcode.react` is route-isolated to the two TOTP-setup pages
  (`/settings/two-factor/setup-totp` and `/mfa/setup/totp`). Already
  optimal — Next's per-route splitting handles it.
- `lucide-react` is already on
  `experimental.optimizePackageImports`, so the icon barrel is
  tree-shaken to per-icon imports.
- `@tanstack/react-query` is in the shared base chunk, as expected.
  No splitting opportunity there.
- The work / chat / docs heavy routes don't ship anything route-local
  worth splitting — they're heavy because of the shared base.
