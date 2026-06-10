FROM oven/bun:1 AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 bun && \
    adduser --system --uid 1001 bun

COPY package.json ./
RUN bun install --production --frozen-lockfile 2>/dev/null || bun install --production

COPY src/ src/

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

EXPOSE 4000

USER bun

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "src/index.ts"]