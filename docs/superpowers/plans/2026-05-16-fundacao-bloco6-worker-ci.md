# Bloco 6 — Worker + CI

**Data:** 2026-05-16 · **Branch:** `feat/fundacao`
**Meta:** Scaffold do worker BullMQ (container `worker`) e pipeline CI no GitHub Actions. Fecha a Fase 1.

## Escopo (calibrado — fase enxuta, execução inline)

O Bloco 6 entrega **estrutura**, não lógica de negócio. A sincronização JSON-RPC
do Odoo é a Fase 2 — aqui só o esqueleto que comprova que o container `worker`
sobe e a fila existe, e o pipeline que valida cada PR.

## Base factual verificada

- `docker-compose.yml`: serviço `worker` já existe — `command: ["npx","tsx","/app/src/worker/index.ts"]`, mesma imagem `nexus-odoo:local`.
- `docker/Dockerfile`: já copia `/app/src/worker` para o runner (linha 42). **`src/worker/` precisa existir** senão o `docker build` falha — T1 resolve isso.
- `docker/entrypoint.sh`: detecta modo worker (args com `worker`/`tsx`) e pula migrations/seed. Não precisa de Dockerfile separado para o worker — a imagem é multi-modo.
- `package.json`: `bullmq ^5.73.0` e `ioredis ^5.10.1` em `dependencies`; `tsx` em `devDependencies`; script `worker` = `tsx src/worker/index.ts`.
- `src/lib/redis.ts`: singleton com `lazyConnect` (corrigido na auditoria do Bloco 2).
- `src/generated/` é gitignored → CI precisa rodar `prisma generate` antes de typecheck/build.
- Dockerfile/entrypoint usam `npm install --legacy-peer-deps` → CI idem.

## Tarefas

### T1 — `src/worker/index.ts` — scaffold do worker BullMQ
Criar o diretório `src/worker/` e o arquivo `index.ts`. Conteúdo:
- Conexão IORedis dedicada (`maxRetriesPerRequest: null`, exigido pelo BullMQ).
- `Queue` nomeada `odoo-sync` exportada (a F2 enfileira jobs aqui).
- `Worker` na fila `odoo-sync` com processador placeholder que loga e retorna `{ ok: true }` — a lógica JSON-RPC do Odoo entra na F2.
- Listeners `ready`/`failed`/`error` com log.
- Log de inicialização.
**Verificação:** `npx tsc --noEmit` sem erro.

### T2 — `.github/workflows/ci.yml` — pipeline de validação
Criar workflow que dispara em `push` para `main` e em todo `pull_request`.
Job único `validate` (ubuntu-latest, Node 22):
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node 22, cache npm)
3. `npm ci --legacy-peer-deps`
4. `npx prisma generate` (client é gitignored)
5. `npm run lint`
6. `npm run typecheck`
7. `npm test`
8. `npm run build` — com env vars dummy (DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, ENCRYPTION_KEY), iguais às do Dockerfile builder.
**Verificação:** YAML sintaticamente válido; passos cobrem lint+types+test+build.

### T3 — Verificação
- `npx tsc --noEmit` zero erros (inclui o worker).
- `npx next build` limpo.
- Opcional (se Docker disponível): `npm run worker` conecta na fila.

## Review #1 — lacunas, ordem, premissas

- **Premissa P1:** `bullmq`/`ioredis` em `dependencies` — ✅ verificado no package.json.
- **Premissa P2:** o Dockerfile copia `src/worker` — criar `src/worker/index.ts` desbloqueia o `docker build` (hoje falharia no COPY de pasta inexistente). ✅
- **Premissa P3:** CI — `next build` não conecta no Redis durante o build porque `redis.ts` usa `lazyConnect` (corrigido na auditoria). Sem isso, o build no CI emitiria erros de conexão. ✅
- **Premissa P4:** `prisma generate` no CI — `src/generated/` é gitignored; sem o generate, `typecheck` quebra. Incluído como passo 4. ✅
- **Lacuna L1:** o worker abre uma conexão IORedis própria (BullMQ exige conexão sua, não compartilha o singleton de `redis.ts`). Isso é correto e intencional — BullMQ recomenda conexão dedicada. Registrado.
- **Lacuna L2 (aceita):** o CI não faz build+push da imagem Docker para `ghcr.io`. O CD (deploy) é etapa [11], humano-assistida — fora do escopo de F1. O CI de F1 é validação. Push de imagem entra quando o deploy for configurado.
- **Ordem:** T1 antes de T2 não é estrito (independentes), mas T1→T2→T3 é a sequência natural. ✅

## Review #2 — granularidade, integração, testabilidade

- **Granularidade:** 2 arquivos, 2 tasks. Cada uma é uma unidade. ✅
- **Integração:** T1 fecha a lacuna do Dockerfile (COPY `src/worker`) e do `docker-compose` (command aponta para `src/worker/index.ts`). T2 usa os scripts `lint`/`typecheck`/`test`/`build` que já existem no `package.json` — verificado. ✅
- **Testabilidade:** o worker não tem lógica de negócio para testar unitariamente (scaffold). Verificação = `tsc`. O CI yaml é validado pelo GitHub ao rodar o primeiro PR; localmente, conferir indentação/sintaxe. O processador placeholder do worker é trivial — sem teste, justificado.
- **Achado M1:** o `npm run lint` no CI pode falhar se houver warning tratado como erro. `eslint` puro (sem `--max-warnings 0`) não falha por warning. Aceitável. Se o lint local acusar algo, corrigir antes do commit.
- **Achado M2:** `npm test` no CI — os testes atuais (`temp-password.test.ts`) não precisam de banco/Redis. ✅ CI não precisa de serviços.
- **Critério de saída:** sem achado material em aberto. ✅
