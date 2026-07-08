# HANDOFF , Inteligência de Demanda (branch feat/menu-diretoria) , 2026-07-08

> **LEIA PRIMEIRO ao retomar.** Este doc deixa a próxima sessão pronta para continuar
> com o MESMO nível de qualidade, sem perda. Ordem de leitura sugerida:
> 1) este HANDOFF (estado + próxima ação + armadilhas);
> 2) `2026-07-07-diretoria-inteligencia-demanda-EXECUCAO-PROGRESSO.md` (checklist onda a onda);
> 3) `../specs/pericia-fluxos-2026-07/` (dossiê da regra de negócio) + `SPEC-v3` + `PLAN-v3`.

## 0. Missão (o que o usuário quer, na íntegra)
Corrigir na RAIZ, em toda a plataforma, dois conceitos e entregar inteligência nova:
- **Demanda em aberta** = pedido de VENDA a cliente EXTERNO, aprovado, ainda sem NF ao
  consumidor final. É por ETAPA (não por `vr_nf`, que é furado). Materializado.
- **Faturamento de venda real** = só venda externa; fora triangulação/intragrupo (41,6%),
  transferência, remessa, bonificação, demonstração. (JÁ correto na Fase 2.5.)
- Capacidades novas: demanda detalhada + imersão no pedido, produto com mais demanda (por
  QUANTIDADE), estoque disponível (saldo menos travado em demanda; negativo = comprar),
  seriais (parados x saídos), e RESPOSTAS EM TABELA no Nex (estilo ChatGPT).
Estilo do usuário: intensidade máxima, não parar, autônomo, cron de 10 min ligado
(job `7,17,27,37,47,57 * * * *`, sessão-only). NUNCA mergear `main` sem "sim" explícito.

## 1. ESTADO ATUAL , Ondas 0/A/B/C + tabela do Nex COMPLETAS (tudo local, commitado)
Catálogo MCP: **128 tools**. Integração `mcp/__tests__/integration.test.ts`: **53/53**.
Materialização mantida pelo worker (imagem `nexus-odoo:local` rebuildada 03:30).

- **Onda 0 (núcleo + materialização) , COMPLETA.** Helpers puros TDD em
  `src/lib/fiscal/regras/`: `classificaEtapaDemanda`, `classificaOperacao`,
  `notaEhVendaExterna`, `notaEhDevolucaoDeVenda`+`faturamentoLiquido` (43 testes verdes,
  reusam `classificarCfop` + `ehNotaIntragrupo` do core). Colunas materializadas:
  `fato_pedido.categoria_operacao`, `fato_pedido.bucket_demanda`,
  `fato_nota_fiscal.is_venda_externa`. Builder pós-passo
  `src/worker/fatos/fato-pedido-classificacao.ts` (cycle incremental, POR ÚLTIMO no
  registry, updateMany em lote, leitura em 1 passada com CTE). E2E: **demanda ABERTA=395
  pedidos/R$77,6M**, FECHADA=810, IGNORAR=1112; venda externa=1376 notas/R$96,7M.
- **Onda A (faturamento) , VALIDADA, sem reescrita.** 7 métricas principais já usam o
  core (`receita-consolidada` etc.). E2E: `receitaExterna`=R$97,6M, intragrupo eliminado
  =R$69,5M (41,6%). NÃO reescrever (evita regressão). Refinamentos opcionais só se pedido:
  (a) `modelo=55` no core (~1%); (b) líquido de devoluções de venda (T0.5, ~1,8%).
- **Onda B (5 entregas de valor) , COMPLETA.** `fato_pedido_item` (derivação de
  `raw_sped_documento_item`, 19292 itens, família 99,7%) + tools:
  `comercial_demanda_em_aberta`, `comercial_pedido_situacao` (imersão/trilha),
  `comercial_demanda_por_produto` (qtd), `comercial_estoque_disponivel` (T600X: saldo
  549 - demanda 772 = -223), todas domínio comercial.
- **Onda C (seriais) , COMPLETA.** `comercial_seriais_produto` (parados x saídos via
  `raw_sped_documento_item_rastreabilidade`->item->nota). E2E T600X: 1570 seriais, 301
  parados, 1269 saíram.
