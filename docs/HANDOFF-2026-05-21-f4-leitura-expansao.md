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

Metodologia cumprida até o plano. Execução:

- Schema, migration `f4l_l1a_dados` e Ondas L1a 1-2 (preços e serviços)
  completas e commitadas (`6d64043`, `bc11d59`, `41e2ed5`): builders
  `fato-preco`/`fato-servico`, query layer, tools `preco_produto`,
  `preco_tabela`, `servico_buscar`, `servico_listar`, testes.
- **Ingestão completa** (`nexus_odoo_l1`): todos os 84 modelos sincronizados
  do Odoo de produção; `raw_sped_documento_item` 213.099 linhas, contagens dos
  modelos novos batem com o Odoo (servico 336, tabela_preco 15, regra 11864,
  apuracao 8, carta_correcao 12).
- **Todos os 14 fatos construídos** (`f4l-build-fatos.ts`): inclui
  `fato_preco` 11864, `fato_servico` 336, `fato_nota_fiscal` 46987.
- **Commit `09ca327`:** fix de bug real achado na verificação —
  `rebuildFatoNotaFiscal` estourava o timeout de 5s da transação (P2028) com a
  base real; timeout estendido para 180s.
- **Roles MCP provisionados** em `nexus_odoo_l1` (`provision-mcp.sql`);
  `nexus_mcp`/`nexus_mcp_bi` com SELECT nos `fato_*` (cobre os novos).
- **Container MCP de pé** na 3100, lendo de `nexus_odoo_l1`.
- **Smoke test verde** (`f4l-smoke.ts`): as 4 tools novas retornam dado real.

## Próximo passo exato

1. **Onda 3 — DF-e de entrada:** `fato_nota_fiscal` já tem `entradaSaida`;
   criar `queries/dfe-entrada.ts` + tools `dfe_entrada_periodo` e
   `dfe_entrada_por_fornecedor` (domínio `fiscal`, filtram `entradaSaida='0'`).
2. **Onda 4 — apuração e carta de correção.** ATENÇÃO: o `provision-mcp.sql`
   REVOGA `raw_*` dos roles do MCP — tools NÃO podem ler `raw` direto. Apuração
   e carta de correção precisam de fato (`fato_apuracao`, `fato_carta_correcao`)
   ou a query roda sob outro role. Revisar o plano L1 §4.2/4.4 nesse ponto.
3. **Onda 5 — cross-cutting:** `bi-schema-reference.ts` (tabelas novas no
   Caminho 3c), regenerar `mcp-catalog-snapshot.json`, documentação do MCP.
4. **L1b** (referência) e **expandir o catálogo** para mais modelos do censo.
5. **L2:** harness de 1000+ leituras reais conferidas contra o Odoo.
6. **L3 — agente Nex:** semear `LlmCredential` (OpenAI, `.env.local`) e
   `LlmConfig` ativa com o modelo **`gpt-5.4-nano`** (instrução do usuário:
   todas as requisições usam esse modelo); harness de 1000+ perguntas reais
   variadas; conferir cada resposta contra consulta independente; relatório
   geral, meta 97%+.

## Notas

- `npx tsc` acusa erros em `.next/types/validator.ts` (páginas
  `servidor-mcp`/`plugar-mcps`): artefatos `.next` obsoletos da outra branch.
  Não é regressão; `rm -rf .next` limpa.
- F4 Onda 2 escrita (PR #10) segue bloqueada: base de teste
  `grupojht.teste.tauga.online` com erro Postgres de schema. Credenciais em
  `.env.local` (`ODOO_WRITE_*`).
- Protocolo multi-agente: `docs/agents/active/claude-f4-leitura-expansao.md`.
