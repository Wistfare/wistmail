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
RUN pnpm turbo build --filter=@wistmail/ai-worker

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
RUN npm install -g tsx

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /app/pnpm-workspace.yaml ./
COPY --from=deps /app/apps/ai-worker/package.json ./apps/ai-worker/
COPY --from=deps /app/packages/ai/package.json ./packages/ai/
COPY --from=deps /app/packages/shared/package.json ./packages/shared/
COPY --from=deps /app/packages/db/package.json ./packages/db/

COPY --from=build /app/apps/ai-worker/dist ./apps/ai-worker/dist
COPY --from=build /app/apps/ai-worker/src ./apps/ai-worker/src
COPY --from=build /app/packages/ai/dist ./packages/ai/dist
COPY --from=build /app/packages/ai/src ./packages/ai/src
COPY --from=build /app/packages/shared/src ./packages/shared/src
COPY --from=build /app/packages/db/src ./packages/db/src

# Copy workspace node_modules symlinks (pnpm uses these to resolve workspace:*)
COPY --from=deps /app/apps/ai-worker/node_modules ./apps/ai-worker/node_modules
COPY --from=deps /app/packages/ai/node_modules ./packages/ai/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

ENV NODE_ENV=production

WORKDIR /app/apps/ai-worker
CMD ["node", "--import", "tsx/esm", "dist/index.js"]
