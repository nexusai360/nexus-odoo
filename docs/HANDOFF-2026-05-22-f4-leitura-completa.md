# HANDOFF — F4 Expansão da base de leitura (L1+L2 completas)

> Atualizado 2026-05-22. Branch: `feat/f4-leitura-expansao`. Substitui o
> `HANDOFF-2026-05-21-f4-leitura-expansao.md` (que descrevia o estado
> anterior à L1b/L1c/L2).

## Estado

A F4 base de leitura está **completa**:

- **84 → 114 modelos** no cache (114 = 84 originais + 3 L1c + 27 L1b).
- **41 → 47 tools** de leitura no MCP.
- **L1c** (resíduo operacional 4a): `fato_certificado` + `fiscal_certificados`, com `excludeFields` no sync (senha e .pfx do certificado **não** chegam ao cache, por decisão do usuário).
- **L1b** (camada de referência): `fato_referencia` unificado (22.288 entradas, 15 tabelas de lookup achatadas) + tool `referencia_buscar`. Plano-mãe estava furado; refeito após sondagem das 27 tabelas.
- **Onda I** (ingestão completa): 114 modelos sincronizados contra a produção.
- **L2** (bateria de validação): **56/56 conferências de tool ok contra o Odoo (100%)**. Relatório em `docs/superpowers/research/2026-05-22-l2-relatorio.md`.

Verde: `tsc` raiz+mcp, `eslint` (0 erros), `jest` 1566, `next build`, `docker compose build mcp`. 54 commits atômicos.

## Único item pendente — L3 (gate do usuário)

Re-rodar `scripts/f4l-l3-harness.ts` contra a OpenAI para medir a assertividade final do agente Nex após as correções A e B (tools de contagem + `totalAgregado`/CNPJ em notas por fornecedor). Estimativa em `docs/superpowers/research/2026-05-22-l3-caminho-100.md`: ~99%.

**Bloqueio:** custo de créditos da OpenAI. Disparar só com autorização explícita do usuário.

## Achados surfa­dos pela L2 (RADAR R8/R8-B)

A bateria L2 surfou 6 divergências de fidelidade do cache, **todas em modelos antigos da F2**, nenhuma tool da F4 afetada:

- `pedido.documento.historico.tempo`: não-sincronizável (modelo Odoo sem coluna `id`).
- `sped.produto.lote.serie`: sync erra após 3 tentativas (erro vazio — investigação dedicada).
- `estoque.saldo`, `finan.banco.extrato`, `finan.banco.saldo`, `finan.fluxo.caixa`: gap de backfill ~1% (modelos `incremental` sem reconcile).

Detalhes em `docs/RADAR.md` R8 e R8-B. Fora do escopo da F4.

## Ambiente

- Cache dev: `nexus_odoo_l1` (container `db`, porta 5436). 114 modelos sincronizados em 2026-05-22 ~16:00.
- MCP container: build verde após o último commit; rebuildar e subir se algo mudar.
- `.env.local` carrega via `set -a && . ./.env.local && set +a` (Prisma 7 não auto-carrega `.env.local`).

## Multi-agente

Há outras sessões ativas em `feat/f4-leitura-expansao` (ex.: `claude-agente-nex-*` mexendo em `src/components/agent/`). Esta sessão tocou só em `mcp/`, `src/worker/`, `src/lib/reports/`, `src/lib/agent/bi-schema-reference.ts`, `prisma/`, `scripts/` e `docs/`. Sem sobreposição. Commits seletivos, nunca `git add -A`.

## Artefatos da sessão

- Specs: `2026-05-22-f4-l1b-l1c-residuo-spec.md` (v3), `2026-05-22-f4-l1b-referencia-spec.md` (v3), `2026-05-22-f4-l2-bateria-leitura-spec.md` (v3).
- Planos: `2026-05-22-f4-l1c-residuo.md` (v2), `2026-05-22-f4-l1b-referencia.md`, `2026-05-22-f4-l2-bateria-leitura.md`.
- Relatório: `2026-05-22-l2-relatorio.md`.
- Scripts: `scripts/f4l-smoke-l1c.ts`, `scripts/f4l-smoke-l1b.ts`, `scripts/f4l-l2-harness.ts`.
