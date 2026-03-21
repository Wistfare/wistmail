# WistMail — Project Conventions

## Architecture
- **Monorepo** managed by Turborepo + pnpm workspaces
- **Go** for mail engine (`packages/mail-engine`) — SMTP, IMAP, DKIM, SPF, DMARC
- **TypeScript/Node.js** for API gateway (`apps/api`), web client (`apps/web`), admin (`apps/admin`)
- **PostgreSQL** for data, **Redis** for queues/cache, **MinIO** for attachments, **MeiliSearch** for search

## Code Style
- TypeScript: strict mode, no `any`, prefer `const`, use Zod for validation
- Go: standard `gofmt`, error wrapping with `fmt.Errorf("context: %w", err)`
- Commits: conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`)
- No semicolons in TS, single quotes, trailing commas

## Package Naming
- npm: `@wistmail/<package>` (e.g., `@wistmail/db`, `@wistmail/shared`)
- Go: `github.com/Wistfare/wistmail/packages/mail-engine`

## Testing
- Every feature must have unit tests
- Node.js: Vitest
- Go: standard `testing` package
- E2E: Playwright
- Run tests before committing

## File Organization
- Collocate tests next to source: `foo.ts` → `foo.test.ts`, `foo.go` → `foo_test.go`
- Use barrel exports (`index.ts`) for packages
- Keep functions small and focused
