# Image audit — 2026-05-10

Phase J / Task 4.

## Scope

`apps/web/public/` and any image assets the web bundles via
`next/image`.

## Findings

`apps/web/public/` ships a single image asset:

```text
36 KB   apps/web/public/wistfare_mail_logo.png
```

That's well below the 200 KB threshold the plan calls out for
WebP / SVG conversion. No PNG / JPG over 200 KB exists in the
public directory.

The `apps/web/src/app/icon.png` and `apps/web/src/app/apple-icon.png`
are favicons (`route.tsx` emitted) and also small.

## Other image surfaces

Searched for images that the bundler might silently include:

| Path                                         | Size    | Verdict                  |
| -------------------------------------------- | ------: | ------------------------ |
| `apps/web/public/wistfare_mail_logo.png`     | 36 KB   | Below threshold          |
| `apps/web/src/app/icon.png`                  | <10 KB  | Below threshold          |
| `apps/web/src/app/apple-icon.png`            | <10 KB  | Below threshold          |
| `apps/mobile/web/icons/Icon-512.png`         | <30 KB  | Mobile/PWA only          |
| `apps/mobile/web/icons/Icon-maskable-512.png`| <30 KB  | Mobile/PWA only          |
| `apps/mobile/ios/Runner/Assets.xcassets/…`   | varies  | Native iOS bundle, n/a   |
| `apps/mobile/macos/Runner/Assets.xcassets/…` | varies  | Native macOS bundle, n/a |
| `apps/mobile/android/app/src/main/…`         | varies  | Native Android bundle    |

User avatars come from arbitrary remote sources (gravatar etc.),
served by `next/image` with `formats: ['image/avif', 'image/webp']`
already configured in `next.config.ts` — Next will negotiate
to the best format the requesting browser advertises.

## Recipe (for future use, not run this round)

When a public asset *does* land over 200 KB:

```sh
# Web-safe encoder; ships with macOS / `pnpm add -D sharp`
node -e "
  const sharp = require('sharp');
  sharp('apps/web/public/big.png')
    .webp({ quality: 80, effort: 6 })
    .toFile('apps/web/public/big.webp');
"

# Or a logo / icon: trace to SVG via potrace (pnpm add -D potrace)
node -e "
  const potrace = require('potrace');
  potrace.trace('apps/web/public/logo.png', (e, svg) =>
    require('fs').writeFileSync('apps/web/public/logo.svg', svg));
"
```

Then update `<Image src="/big.png">` references to `.webp` / `.svg`.

## Conclusion

No action required this phase. The project is already lean on
public images; the heaviest asset is a 36 KB logo and avatars are
served via `next/image` with AVIF/WebP negotiation enabled. If
fresh marketing assets land in `apps/web/public/`, run `du -sh
apps/web/public/*` as part of the bundle audit and convert
anything over 200 KB.
