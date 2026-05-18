# mcp/Dockerfile
# Container do servidor MCP semântico — Node puro + tsx (4f-5).
#
# Não usa o Dockerfile raiz (Next.js): o MCP é Node puro, sem build Next.
# NÃO faz `tsc --emit` — o runtime usa tsx que lê mcp/tsconfig.json diretamente
# para resolver aliases @/ em paths. A verificação de tipo é feita no estágio builder
# via `npx tsc -p mcp/tsconfig.json` (noEmit — critério N1/C5).
#
# Estrutura copiada:
#   mcp/        → código do servidor MCP
#   src/        → código compartilhado (lib/, generated/prisma) — aliases @/
#   prisma/     → schema Prisma e migrations
#   package.json + package-lock.json → dependências

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# ── Estágio builder: verificação de tipos (critério N1) ──────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules

# Copiar apenas o necessário para gerar o Prisma client e verificar tipos
COPY prisma/ ./prisma/
COPY src/ ./src/
COPY mcp/ ./mcp/

# Gerar Prisma client (necessário para os tipos em src/generated/prisma)
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Verificação de tipo do MCP — tsconfig autônomo (N1):
#   • Não recompila src/**/*.tsx (sem jsx no mcp/tsconfig.json)
#   • Resolve @/* via baseUrl+paths sem incluir src/ como raiz de compilação
RUN npx tsc -p mcp/tsconfig.json --noEmit

# ── Estágio runner: imagem mínima de produção ────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV MCP_PORT=3100

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mcpuser

# Copiar artefatos do builder
COPY --from=builder --chown=mcpuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=mcpuser:nodejs /app/prisma ./prisma
COPY --from=builder --chown=mcpuser:nodejs /app/src ./src
COPY --from=builder --chown=mcpuser:nodejs /app/mcp ./mcp
COPY --from=builder --chown=mcpuser:nodejs /app/package.json ./package.json

USER mcpuser
EXPOSE 3100

# tsx resolve @/* via mcp/tsconfig.json (baseUrl+paths) em runtime
CMD ["npx", "tsx", "mcp/index.ts"]
