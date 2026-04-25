# Multi-stage build for the AI worker. Mirrors apps/api/Dockerfile so
# the deploy pipeline treats them the same way.

FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/ai-worker/package.json ./apps/ai-worker/
COPY packages/ai/package.json ./packages/ai/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile --filter @wistmail/ai-worker...

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
WORKDIR /repo
COPY --from=deps /repo /repo
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/ai ./packages/ai
COPY apps/ai-worker ./apps/ai-worker
RUN pnpm --filter @wistmail/shared build && pnpm --filter @wistmail/db build && pnpm --filter @wistmail/ai build && pnpm --filter @wistmail/ai-worker build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/ai-worker
CMD ["node", "dist/index.js"]
