---
agent: claude-agente-nex-consumo
started_at: 2026-05-22T12:50-03:00
branch: feat/f4-leitura-expansao
target_phase: F5 (refino da tela de consumo do Agente Nex)
status: in_progress
---

## Tópico
Clonar o front-end da tela de consumo do Agente Nex do projeto irmao
`nexus-insights` para `/agente/consumo`, reconciliando com o back-end V2 ja
existente aqui (que tem correcoes que o insights nao tem).

## Arquivos que provavelmente vou tocar
- src/components/agent/consumo/*.tsx (todos os 7 componentes existentes)
- src/app/(protected)/agente/consumo/page.tsx
- src/components/charts/ (adicao de charts interativos vindos do insights)
- src/components/reports/period-pills.tsx (novo, vindo do insights)
- src/components/dashboard/period-navigator.tsx (novo, vindo do insights)
- src/lib/datetime-core.ts (novo, se necessario)
- src/components/ui/sheet.tsx (se ainda nao existir)
- src/lib/agent/llm/usage-stats.ts (comparacao de back-end; manter correcoes)
- src/lib/actions/llm-usage.ts (idem)

## Arquivos compartilhados que VOU modificar
> Nenhum da lista de alta-probabilidade de conflito do AGENTS.md alem de
> STATUS.md e docs/agents/HISTORY.md (append-only). `src/components/agent/`
> esta na lista, mas o subdiretorio /consumo nao e tocado pelo agente
> claude-f4-leitura-expansao (que mexe em mcp/, src/worker/, src/lib/reports/,
> prisma/). Sem sobreposicao prevista.

## Decisoes / contexto importante
- Trabalho em paralelo com claude-f4-leitura-expansao (mesma branch). Working
  tree dele esta sujo (mcp/tools/*, src/lib/reports/queries/*). NAO commitar
  esses arquivos — commit seletivo apenas dos arquivos desta feature.
- Back-end V2 do odoo (UsageSummaryV2, costKnown, conversations vs iterations,
  requestKind, rateStale) e superior ao do insights e deve ser preservado.
  Clonar apenas a camada de front-end / visual.

## Bloqueios
- (vazio)
