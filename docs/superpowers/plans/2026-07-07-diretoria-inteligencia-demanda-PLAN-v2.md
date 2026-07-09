# PLAN v2 , Inteligência de Demanda, Faturamento de Venda Real, Estoque Disponível e Seriais

> Base: SPEC v3 + verificação #1 do plano (granularidade/ordem + integração técnica)
> já aplicada. Esta v2 passa AINDA por UMA verificação #2 (mais profunda, sobre esta
> v2) para virar a v3 de execução. TDD onde há lógica; E2E contra o cache real; tudo
> LOCAL; merge só com "sim" do usuário.

## Regras de integração cravadas (dos reviews)
- **[A4] Dois codepaths de faturamento** existem e ambos precisam da MESMA correção:
  tools MCP fiscais → `src/lib/metrics/fiscal/*`; dashboard/diretoria →
  `src/lib/reports/queries/fiscal.ts` (implementação separada, importa só
  `metrics/_shared`). Tools comercial/estoque → `src/lib/reports/queries/*`. O E2E
  final confere que MCP fiscal == dashboard para o mesmo recorte.
- **[A1/C3] Ordem final do `src/worker/fatos/registry.ts`** (fatia incremental):
  ...`fato_produto` → `fato_pedido` → `fato_nota_fiscal` → `fato_pedido_historico` →
  **`fato_pedido_item`** (TB.2) → **`fato_pedido_classificacao`** (T0.6, `cycle:
  "incremental"`, POR ÚLTIMO). `registry.ts` é ARQUIVO COMPARTILHADO: só o
  orquestrador edita; ondas 0 e B não o tocam em paralelo.
- **[C2] Migrations serializam** (histórico linear do Prisma): T0.5 aplicada e
  `generate` ANTES de A/B; cada migration é passo único; Onda C tem a sua.
- **[H1/M2] Rebuild por onda** (mapa CLAUDE.md §2.1; worker rebuilda via `app`):
  Onda 0 = app+mcp+worker (migration+builder); A = app+mcp; B = app+mcp+worker;
  C = mcp (+worker se builder); D = app.
- **[A2/A3] Fechamento de catálogo** numa task única após TODAS as tools novas:
  atualizar `mcp/__tests__/integration.test.ts` (toHaveLength 114→119 em 4 pontos,
  123→128, `COMERCIAL_IDS` 21→24 + texto, `ESTOQUE_IDS` 11→13, `TODOS_IDS`) e
  regenerar `src/lib/mcp-catalog-snapshot.json` via `npm run gen:mcp-catalog`
  (consumido por tool-digest de produção, painel MCP e golden-gate); versionar o json.

---

## ONDA 0 , Núcleo + materialização (serial; base de tudo)
Rebuild ao fim: app+mcp+worker.

- **T0.0 [M6] Baseline anti-regressão** ANTES de qualquer builder novo.
  Arquivo: `scripts/baseline-faturamento.ts` (scratch). Snapshot JSON dos números
  atuais de todas as métricas fiscais + `reports/queries/fiscal`. Verificação: json gerado.
- **T0.1 Fixtures reais.** `src/lib/fiscal/regras/__fixtures__/etapas-operacoes.ts`.
  Verificação: tsc.
- **T0.2 `classificaEtapaDemanda` (TDD).** `classifica-etapa-demanda.ts`+test.
  Verificação: jest (Emite NF Consumidor Final=FECHADA; GERA BOLETO=ABERTA; Cancelado=IGNORAR).
- **T0.3 `classificaOperacao` (TDD)** reusando `regras`+`grupo` (`ehNotaIntragrupo`).
  Verificação: jest ("VENDA DE BEM DO ATIVO IMOBILIZADO" != VENDA_EXTERNA; peças=VENDA_EXTERNA).
