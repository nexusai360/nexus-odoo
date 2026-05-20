---
agent: claude-f4-onda2-mcp-escrita
started_at: 2026-05-20T11:30-03:00
branch: feat/f4-onda2-mcp-escrita (a ser criada)
target_phase: F4 onda 2 — Capacidade de escrita no Servidor MCP
status: in_progress
---

## Tópico

Implementação da F4 onda 2: capacidade de escrita no Servidor MCP cobrindo todos os módulos do Odoo Tauga, com gate por API Key com capabilities por módulo × ação, painel `Integrações → Servidor MCP` (renomeação), reorganização de menu (Plugar MCPs vai pro Agente Nex; API REST com tag "Em breve"), discovery de write paths, testes E2E contra `grupojht.teste.tauga.online`. Entrega em ondas: onda 0 (fundação) → ondas 1-7 (módulos).

Spec: `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md`

## Arquivos que provavelmente vou tocar

- `prisma/schema.prisma` (adição de `McpAccessKey`, `McpAuditLog`, `McpIdempotencyRecord`)
- `prisma/migrations/*` (nova migration)
- `src/mcp/**/*` (servidor MCP: middleware, dispatcher, tools de escrita)
- `src/worker/*` (sync direcionado pós-write)
- `src/lib/queue.ts` ou similar (fila bullmq para sync direcionado)
- `src/components/layout/sidebar.tsx` (reorganização: Plugar MCPs vai pro Nex)
- `src/components/integracoes/**/*` (renomeação MCP → Servidor MCP; APIs → API REST com tag "Em breve"; novo card)
- `src/components/agent/**/*` (novo submenu "Plugar MCPs")
- `src/app/(protected)/integracoes/**/*` (rotas)
- `src/app/(protected)/agent/**/*` (rotas)
- `src/app/api/mcp/**/*` (endpoint HTTP do servidor MCP)
- `discovery/**/*` (extensão Python para write paths)
- `CLAUDE.md` (revisão da decisão canônica #2 + reorganização do menu na §4)
- `STATUS.md` (atualização de fase atual)
- `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` (a spec deste trabalho)
- `docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md` (a criar)

## Arquivos compartilhados que VOU modificar

> Listados na seção "Arquivos com alta probabilidade de conflito" do `AGENTS.md`.

- `prisma/schema.prisma` — adição de 3 modelos
- `CLAUDE.md` — revisão da decisão canônica #2 + nota sobre menu reorganizado
- `src/components/layout/sidebar.tsx` — adição de "Plugar MCPs" no Agente Nex + ajustes em Integrações
- `src/components/integracoes/**/*` — refactor do card MCP → Servidor MCP; criação de telas internas
- `STATUS.md` — atualização de fase atual

Se outro agente declarar conflito nesses arquivos, COORDENAR.

## Áreas que NÃO vou tocar (live para outros agentes)

Conforme o usuário sinalizou trabalho paralelo em frontend:

- `src/components/agent/bubble/**` (Bubble do Nex)
- `src/components/agent/playground/**` (Playground)
- `src/components/agent/prompt/**` (UI de Prompt)
- `src/components/users/**` (menu de usuários)
- `src/components/profile/**` (perfil)

Se eu precisar tocar alguma dessas áreas para a reorganização do menu (Plugar MCPs vira submenu do Nex), **PARO e coordeno** antes de mexer no arquivo de outro agente.

## Decisões / contexto importante

- Base de teste: `grupojht.teste.tauga.online` (somente para validar writes; leitura continua em produção).
- Idempotency-Key obrigatória; `external_id` opcional sem upsert (409 se existe).
- 4 ações canônicas (create/update/delete/transition) + sensíveis específicas em fiscal/contábil/financeiro/estoque/vendas/compras/produção.
- Discovery por ondas, cobertura final = 100% dos módulos ativos no Odoo Tauga.

## Progresso

- ✅ Spec v1 escrita (rascunho inicial pós-brainstorm)
- ✅ Review crítica #1 — 41 achados materiais
- ✅ Spec v2 — aplica os 41 achados
- ✅ Review crítica #2 — 24 achados materiais
- ✅ Spec v3 — aplica os 24 achados (FINAL)
- 🔄 Plan v1 — em curso
- ⏳ Review crítica #1 do plan
- ⏳ Plan v2
- ⏳ Review crítica #2 do plan
- ⏳ Plan v3
- ⏳ Execução da Onda 0 (fundação MCP escrita)

## Bloqueios

- **PR1 (externo):** Tauga precisa criar usuário Odoo dedicado em `grupojht.teste.tauga.online` com permissões plenas. Sem isso, Onda 0 inicia em modo dry-run.
- **PR2 (externo):** SLA da base de teste confirmado pela Tauga.
- **PR3 (externo):** Confirmar `module = mcp_nexus` livre em `ir.model.data` no Odoo Tauga.