- **Onda D , TABELA NO NEX COMPLETA (end-to-end).** Parser puro
  `src/components/agent/gfm-table.ts` (`tryParseTable`, TDD 6/6). MarkdownLite
  (`agent-message.tsx`) + MarkdownSnapshot (`agent/monitoramento/markdown-snapshot.tsx`)
  estendidos com `Block` table + componente estilizado (ui-ux-pro-max: tabular-nums,
  números à direita, divisores em light/dark, zebra, overflow-x). Regra de prompt
  `8-tab` em `src/lib/agent/prompt/identity-base.ts`. FALTA validar na tela.

## STATUS 2026-07-08 (sessão 2): PAINÉIS DA DIRETORIA , COMPLETOS
Sub-projeto **FECHADO** (tudo local, nada em produção). Entregue nesta sessão:
- Backend TDD: `queries/pedidos.ts` reapontado para `bucketDemanda:'ABERTA'` (paridade
  painel==tool) + `queryDemandaPorEtapa`/`queryDemandasMaisParadas` + UF-scoping;
  `queryEstoqueDisponivelDiretoria` em `queries/estoque.ts`. Pedidos 10/10, estoque 15/15.
- UI ui-ux-pro-max: blocos B-06 (Demanda por etapa/rosca), B-07 (Mais paradas/tabela+selo),
  A-12 (Estoque disponível a comprar/tabela+selo). Integrados ao builder existente; RBAC
  herdado por área (B->pedidos, A->estoque); layouts padrão atualizados nas 2 páginas.
- E2E cache real: demanda 395/R$77,6M; estoque 1894 produtos/484 negativos/6.970 un.;
  T600X -223. tsc=0, eslint=0, diretoria 101/101. Dev no ar (localhost:3000, rotas 302).
- FALTA só a validação VISUAL do usuário (painéis + tabela do Nex no chat) e o MERGE
  (com "sim" explícito). Commits: query-pedidos, query-estoque, UI-painéis, docs.

## 2. (histórico) PLANO EXECUTADO: PAINÉIS DA DIRETORIA
A diretoria já EXISTE e é robusta: páginas em `src/app/(protected)/diretoria/`
(page, pedidos, vendas, agenda, estoque, visao-geral), queries em
`src/lib/diretoria/queries/*`, componentes em `src/components/diretoria/*`, acesso via
`requireDiretoriaArea`/`canDiretoria`/`userUfs` (`src/lib/diretoria/access`), freshness
(`src/lib/diretoria/freshness`), e um **BUILDER DE LAYOUT** (`BlocoLayout`,
`carregarLayout` em `src/lib/diretoria/builder/`). ATENÇÃO: `diretoria/pedidos` já mostra
"demandas" com a **lógica ANTIGA** (`queryDemandasPendentes`/`queryIndicadoresDemandas`
em `src/lib/diretoria/queries/pedidos.ts`).

Plano recomendado para a diretoria (fazer com ui-ux-pro-max, paridade de dado painel==tool):
1. **Query de diretoria** (backend, autocontida, primeiro): criar em
   `src/lib/diretoria/queries/` uma `queryDemandaEmAbertaDiretoria` reusando `bucket_demanda`
   (ou reusar `queryDemandaEmAberta` de `reports/queries/comercial.ts`), respeitando `userUfs`.
   E `queryEstoqueDisponivelDiretoria` (reusa `queryEstoqueDisponivel`). TDD/E2E: bater com
   as tools (395/R$77,6M; T600X -223).
2. **Atualizar a lógica antiga**: avaliar trocar `queryDemandasPendentes` (lógica velha) pela
   nova `bucket_demanda` na página `diretoria/pedidos`, mantendo o contrato de dados que a
   tela espera (ver `PedidosData` em `components/diretoria/pedidos/pedidos-screen`). Paridade.
3. **Painel/bloco novo**: integrar ao builder de layout (`BlocoLayout`) um bloco de
   "Demanda em aberta" (total, por etapa, mais paradas) e "Estoque disponível" (negativos).
   Seguir o padrão de `pedidos-montavel.tsx` / `carregarLayout`.
