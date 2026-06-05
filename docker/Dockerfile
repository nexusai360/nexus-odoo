FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps && npm cache clean --force

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV REDIS_URL="redis://dummy:6379"
ENV NEXTAUTH_SECRET="dummy_secret_for_build_only_at_least_32_chars_long"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
ENV ADMIN_EMAIL="dummy@dummy.com"
ENV ADMIN_PASSWORD="dummy_password_build_only"
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# postgresql-client: o entrypoint roda `npm run db:provision` (psql) para criar
# os roles de menor privilegio do MCP. openssl: exigido pelo Prisma.
RUN apk add --no-cache openssl postgresql-client
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
COPY --from=builder --chown=nextjs:nodejs /app/src/worker ./src/worker
# mcp/ e necessario para o worker: src/worker/sync/directed.ts importa
# mcp/lib/logger. Sem isso o worker falha no boot com MODULE_NOT_FOUND.
COPY --from=builder --chown=nextjs:nodejs /app/mcp ./mcp
COPY --from=builder --chown=nextjs:nodejs /app/src/lib ./src/lib
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next

USER nextjs
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
