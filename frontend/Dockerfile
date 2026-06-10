FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules node_modules/
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next .next/
COPY --from=builder /app/public public/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/i18n i18n/
COPY --from=builder /app/messages messages/
COPY --from=builder /app/middleware.ts ./

EXPOSE 3000

USER nextjs

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000',r=>process.exit(r.statusCode!==200?1:0)).on('error',()=>process.exit(1))"

CMD ["npm", "run", "start"]
