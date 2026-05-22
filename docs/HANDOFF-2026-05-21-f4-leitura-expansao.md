# HANDOFF — F4 Expansão da base de leitura (L1/L2/L3)

> Retomada da fase. Branch: `feat/f4-leitura-expansao` (de `origin/main`).
> Modo autônomo. Atualizado em 2026-05-21.

## Contexto

O acesso ao Odoo passou a ser `joaozanini` (103 grupos, quase admin). Objetivo:
ampliar a base de **leitura** do MCP ao máximo do acesso e validar o agente
Nex com 1000+ requisições reais (meta 97%+ de acerto). Três sub-projetos:
**L1** (expansão), **L2** (bateria de leitura), **L3** (validação do agente).

## Artefatos

- Censo: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`
- Spec L1 v3: `docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`
- Plano L1 v3: `docs/superpowers/plans/2026-05-21-f4-leitura-expansao.md`

## Ambiente

- **Banco isolado desta branch:** `nexus_odoo_l1` (no container `db`, 5436). O
  `.env.local` aponta `DATABASE_URL`/`MCP_DATABASE_URL`/`MCP_BI_DATABASE_URL`
  para ele. Foi criado porque o `nexus_odoo` tinha migrations da branch de
  escrita que conflitavam. Migrations aplicadas (19 + `f4l_l1a_dados`).
- **Stack:** containers `db` (5436), `redis` (6380), `mcp` (3100) de pé.
- **Chave OpenAI** em `.env.local` (`OPENAI_API_KEY`). Falta semear a
  `LlmCredential` cifrada no banco (o agente lê de lá, não do env).

## Estado atual

Metodologia cumprida até o plano (censo, spec v1→v3, plano v1→v3, 2 reviews
cada). Execução em andamento:

- **Commit `6d64043`:** schema da Onda L1a (raw + fato).
- **Commit `bc11d59`:** migration `f4l_l1a_dados` aplicada em `nexus_odoo_l1`.
- **Commit `41e2ed5`:** Ondas L1a 1-2 (preços e serviços) completas — builders
  `fato-preco`/`fato-servico` (em `FATO_BUILDERS` e `FATO_FONTE`), query layer,
  tools `preco_produto`, `preco_tabela`, `servico_buscar`, `servico_listar`,
  testes de mapeamento. `tsc` raiz+mcp, `eslint`, `jest` verdes.
- **Ingestão:** snapshot concluído; ciclo incremental (carga fria, pull
  completo) rodando via `scripts/f4l-ingest.ts`.

## Próximo passo exato

1. **Após a ingestão:** rodar `tsx --env-file=.env.local scripts/f4l-build-fatos.ts`
   — a ingestão one-shot rodou com o registry anterior ao registro de
   `fato_preco`/`fato_servico`, então esses dois fatos precisam ser
   reconstruídos. Verificar contagem `raw_*` x `search_count` do Odoo.
2. Smoke test das 4 tools novas contra o cache populado.
3. **Ondas 3-5 do plano:** DF-e de entrada (sobre `fato_nota_fiscal`, que já
   tem coluna `entrada_saida`), apuração e carta de correção (tools que leem
   `raw` direto), e o cross-cutting (bi-schema-reference, GRANT, snapshot do
   catálogo, documentação do MCP). Depois L1b (referência).
4. **Expandir o catálogo** conforme o pedido do usuário ("79 é pouco"):
   revisar o escopo da spec para abranger mais modelos com dado do censo.
5. **L2:** harness de 1000+ leituras reais conferidas contra o Odoo.
6. **L3 — agente Nex:** semear `LlmCredential` (OpenAI) e `LlmConfig` ativa
   com o modelo **`gpt-5.4-nano`** (instrução do usuário: todas as requisições
   usam esse modelo); harness de 1000+ perguntas reais variadas; conferir cada
   resposta contra consulta independente; relatório geral, meta 97%+.

## Notas

- `npx tsc` acusa erros em `.next/types/validator.ts` (páginas
  `servidor-mcp`/`plugar-mcps`): artefatos `.next` obsoletos da outra branch.
  Não é regressão; `rm -rf .next` limpa.
- F4 Onda 2 escrita (PR #10) segue bloqueada: base de teste
  `grupojht.teste.tauga.online` com erro Postgres de schema. Credenciais em
  `.env.local` (`ODOO_WRITE_*`).
- Protocolo multi-agente: `docs/agents/active/claude-f4-leitura-expansao.md`.