4. **RBAC/menu**: se criar rota nova, adicionar em `requireDiretoriaArea` e no menu; senão,
   encaixar nas áreas existentes (pedidos/estoque). Testar acesso por papel.
5. Validar visualmente (subir dev, ver os painéis) + paridade de número com as tools.

## 3. ARMADILHAS APRENDIDAS (não repetir , custaram tempo)
- **NÃO importar `Prisma` value** de `@/generated/prisma/client` em código lido pelo MCP
  (`src/lib/reports/queries/comercial.ts` etc.): quebra o jest do mcp com "Cannot use
  import.meta". Usar `$queryRaw` com valor parametrizado (ex.: `ILIKE ${padrao}`) ou
  filtrar/agregar em TS. `import type` é ok.
- **Casts de int em jsonb do Odoo via CASE regex**: many2one `false` vira o texto "false"
  e o `AND` do SQL NÃO curto-circuita o cast (nem no JOIN). Guardar TODO cast:
  `CASE WHEN (x->>0) ~ '^[0-9]+$' THEN (x->>0)::int END`.
- **Migration com drift da F6**: o banco dev compartilhado tem migrations da F6 (local-only)
  ausentes nesta branch; `prisma migrate dev` quer RESETAR (perde o cache). Aplicar colunas/
  tabelas via `ALTER`/`CREATE TABLE` idempotente no psql + `prisma generate`. Migration formal
  do Prisma fica para o momento do merge (com ambiente limpo). Tabelas criadas assim:
  colunas de classificação + `fato_pedido_item`.
- **Rebuild do worker é via `app`**: o container worker roda a imagem `nexus-odoo:local`
  construída pelo serviço `app`. `docker compose build worker` é no-op. Para o worker rodar
  builders novos: `docker compose build app` + `docker compose up -d --force-recreate worker`.
  Confirmar `docker image inspect nexus-odoo:local --format '{{.Created}}'` = agora.
- **produto_id x código no nome**: o "[99]" no `produto_nome` é CÓDIGO, não o `produto_id`
  (odoo). Ex.: T600X tem `produto_id=52`. Cruzar por `produto_id`, nunca pelo número do nome.
- **is_venda_externa** exige `modelo='55'`; o core (`receita-consolidada`) não filtra modelo
  (por isso R$96,7M vs R$97,6M, ~1%). Diferença esperada.
- **Goldens**: cada tool nova = +1 em `mcp/__tests__/integration.test.ts` (contagens
  `toHaveLength(N)` do catálogo total + `COMERCIAL_IDS` + texto "N tools de comercial") e
  `npm run gen:mcp-catalog` (regenera `src/lib/mcp-catalog-snapshot.json`, versionar). NÃO
  usar `perl` cego em `toHaveLength(21)` etc.: há counts de OUTROS domínios (financeiro=21)
  que NÃO mudam , mexer só nos do catálogo total e comercial.

## 4. VALIDAÇÃO PENDENTE (rápida, de valor)
Subir dev (`npm run dev:fresh` ou `agente up`), abrir o Nex, perguntar "quanto temos de
demanda em aberto?" e "qual produto tem mais demanda?" e CONFERIR: (a) a tabela renderiza
bonita; (b) os números batem (395/R$77,6M; PISO BLACK 2096). Rebuild do `app` já inclui as
tools; o identity-base novo o dev pega ao recompilar.

## 5. Comandos úteis
- E2E no cache: `docker exec nexus-odoo-db-1 psql -U nexus -d nexus_odoo_l1 -c "..."`
- Repopular materialização (se worker não rodou ciclo): rodar inline os builders
  `fato_pedido_item` e `fato_pedido_classificacao` via `npx tsx --env-file=.env.local -e "..."`.
- Testes: `npx jest src/lib/fiscal/regras` (núcleo), `npx jest mcp/__tests__/integration.test.ts`.

## 6. Metodologia (manter o nível)
Para qualquer nova spec/plan: ciclo SEQUENCIAL (v1 -> verificação #1 -> v2 -> verificação #2
mais profunda -> v3), NUNCA reviews em paralelo. TDD onde há lógica. E2E contra o dado real
sempre. Commit atômico por tarefa. UI só na sessão principal + ui-ux-pro-max. Modelo Opus.
