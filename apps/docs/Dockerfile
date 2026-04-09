# ── Dependencies ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/docs/package.json ./apps/docs/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/dns-manager/package.json ./packages/dns-manager/
COPY packages/sdk/package.json ./packages/sdk/

RUN pnpm install --frozen-lockfile

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build

COPY . .
RUN pnpm turbo build --filter=@wistmail/docs

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/apps/docs/.next/standalone ./
COPY --from=build /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=build /app/apps/docs/public ./apps/docs/public

EXPOSE 3002
ENV HOSTNAME=0.0.0.0
ENV PORT=3002

CMD ["node", "apps/docs/server.js"]
