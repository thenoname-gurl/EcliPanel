FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install

FROM oven/bun:1-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules node_modules/
COPY . .
RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next .next/
COPY --from=builder /app/public public/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/i18n i18n/
COPY --from=builder /app/messages messages/
COPY --from=builder /app/middleware.ts ./

EXPOSE 3000

CMD ["node_modules/.bin/next", "start"]
