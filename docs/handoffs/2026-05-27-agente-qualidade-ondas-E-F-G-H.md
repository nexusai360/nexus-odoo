# Handoff — Agente Nex Qualidade: Ondas E + F + G + H

**Data:** 2026-05-27
**Agente:** `claude-agente-nex-qualidade`
**Branch:** `feat/agente-nex-inteligencia`
**Commits da sessão:** `495dced` → `ba551fb` (8 commits)

## Onde paramos

Bateria R14 = 74% CORRETO / 0% ERRADO (mini). Auditoria das 51 falhas (com tool calls reais visíveis pós fix do painel `495dced`) revelou 5 blocos de causa raiz. Implementadas 7 ondas (F1+F2+F3+F4+F5+G+H) atacando os blocos. **Bateria R15 NÃO disparada** — aguarda comando do user.

## Ondas implementadas

| Onda | Item | Commit |
|---|---|---|
| Fix painel | `getEvaluationDetail` agrega toolCalls de TODAS as messages do turno (era só a final, sem tools) | `495dced` |
| E | `registrar_lacuna` intercepta lacunas evitáveis (14 padrões redirect) + `_DESTAQUE` no sanitizer | `fffe316` |
| F1 | Sanitizer aceita `linhas\|titulos\|serie\|contas\|top` (não só `linhas`) | `7f11400` |
| F2 | `registrar_lacuna` retorna `respostaSugerida` + `sugestoesRelacionadas` (9 padrões reais + fallback) | `7f11400` |
| G | Prompt proíbe "registrei pra próxima etapa", obriga usar resposta humana + chips da tool | `7f11400` |
| F4 | Fuzzy estoque: termo só dígitos sem match exato retorna vazio (não cai mais em fuzzy errado no nome) | `feddb7a` |
| F5 | `contabil_plano_de_contas` busca tokenizada AND (acha "OUTROS IMPOSTOS A RECOLHER" com termo "impostos a recolher") | `feddb7a` |
| H | Prompt enxugado (3 exemplos redundantes + bloco "em implantação" removidos) | `feddb7a` |
| F3 | Tool nova `fiscal_faturamento_por_marca` (JOIN nfi ↔ produto) + `registrar_lacuna` deixa de interceptar "marca" | `ba551fb` |

## Próximos passos (na ordem) — quando o user mandar

1. **Rebuild MCP container** (REGRA DE RAIZ — commit `ba551fb` tem tool nova, sem rebuild ela não carrega):
   ```bash
   cd "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo"
   docker compose up -d --build mcp
   ```

2. **Smoke test** (1 pergunta de cada onda nova) — disparar manualmente via UI ou API:
   - "Faturamento por marca esse mês" → deve usar `fiscal_faturamento_por_marca`
   - "Conta de impostos a recolher" → F5 deve achar
   - "Fornecedor que mais devemos" → F2 redirect → `financeiro_contas_a_pagar`
   - "Total a receber" → F1 _DESTAQUE deve trazer `totalAReceber` no topo

3. **(Opcional) Add `totalAtrasado` em `comercial_pedidos_atrasados`** — audit R12 mostrou "veio truncada". 15 min.

4. **(Opcional) Tool nova `comercial_pedidos_listar_top_valor`** — resolve "pedido com maior valor em aberto". 30 min.

5. **Bateria R15** (100q, mini):
   ```bash
   cd "/Users/joaovitorzanini/.config/superpowers/worktrees/api-mcp-odoo/agente-qualidade"
   set -a && source .env.local && set +a
   nohup npx tsx scripts/quality-audit/03-run-test-questions.ts --limit 100 --concurrency 5 > /tmp/r15-battery.log 2>&1 &
   ```

6. **Avaliação + relatório R15** — usar auto-classifier (`/tmp/r14-eval.ts` é o template) ou avaliar manualmente os 100 turnos via dump.

## Estado do ambiente

- **tsc verde** em Next + MCP
- **Dev server** porta 3000 ativo (worktree branch)
- **MCP container** ainda no commit anterior (`feddb7a`) — **PRECISA REBUILD pra F3**
- **Modelo ativo:** `gpt-5.4-mini` em `llm_configs`
- **Worktree isolado:** `~/.config/superpowers/worktrees/api-mcp-odoo/agente-qualidade`

## Outros agentes ativos

Nenhum no `docs/agents/active/` (consumo-polish e bubble-storytelling fecharam suas sessões no merge da PR #12).

## Métricas históricas

| Rodada | Modelo | CORRETO | PARCIAL | ERRADO | FORA |
|---|---|---|---|---|---|
| R4 baseline | nano | 73.8% | 17.9% | 4.5% | 3.8% |
| R12 mini | mini | 75% | 17% | 0% | 8% |
| R13 mini | mini | 74% | 17% | 0% | 9% |
| R14 mini | mini | 74% | 16% | 0% | 10% |
| **R15 mini (esperado)** | **mini** | **~85%** | — | **0%** | — |

Meta declarada pelo user: **95% CORRETO**. Onda E+F+G+H ataca 27+8+3=~38 das 51 falhas. Se efetividade for 80%, salto pra ~89%. Resto fica pra Ondas I/J (tools especializadas + bateria 300q determinística).

## Arquivos críticos tocados

- `src/lib/agent/quality/queries.ts` (fix painel — agrega toolCalls)
- `src/lib/agent/quality/sanitize-tool-result.ts` (F1 — array names + _DESTAQUE)
- `scripts/quality-audit/dump-pending.ts` (fix mesmo do painel)
- `mcp/tools/caminho3/registrar-lacuna.ts` (E+F2 — redirect + resposta humana)
- `src/lib/agent/prompt/identity-base.ts` (G+H — humanização + corte)
- `src/lib/reports/queries/_search-helpers.ts` (F4 — fuzzy calibrado)
- `src/lib/reports/queries/contabil.ts` (F5 — tokenização AND)
- `mcp/tools/fiscal/faturamento-por-marca.ts` (F3 — tool nova)
- `mcp/tools/fiscal/index.ts` (F3 — registro)