- **T0.4 `isVendaExterna` no core (TDD).** Estende `metrics/fiscal/_itens-venda-grupo.ts`.
  entrada_saida='1', situacao='autorizada', modelo='55', venda por CFOP/natureza_id,
  `ehNotaIntragrupo=false`. Verificação: E2E bruto externo == core atual (baseline T0.0).
- **T0.5 [C1-líquido, TDD] `devolucaoDeVenda` + `faturamentoLiquido`.** Função pura:
  devolução de venda = ENTRADA fin.4 CFOP 1202/2202 externo (NÃO saída fin.4 = devolução
  de compra). líquido = bruto − devoluções. Verificação: jest + E2E (saídas fin.4 R$84M
  NÃO entram; entradas fin.4 ~R$1,8M entram como devolução).
- **T0.6 Migration colunas derivadas.** `schema.prisma`: `fato_pedido.categoria_operacao`,
  `.bucket_demanda`; `fato_nota_fiscal.is_venda_externa` (todas nullable, com índice).
  [M2] `dias_parado` NÃO materializar (calcular em query). Verificação: `prisma migrate
  dev` + `generate`; `agente schema-changed` (dev). Rollback: colunas nullable, down documentado.
- **T0.7 [A1] Builder `fato_pedido_classificacao` (`cycle:"incremental"`, POR ÚLTIMO).**
  `src/worker/fatos/fato-pedido-classificacao.ts` + registro. UPDATE das 3 colunas via
  helpers. Verificação: rodar CICLO INCREMENTAL COMPLETO e conferir que as colunas
  seguem preenchidas depois (não só execução isolada); rebuild `app`+recreate worker.

---

## ONDA A , Faturamento de venda real (não depende de item)
Rebuild ao fim: app+mcp.
Uma tarefa por arquivo (enumeradas, [C1]):
- **TA.1** `metrics/fiscal/faturamento-por-operacao.ts` , aplicar `is_venda_externa`.
- **TA.2** `-por-regime.ts`. **TA.3** `-por-cfop.ts`. **TA.4** `-por-empresa.ts`.
  **TA.5** `-por-vendedor.ts`. **TA.6** `-recebido.ts`. **TA.7** `-autorizado.ts`.
  Cada: aplicar filtro + (onde faz sentido) expor bruto/líquido/devoluções (usa T0.5).
  Verificação por arquivo: jest + golden atualizado conscientemente + E2E (número novo
  bate com SELECT; canônicos Fase 2.5 inalterados vs baseline T0.0).
- **TA.8** Conferir canônicos (`receita-consolidada`, `serie-mensal`, `-cliente/marca/
  uf-canon`, `matriz-intercompany`, `ponte-faturamento`, `impacto-cancelamentos`):
  teste de não-regressão (diff zero vs baseline).
- **TA.9 [A4]** Espelhar em `src/lib/reports/queries/fiscal.ts` (dashboard). Verificação:
  E2E MCP fiscal == dashboard para o mesmo recorte.

---

## ONDA B , Itens de pedido + tools (depende de T0.5/0.6)
Rebuild ao fim: app+mcp+worker.
- **TB.1** Migration `fato_pedido_item` (schema + índices `pedido_id`,`produto_id`).
- **TB.2** Builder `fato-pedido-item.ts` (derivação; após `fato_produto` no registry;
  orquestrador integra registry). Filtros: `jsonb_typeof(pedido_id)='array'`,
  `quantidade>0`; join `fato_produto` p/ família/marca. Verificação: count ≈ esperado,
  cobertura 99%, E2E de um pedido.
- **TB.3 [spike] Validar vínculo item-de-NF ↔ pedido** (para TB.8 descontar já faturado):
  confirmar se `fato_nota_fiscal_item` liga a pedido. Verificação: SELECT. Se não ligar,
  TB.8 usa aproximação declarada.
- **TB.4 (TDD)** lógica pura de "tempo parado" (`NOW - max(data_entrada)` etapa atual;
  fallback data_aprovacao/orcamento p/ 153 sem histórico) + ordenações. Verificação: jest.
