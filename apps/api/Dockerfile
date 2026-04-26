# ── Dependencies ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/docs/package.json ./apps/docs/
COPY apps/ai-worker/package.json ./apps/ai-worker/
COPY packages/ai/package.json ./packages/ai/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/dns-manager/package.json ./packages/dns-manager/
COPY packages/sdk/package.json ./packages/sdk/

RUN pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build

COPY . .
RUN pnpm turbo build --filter=@wistmail/api
# DO NOT run `drizzle-kit generate` here. When the snapshot for a
# committed migration is missing or out of date, drizzle-kit silently
# emits a NEW migration covering the diff (e.g. 0003_random_name.sql)
# that duplicates the committed one. The migrator then tries to apply
# both, the second fails with "already exists", and the bootstrap path
# in migrate-runner ends up marking unapplied migrations as applied.
# Migrations + snapshots must be generated locally with `pnpm --filter
# @wistmail/db generate` and committed together.

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
RUN npm install -g tsx

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/apps/api/package.json ./apps/api/
COPY --from=deps /app/packages/ai/package.json ./packages/ai/
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/packages/db/package.json ./packages/db/
COPY --from=deps /app/packages/dns-manager/package.json ./packages/dns-manager/

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/ai/src ./packages/ai/src
COPY --from=build /app/packages/shared/src ./packages/shared/src
COPY --from=build /app/packages/db/src ./packages/db/src
COPY --from=build /app/packages/db/drizzle.config.ts ./packages/db/
COPY --from=build /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=build /app/packages/dns-manager/src ./packages/dns-manager/src

# Copy workspace node_modules symlinks
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/ai/node_modules ./packages/ai/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/dns-manager/node_modules ./packages/dns-manager/node_modules

ENV NODE_ENV=production
EXPOSE 3001

WORKDIR /app/apps/api
CMD ["node", "--import", "tsx/esm", "dist/index.js"]
