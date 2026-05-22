# HANDOFF — F4 Expansão da base de leitura (L1/L2/L3)

> Retomada de sessão. Branch: `feat/f4-leitura-expansao`. Atualizado 2026-05-22.
> Modo autônomo. **Ler este arquivo antes de seguir.**

## Resumo do estado

A branch `feat/f4-leitura-expansao` está **com tudo unificado**: a expansão de
leitura (L1) **mais** o merge da `feat/f4-onda2-mcp-escrita` (146 commits:
escrita no MCP, Plugar MCPs, Servidor MCP, documentação, integração do Agente
Nex com MCP externo). O catálogo do MCP tem **42 entradas** (41 tools de
leitura + 1 write tool). Verificação após o merge: `jest` 1546, `tsc`
raiz+mcp verdes.

A validação L3 do agente Nex atingiu **97,73%** de assertividade
(meta 97%). Relatório: `docs/superpowers/research/2026-05-22-l3-relatorio.md`.

## Ambiente local

- **Banco desta branch:** `nexus_odoo_l1` (container `db`, porta 5436). O
  `.env.local` aponta `DATABASE_URL`/`MCP_DATABASE_URL`/`MCP_BI_DATABASE_URL`
  para ele. 25 migrations aplicadas (main + f4-onda2 + L1).
- **Containers:** `db`, `redis`, `mcp` (3100). `docker-compose.override.yml`
  aponta o MCP para `nexus_odoo_l1` e seta `MCP_RATE_LIMIT=100000` (dev).
- **App:** `npm run dev` na porta 3000 (login `nexusai360@gmail.com`).
- **Cache populado:** ingestão completa dos 84 modelos do Odoo de produção;
  14 fatos construídos. Re-rodar: `tsx --env-file=.env.local scripts/f4l-ingest.ts`
  e depois `scripts/f4l-build-fatos.ts`.
- Credencial OpenAI cifrada + LlmConfig `gpt-5.4-nano` semeadas no banco
  (`scripts/f4l-seed-llm.ts`).

## ⚠️ Não disparar requisições à OpenAI

A pedido do usuário (custo de créditos): **não reexecutar `f4l-l3-harness.ts`
nem rodar o agente** sem autorização explícita. A bateria L3 já foi concluída.

## O que foi entregue (L1 + merge)

- Metodologia completa: censo, spec L1 v3, plano L1 v3 (2 reviews cada).
- **Ondas L1a 1-5:** raw + fatos + queries + tools de MCP para preços,
  serviços, DF-e de entrada por fornecedor, apuração fiscal e cartas de
  correção. `bi-schema-reference.ts` atualizado (Caminho 3c).
- Ingestão real do cache; fix do timeout do builder `fato_nota_fiscal`.
- Merge da `feat/f4-onda2-mcp-escrita` (Plugar MCPs, Servidor MCP, escrita).
- **L3:** harness de 1146 perguntas reais, 4 correções de tool aplicadas
  (preço sem `produtoId`, fornecedor com filtro, estoque com `termo`, nomes de
  tool saneados para a OpenAI), assertividade 63,4% → 86,2% → **97,73%**.

## O que falta

1. **Escrita na base de teste (F4 Onda 2): BLOQUEADA pela Tauga.** A base
   `grupojht.teste.tauga.online` recusa autenticação (`permissão negada para
   esquema public`). Texto técnico do pedido à Tauga já foi entregue ao
   usuário (corrigir privilégio do schema `public` + configurar `url_api` de
   teste nas `pedido.operacao`). Credenciais de teste em `.env.local`
   (`ODOO_WRITE_*`).
2. **L3 — 26 falhas residuais (2,27%)** para chegar a 100%: categoria `global`
   (5 casos — agente erra contagens-totais), `notas_entrada_fornecedor`
   (13 — nome de fornecedor ambíguo / filtro), e falhas esparsas de serviço.
   Próximo passo se quiser 100%: afinar essas tools/perguntas.
3. **L1b (camada de referência)** e **L2 (bateria de leitura)** do plano L1
   não foram executadas (decisão de priorizar L3).
4. PR: a branch não foi aberta como PR nem mergeada na `main` — decisão do
   usuário.

## Scripts (em `scripts/`)

`f4l-ingest.ts` (sync), `f4l-build-fatos.ts` (rebuild de fatos),
`f4l-seed-llm.ts` (credencial OpenAI), `f4l-l3-smoke.ts` (smoke do agente),
`f4l-l3-harness.ts` (bateria L3 — NÃO rodar sem autorização), `f4l-smoke.ts`.

## Artefatos

- Censo: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`
- Spec/plano L1: `docs/superpowers/specs|plans/2026-05-21-f4-leitura-expansao*`
- Relatório L3: `docs/superpowers/research/2026-05-22-l3-relatorio.md`