- **TB.5** Tool `comercial_demanda_em_aberta` (usa TB.4). Verificação: E2E total == motor.
- **TB.6 (TDD)** inferência de próxima etapa (método: transição mais comum no histórico
  por etapa; rotular probabilística). Verificação: jest.
- **TB.7** Tool `comercial_pedido_situacao` (trilha determinística + TB.6). E2E PV real.
- **TB.8** Tool `comercial_demanda_por_produto` (quantidade, etapas abertas, qtd>0). E2E.
- **TB.9 (TDD)** fórmula `estoque_disponivel` (saldo − comprometido − já faturado). jest.
- **TB.10** Tool `estoque_disponivel` (usa TB.9; pasta `mcp/tools/estoque/`). E2E T600X.
- **TB.11 [RBAC, M5]** mapear papel/catálogo das 5 tools novas + teste de catálogo filtrado.

---

## ONDA C , Seriais
Rebuild ao fim: mcp (+worker se builder).
- **TC.1 [C1-review2] Auditar `fato_serial` EXISTENTE** (já tem `localNome`/`dataSaida`
  de `raw_sped_produto_lote_serie`). Medir cobertura de `dataSaida`/`quantidade`.
  Verificação: SELECT de cobertura.
- **TC.2** Se `dataSaida` suficiente: tool `estoque_seriais` (parados=dataSaida null;
  saídos=preenchida) direto, sem builder novo. Se insuficiente: TC.2b migration+derivação
  de `raw_sped_documento_item_rastreabilidade` (justificada). Verificação: E2E serial X.

---

## ONDA D , Diretoria (UI) + tabela no Nex , o entregável-título da branch
Rebuild ao fim: app.
- **TD.1 (TDD)** parser de tabela GFM no `MarkdownLite` (novo `Block type:"table"`,
  separador `---|---`, tratar `protectValues`/NBSP). Verificação: jest do parser.
- **TD.2** aplicar o Block table em `src/components/agent/agent-message.tsx` E em
  `src/components/agent/monitoramento/markdown-snapshot.tsx` (caminho correto [M1]).
  Verificação: render nos dois.
- **TD.3** estilo (ui-ux-pro-max, sessão principal): header, zebra, números à direita,
  `overflow-x:auto`. Verificação: pilares visuais + responsivo.
- **TD.4** fallback textual WhatsApp. Verificação: canal=WhatsApp emite texto alinhado.
- **TD.5** regra de prompt em `identity-base.ts` (tabela + resumo + `etapa:qtd` + follow-ups).
  Verificação: conversa real responde em tabela.
- **TD.6 [C4]** API da diretoria: rota(s)/handler `src/app/api/diretoria/*` para demanda/estoque.
- **TD.7 [C4]** entrada de menu Diretoria + gate RBAC da rota. Verificação: acesso por papel.
- **TD.8..TD.n [C4]** um painel por métrica em `src/app/(protected)/diretoria/*`.
  Verificação por painel: **paridade de dado** (painel == motor/tool).

---

## FECHAMENTO (após todas as tools/ondas)
- **F.1 [A2/A3]** atualizar `mcp/__tests__/integration.test.ts` (todas as assertivas
  enumeradas acima) + regenerar `mcp-catalog-snapshot.json` (`npm run gen:mcp-catalog`)
  + corrigir comentário defasado (~L289). Versionar o json.
- **F.2** tsc raiz+mcp=0; eslint=0; jest verde; golden-gate verde.
- **F.3** rebuild de todos os containers afetados; `/api/health` local ok.
- **F.4** E2E completo (SPEC v3 §9): demanda, faturamento bruto/líquido, produto,
  estoque, seriais; canônicos Fase 2.5 inalterados (diff vs baseline T0.0).
- **F.5** Propor merge ao usuário (NÃO mergear sem "sim"; merge dispara produção).
