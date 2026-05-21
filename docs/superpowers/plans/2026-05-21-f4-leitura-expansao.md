# PLANO — F4 Expansão da base de leitura (L1)

> Versão **v3** (2026-05-21) — versão para execução. Sobre a SPEC v3
> (`docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`).
> Investigação de schema: `fields_get` read-only de produção, registrada nas
> decisões abaixo.

## Histórico de revisão

- **v1 → v2 (Review #1):** (1) ordem de tarefas não garantia raw→migration→
  fato→query→tool; reordenado por dependência explícita. (2) A carga de
  ingestão era pré-requisito do smoke test mas vinha solta; agora é a Onda I,
  com a verificação de resumabilidade como primeira tarefa. (3) Faltava tarefa
  de investigar se `fato_nota_fiscal` já cobre documentos de entrada; incluída
  (T3.1). (4) GRANT espalhado; consolidado por onda.
- **v2 → v3 (Review #2, adversarial):** (1) `fato_preco` ainda assumia grão por
  produto; a investigação de `fields_get` mostrou que regras se aplicam a
  produto, família OU participante e usam `operacao` (valor/margem/markup/
  desconto/fixo/fórmula) — grão fixado: uma linha por regra, dimensão
  polimórfica. (2) DF-e de entrada: `fields_get` resolveu a decisão da spec
  2.1 — `sped.documento` tem `entrada_saida`; DF-e de entrada sai dele, sem
  ingestão nova. `sped.consulta.dfe` fica fora. (3) Cada modelo Prisma novo
  precisa de `Json` tipado e índice em `odooId`; padronizado conforme os 79
  atuais. (4) TDD: toda tarefa com código testável escreve o teste antes.

## Decisões travadas pela investigação de schema

- **DF-e de entrada → `sped.documento` já sincronizado.** `sped.documento` tem
  `entrada_saida` (0/1), `modelo` (55 NF-e, 57 CT-e, etc.), `participante_*`
  (razão social, CNPJ), `vr_operacao`, `data_entrada_saida`. Documentos de
  entrada de fornecedor são `entrada_saida = 0`. **Não** sincronizar
  `sped.consulta.dfe`/`.item` (são o cursor de distribuição SEFAZ, não o
  documento de negócio). A Onda 3 reusa `sped.documento`.
- **`fato_preco` grão = uma linha por `sped.tabela.preco.regra`.** Campos-chave:
  `tabela_id`, `produto_id` | `familia_id` | `participante_id` (dimensão),
  `operacao_produto` (valor/margem/desconto/markup/fixo/formula),
  `preco_base_produto`, `vr_fixo_produto`/`vr_regra_produto`/`al_regra_produto`,
  `data_inicial`/`data_final`, `quantidade_minima`.
- **`sped.servico`:** simples — `codigo`, `codigo_formatado`, `descricao`,
  `codigo_tributacao`. Fato trivial.
- **`sped.apuracao` (8 reg, 173 campos) e `sped.carta.correcao` (12 reg):**
  volume baixo, tool lê `raw` JSONB direto, sem fato.

---

## Onda L1a — domínios operacionais

### Onda 1 — Preços

- **T1.1** Adicionar `RawSpedTabelaPreco` e `RawSpedTabelaPrecoRegra` ao
  `prisma/schema.prisma` (formato dos `Raw*` atuais: `odooId Int @unique`,
  `data Json`, timestamps de sync; `@@map("raw_sped_tabela_preco"`/`_regra")`).
- **T1.2** Adicionar as duas entradas a `MODEL_CATALOG`
  (`src/worker/catalog/model-catalog.ts`), `mode: "incremental"`.
- **T1.3** Adicionar `FatoPreco` ao schema (`@@map("fato_preco")`): colunas
  `regraId`, `tabelaId`, `tabelaNome`, `dimensao` (`produto`|`familia`|
  `participante`|`geral`), `produtoId`, `produtoNome`, `familiaNome`,
  `participanteNome`, `operacao`, `precoBase`, `valor` (Decimal nullable),
  `aliquota` (Decimal nullable), `quantidadeMinima`, `dataInicial`,
  `dataFinal`. Índices em `produtoId` e `tabelaId`.
- **T1.4** Migration única da Onda 1 (`prisma migrate dev --name f4l_precos`).
- **T1.5** (TDD) Teste de `rebuildFatoPreco` com fixtures de `raw_*`.
- **T1.6** Builder `src/worker/fatos/fato-preco.ts` (`rebuildFatoPreco`):
  achata as regras, resolve nomes via `odoo-relational`. Registrar em
  `FATO_BUILDERS` (`registry.ts`), `cycle: "incremental"`.
- **T1.7** (TDD) Teste das query functions de preço.
- **T1.8** `src/lib/reports/queries/precos.ts`: `queryPrecoProduto(prisma,
  {produtoId|termo})` e `queryPrecoTabela(prisma, {tabelaId})`.
- **T1.9** (TDD) Testes das tools `preco_produto` e `preco_tabela`.
- **T1.10** Tool `mcp/tools/comercial/preco-produto.ts` (`preco_produto`,
  domínio `comercial`, `withFreshness(["fato_preco"])`).
- **T1.11** Tool `mcp/tools/comercial/preco-tabela.ts` (`preco_tabela`).
- **T1.12** Exportar as tools no `mcp/tools/comercial/index.ts` e registrar no
  agregador do servidor.

### Onda 2 — Serviços

- **T2.1** `RawSpedServico` no schema + `@@map("raw_sped_servico")`.
- **T2.2** Entrada em `MODEL_CATALOG`, `mode: "incremental"`.
- **T2.3** `FatoServico` no schema (`codigo`, `codigoFormatado`, `descricao`,
  `codigoTributacao`, `alInssRetido`). Índice em `codigo`.
- **T2.4** Migration da Onda 2 (`f4l_servicos`).
- **T2.5** (TDD) Teste de `rebuildFatoServico`.
- **T2.6** Builder `fato-servico.ts` + registro em `FATO_BUILDERS`.
- **T2.7** (TDD) Testes das query functions.
- **T2.8** `queries/servicos.ts`: `queryServicoBuscar`, `queryServicoListar`.
- **T2.9** (TDD) Testes das tools.
- **T2.10** Tools `mcp/tools/cadastros/servico-buscar.ts` e `servico-listar.ts`
  (domínio `cadastros`), exportadas no index do domínio.

### Onda 3 — DF-e de entrada (sobre `sped.documento` já sincronizado)

- **T3.1** Investigar `src/worker/fatos/fato-nota-fiscal.ts`: confirmar se já
  inclui documentos com `entrada_saida = 0` ou se filtra a saída. Registrar o
  achado no topo da Onda 3.
- **T3.2** Conforme T3.1: (a) se `fato_nota_fiscal` já tem entrada, adicionar
  coluna/uso de `entradaSaida` se faltar; (b) se só tem saída, estender o
  builder para incluir entrada. Migration só se mudar coluna.
- **T3.3** (TDD) Testes das query functions de DF-e de entrada.
- **T3.4** `queries/dfe-entrada.ts`: `queryDfeEntradaPeriodo`,
  `queryDfeEntradaPorFornecedor` (filtram `entrada_saida = 0`).
- **T3.5** (TDD) Testes das tools.
- **T3.6** Tools `mcp/tools/fiscal/dfe-entrada-periodo.ts` e
  `dfe-entrada-por-fornecedor.ts` (domínio `fiscal`).

### Onda 4 — Fiscal complementar (apuração, carta de correção)

- **T4.1** `RawSpedApuracao` e `RawSpedCartaCorrecao` no schema + `@@map`.
- **T4.2** Entradas em `MODEL_CATALOG`, `mode: "incremental"`.
- **T4.3** Migration da Onda 4 (`f4l_fiscal_complementar`).
- **T4.4** (TDD) Testes das query functions.
- **T4.5** `queries/apuracao.ts`: `queryApuracaoFiscalPeriodo` lê `raw_*` JSONB
  direto, expõe os `vr_*_a_recolher` por período/empresa/tipo.
- **T4.6** `queries/carta-correcao.ts`: `queryCartaCorrecao` lê `raw_*` direto.
- **T4.7** (TDD) Testes das tools.
- **T4.8** Tools `mcp/tools/fiscal/apuracao-fiscal-periodo.ts` e
  `carta-correcao.ts` (domínio `fiscal`).

### Onda 5 — Cross-cutting de L1a

- **T5.1** Acrescentar as tabelas `raw_*`/`fato_*` novas a
  `src/lib/agent/bi-schema-reference.ts` (Caminho 3c).
- **T5.2** Atualizar o script de provisionamento (`prisma/sql/provision-mcp.sql`
  e scripts de role) com `GRANT SELECT` das tabelas novas aos roles
  `nexus_mcp` e `nexus_mcp_bi`.
- **T5.3** Regenerar `src/lib/mcp-catalog-snapshot.json` via
  `npm run gen:mcp-catalog`.
- **T5.4** Verificar se tools de leitura aparecem em `mcp-capability-levels.ts`
  /`mcp-module-labels.ts`; se sim, atualizar; se não, registrar que não se
  aplica. (Se houver UI, passar por `ui-ux-pro-max`.)
- **T5.5** Acrescentar as tools novas à documentação do MCP em Integrações >
  Servidor MCP > Documentação, no padrão das tools atuais (`ui-ux-pro-max`).
- **T5.6** Verde de L1a: `tsc` (raiz + `mcp`), `eslint`, `jest`, `next build`,
  `docker compose build mcp`.

---

## Onda L1b — camada de referência

- **T6.1** Modelos Prisma `Raw*` para os modelos de referência da spec 2.2:
  `sped.ncm`, `sped.cfop`, `sped.cest`, `sped.cnae`, `sped.nbs`,
  `sped.natureza.operacao`, `sped.unidade`, `sped.condicao.pagamento`,
  `sped.municipio`, `sped.pais`, `sped.estado`, `sped.aliquota.*` (8),
  `sped.cst.*` (5), `sped.feriado`. Um modelo por tabela, formato padrão.
- **T6.2** Entradas em `MODEL_CATALOG`, `mode: "estatico"`.
- **T6.3** Migration da Onda L1b (`f4l_referencia`).
- **T6.4** GRANT das tabelas de referência aos roles `nexus_mcp`/`nexus_mcp_bi`
  e inclusão em `bi-schema-reference.ts`.
- **T6.5** (TDD) Teste da query genérica de referência.
- **T6.6** `queries/referencia.ts`: `queryReferenciaBuscar(prisma, {tabela,
  termo})` — busca por código ou descrição numa tabela de referência nomeada.
- **T6.7** (TDD) Teste da tool.
- **T6.8** Tool `mcp/tools/fiscal/referencia-buscar.ts` (`referencia_buscar`).
- **T6.9** Regenerar snapshot de catálogo; atualizar documentação do MCP.
- **T6.10** Verde de L1b (mesma bateria de T5.6).

---

## Onda I — Ingestão real

- **TI.1** Verificar no sync engine (`src/worker/sync/*`) se a sincronização de
  um modelo grande é resumível ou reinicia em caso de falha (pré-condição da
  spec 4.8). Registrar o achado.
- **TI.2** Subir o stack local: `docker compose up -d db redis`.
- **TI.3** Aplicar migrations (`prisma migrate deploy`) e reaplicar os scripts
  de GRANT (`npm run db:provision`).
- **TI.4** Rodar o worker (`npm run worker`) para um ciclo completo de sync;
  se a TI.1 indicar não-resumível, rodar por modelo, do menor para o maior.
- **TI.5** Disparar os builders de fato (snapshot + incremental).
- **TI.6** Verificação de contagem: para cada modelo, comparar `count(raw_*)`
  ao `search_count` do Odoo medido após o sync (critério de aceite 2 da spec).
  Script de verificação salvo em `scripts/`.
- **TI.7** Smoke test: cada tool nova responde com dado real do cache.

---

## Critérios de pronto da L1

Os 7 critérios de aceite da SPEC v3 seção 5. Em resumo: modelos e migrations
aplicados; sync sem falha e contagem conferida; fatos com teste verde; tools
visíveis por domínio e Caminho 3c enxergando as tabelas; toda a bateria de
verde (`tsc`/`eslint`/`jest`/`next build`/`docker compose build mcp`);
snapshot, documentação e GRANT atualizados; smoke test de cada tool.

## Ordem de execução

L1a Onda 1 → 2 → 3 → 4 → 5, depois L1b, depois Onda I. Dentro de cada onda, a
ordem das tarefas é a numérica (raw → migration → fato → query → tool →
registro). Commits atômicos por tarefa ou par de tarefas coeso.

## Downstream

Concluída e verificada a L1, seguem L2 (bateria de 1000+ leituras, spec
própria) e L3 (validação do agente Nex, spec própria, bloqueada pela ausência
da chave de LLM no ambiente).
