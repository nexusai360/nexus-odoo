# Repaginação da tela de Entregas Parciais , Pesquisa mestre

> Documento HUB desta demanda. Acumula entendimento, decisões do dono, achados
> das frentes de pesquisa e o mapa de ataque. Iniciado em 2026-07-20.
> Regra do projeto: sem travessão (em dash) em nenhum texto.

## 0. Metodologia desta demanda (decisão FINAL do dono 2026-07-20, máxima agilidade)

Por fase, sem spec e sem múltiplas versões:
1. Monta o PLANNER da fase.
2. UMA review do planner -> planner v2.
3. Vai DIRETO para a IMPLEMENTAÇÃO da fase.
4. Testes.
5. Perícia (confere se entregou tudo conforme o planner). Se faltou, ajusta e
   retesta.
6. Avança para a próxima fase e repete.

Sem spec, sem review de spec, sem plan v1/v2/v3. Fase 1: só a review do plano que
já está rodando (gera o planner v2) e segue para a implementação. Ritmo enxuto.

## 1. Objetivo

Repaginar por completo a aba **Entregas parciais** (menu Diretoria > Pedidos &
Entregas > sub-aba "Entregas parciais", blocos B-08 KPIs + B-09 tabela) para
virar uma ferramenta de gestão de alto poder de filtragem, agrupamento e
visualização, com a **fonte de dados batendo 1:1 com o relatório oficial do
Odoo** ("Relatório de entregas parciais", ID 28).

Ordem pedida pelo dono: **primeiro pesquisa profunda + registro de dados + mapa
+ plano**; ele acompanha as fases. Só depois implementa. Kit fica para uma
evolução posterior.

## 2. Escopo

**Entra:**
1. Alinhar a **base de cálculo** deste relatório exatamente ao SQL oficial
   (definição de "demanda em aberto").
2. Trazer **todas as ~25 colunas** do relatório oficial.
3. **Etapas como tags coloridas** (cor puxada do Odoo) com capitalização
   padronizada.
4. **Poder de filtro e agrupamento** estilo Odoo / protótipo ERP Nexus: busca
   inteligente, presets, filtro personalizado com lógica aninhada, agrupar-por
   (aninhado, com subtotais), seletor de colunas com reordenação, múltiplas
   visões (lista, kanban, calendário, pivô).
5. Reaproveitar o padrão do **projeto vizinho ERP Nexus** como base.

**Não entra agora (evolução posterior):**
- Desmembramento/valor de kit neste relatório (fica para depois, decisão do dono).
- Reformulação profunda dos KPIs (vem numa fase seguinte, "KPIs muito melhores").

## 3. Requisitos do dono (verbatim resumido da conversa 2026-07-20)

- "Preciso que aqui em específico você traga exatamente igual a esse relatório
  que eu te mandei, o SQL." Fonte de dados 1:1 com o SQL oficial, para bater os
  dados. Crucial acertar as fontes.
- Colunas que ele precisa ver: número do pedido, orçamento, data prevista,
  contrato, emitente, e "todas aquelas colunas que tem no relatório". Faltam hoje:
  observações das entregas e vendedor (que ele quer poder agrupar e filtrar).
  "Todas as colunas eu preciso poder agrupar e filtrar de alguma forma."
- Etapas: puxar do Odoo (tela "Etapas da venda"), cada etapa tem sua cor (algumas
  sem cor). Renderizar como **tag colorida**, não texto cru.
- **Padronização de capitalização das etapas:** primeira letra da palavra
  maiúscula, demais minúsculas. Siglas/palavras de **2 letras** ficam **todas
  maiúsculas** (DF, NF, VF). Ex.: "GERA BOLETO" -> "Gera Boleto"; "emite NF" ->
  "Emite NF"; "VF - Mudar" -> "VF - Mudar".
- **Agrupar** (forma de visualizar, distinto de filtrar): por etapa, cliente, UF,
  status (liberado/bloqueado , tags já criadas e aprovadas), produto, vendedor.
  Poder aninhar agrupamento dentro de agrupamento.
- **Filtrar**: filtros inteligentes, poder construir. Hoje "os filtros são muito
  ruins, feios, não atendem". Referência: o protótipo ERP Nexus.
- Ordenar colunas, escolher colunas (já temos parcialmente), busca inteligente
  que reconhece o campo pelo que é digitado.
- Views alternativas (o ERP Nexus tem 5: lista, kanban por situação, calendário,
  tabela pivô, gráfico).
- "Repaginação completa, algo incrível, fora da caixa."

## 4. Decisões de UI/nomenclatura desta tela (duráveis)

- **D1 (2026-07-20): usar "E / OU" no lugar de "TODAS / QUALQUER"** no filtro
  personalizado (combinação de condições). Ex.: "Corresponder a [E] das
  condições" / "Corresponder a [OU] das condições". Preferência explícita do dono.
- **D2:** status financeiro (Liberado/Bloqueado) como tag, padrão já aprovado
  pelo dono ("você já criou algumas tags pra isso, ficou muito bom").
- **D3 (2026-07-20): a definição de "demanda em aberto" passa a usar a LISTA FIXA
  de 27 etapas** do relatório oficial. Os 17 extras saem (não são demanda de
  equipamento a fracionar/entregar). AVALIAR se isso vale só neste relatório ou
  em todas as 4 pontas (o dono preza consistência entre pontas; provável que a
  definição seja única). Confirmar via investigação de impacto.
- **D4 (2026-07-20): corrigir o vazamento da etapa "Cancelado"** (id 6,
  `finaliza_pedido_cancelando=false` no dado) da definição de demanda aberta. O
  dono pediu explicitamente: avaliar com SENSO CRÍTICO todas as pontas que
  consomem essa base (Diretoria, Relatórios 1.0/2.0, MCP/Nex, faturamento) e
  remover onde contaminar. Não aplicar cegamente.
- **D5 (2026-07-20): incluir Vendas Futuras (CFOP 5922/6922)** como demanda a
  entregar. Este relatório é de ENTREGA, não de faturamento; venda futura é
  "vendido e não entregue". Parar de excluir por simples faturamento no escopo de
  demanda a entregar. Verificar interação com D3 (a etapa da venda futura precisa
  estar nos 27, senão não aparece, igual ao oficial).
- **D6 (2026-07-20, FINAL): recuar o corte de ingestão de forma CIRÚRGICA.**
  Recuo por-modelo apenas para `pedido.documento` + `sped.documento.item` (e
  cadastros de etapa/operação se precisarem), trazendo só os pedidos antigos em
  aberto, NÃO o histórico de notas/financeiro/contábil (evita ~923 MB e risco).
  Data de start = pedido em aberto mais antigo do relatório (~nov/2024), sem
  limite para frente. CUIDADO: regra durável (corte = filtro, nunca faxina) e bug
  do PR #168 (recuar a constante ANTES do back-fill; congelar o purge).
- **D6b (2026-07-20, SUPERSEDED por D8): ~o histórico antigo aparece só neste
  relatório~.** Revisto pelo dono: ver D8. A métrica de demanda a entregar tem que
  ser IGUAL em todas as pontas, não pode divergir entre telas.
- **D8 (2026-07-20, FINAL, decisão do dono): CONSISTÊNCIA TOTAL da métrica de
  demanda a entregar.** "Tem que ser tudo igual, pareado, dados consistentes. Não
  dá pra o cara olhar um valor numa tela e outro valor noutra." Regras:
  1. "Demanda a entregar" (bucket ABERTA, definição whitelist 27 + tipo=venda) é
     UMA métrica só, com o MESMO número em TODA ponta onde aparece: card "Demandas
     a entregar" da visão geral da diretoria, relatório de entregas parciais,
     necessidade de compra, Nex/MCP, Relatórios 1.0/2.0. O relatório de entregas é
     a fonte da verdade; as demais espelham.
  2. A demanda a entregar **NÃO é recortada pelo corte de leitura de data**. Um
     pedido de 2024 ainda não entregue é demanda HOJE. Janela ampla (do mais antigo
     em aberto até hoje/futuro) em todas as pontas.
  3. O corte de leitura de 2026 continua valendo para as OUTRAS métricas
     (faturamento, a receber, etc), NÃO para demanda a entregar.
  Isso ELIMINA a contradição B3/RF10 da spec v2 (não há mais "janela local x
  card"): a janela ampla é global para a métrica de demanda. Consequências
  aceitas: card da visão geral, necessidade de compra, Nex e relatórios passam a
  incluir os pedidos antigos em aberto (R$ 13,4 mi), todos pareados.
- **D9 (2026-07-20, FINAL, refinamento do dono sobre filtros de período/empresa):**
  1. A pílula de PERÍODO (Hoje / Esta semana / Este mês / Este ano / Tudo /
     Personalizado) no topo de "Pedidos & Entregas" recorta os pedidos por
     `data_orcamento` e vale para TODAS as sub-abas, INCLUSIVE Entregas parciais.
     Continua assim.
  2. **"Tudo" = do primeiro pedido até o último** (janela completa; é o ÚNICO modo
     que traz os pedidos antigos, disponíveis após a Fase 1B). As demais pílulas
     (semana/mês/ano/personalizado) são o corte: recortam por `data_orcamento` no
     intervalo selecionado, SEM clampar no corte de leitura global (a pílula é a
     base de corte, não o `sync.corte_dados`).
  3. A consistência de D8 é PARA O MESMO período + mesma empresa: o card "Demandas
     a entregar" (Visão geral) e a aba Entregas parciais compartilham a pílula, logo
     dão o MESMO número. Trocar a pílula muda os dois igual.
  4. Filtro de EMPRESA funciona em Entregas parciais (filtra pela empresa emissora).
  5. Empresa sem entregas => ESTADO VAZIO informativo ("não há entregas para esta
     empresa"), SEM remover a empresa da lista de opções.
  Ajuste na spec: RF-A5 deixa de ser "sem recorte de data sempre"; passa a ser
  "demanda respeita a pílula de período; Tudo abre a base inteira".
- **D7 (2026-07-20): peças e venda a consumidor final , REMOVER POR ORA, com
  PENDÊNCIA registrada.** Ao adotar os 27, peças e consumidor final saem da
  demanda (some o comprometido dessas famílias na necessidade de compra). O dono
  autorizou remover por enquanto PARA AVANÇAR, mas EXIGE voltar a esse tema para a
  decisão final. Deixar comentário explícito no código (TODO com dono) e item em
  aberto neste doc. NÃO é decisão final.

### PENDÊNCIAS ABERTAS (decisão final do dono)
- [ ] **P1 (D7): peças + venda a consumidor final na demanda.** Removidas por ora
  via lista de 27. O dono vai reavaliar se peças devem voltar a contar como
  demanda (afeta necessidade de compra de peças). Marcar no código com comentário
  `// TODO(dono): revisar inclusao de pecas/consumidor final na demanda (D7)`.

## 5. Achados de reconhecimento (2026-07-20)

- **Projeto vizinho** (nome correto: **ERP Nexus**) =
  **`Projetos Internos/ERP Nexus`**. Está rodando: container `erp-nexus-app-1`
  na porta 3300, `erp-nexus-db-1` (pgvector pg16) porta 5437. É o protótipo com
  busca inteligente, filtros presets, filtro personalizado aninhado, agrupar-por,
  seletor de colunas com reordenação, e 5 views (lista/kanban/calendário/pivô/
  gráfico). Dados fictícios (Matrix Logística, Bio Ritmo, etc).
- **Cache real** do nexus-odoo: container `nexus-odoo-db-1`, Postgres porta
  **5436**, db `nexus_odoo_l1`, user `nexus`. Disponível para confronto de dados
  (Frente C).
- **Relatório oficial** (planilha gerada, 2019-2030 sem corte): 25 colunas, 3803
  linhas, 377 pedidos, R$ 60,7 mi (a atender x unitário), 3410 Liberado / 393
  Bloqueado. Colunas: Pedido, Orçamento, Prevista, Contrato, Emitente, Operação,
  Etapa, CNPJ, Cliente, Status, Forma Pagamento, CEP, UF, Cidade, Código, Produto,
  A atender, Unitário, Valor, Família, Marca, Observações, Mod de Frete, Obs
  Entrega, Vendedor.
- **Nossa tela hoje** (filtro "Tudo" + "Todas as empresas"): 352 pedidos, 2731
  linhas, R$ 66,0 mi total, R$ 41,8 mi falta venda, R$ 21,7 mi custo. Diverge do
  oficial (377 pedidos / 3803 linhas) , a diferença precisa ser cravada (Frente C).

## 6. SQL oficial (referência, ID 28)

Filtros-chave do WHERE (a serem reproduzidos):
- `pd.tipo = 'venda'`
- `not (pd.finaliza_pedido_confirmando or pd.finaliza_pedido_cancelando)`
- `pd.etapa_id in (130,94,95,5,132,86,133,4,129,124,120,171,121,103,87,167,202,
  203,204,205,179,180,185,186,187,183,226)` (27 etapas curadas a dedo)
- `not pd.operacao_id = 67`
- `pd.data_orcamento between <de> and <ate>`
- item: `sdi.tipo_item = 'P'`
- resultado final: `quantidade_a_atender > 0`
Onde `quantidade_a_atender = sdi.quantidade - soma(entregas dos pedidos derivados
com pedido_original_id = pd.id, mesmo produto, mesmo tipo_item, etapa não
cancela)`.

## 7. Frentes de pesquisa (status)

- [x] **Frente A , ERP Nexus (tabela avançada):** concluída. Doc:
  `2026-07-20-frenteA-erp-nexus-tabela.md`.

### Achados Frente A (ERP Nexus / tabela avançada)

- **Reorienta tudo:** o "ERP Nexus" é a **mesma base de código** do nexus-odoo
  (`package.json` name = `nexus-odoo`, mesmo stack, mesmos módulos). Zero
  tradução de stack no porte.
- O protótipo com os 8 recursos está em `src/components/modulos/` (do ERP
  Nexus), **client-side puro, dados mock**, rota `/vendas` que faz `notFound()`
  em produção. Convive com o sistema de produção real (`charts/data-table.tsx` +
  `src/lib/reports/**`, server-driven, visualmente mais simples).
- **Stack de tabela = zero dependências novas:** sem TanStack/dnd-kit/zustand/
  nuqs. Tudo `<table>` HTML, **DnD por pointer events manuais**, estado
  `useState`/`useMemo`, persistência em `localStorage`. base-ui + Tailwind v4 +
  lucide, idênticos ao nosso.
- **Motor de filtro aninhado:** árvore serializável `Regra`/`GrupoRegras`
  (conector todas/qualquer, ou seja E/OU), avaliada por `testaNo` recursivo. Só
  gera **predicado JS**, nunca SQL.
- **Busca inteligente é data-driven** (facets dos valores distintos das colunas
  visíveis), não NLP. "Vendedor: X" surge porque X é valor da coluna.
- **Agrupamento multinível:** recursão que achata em nós grupo/linha com
  `count` + `soma` por nível, no cliente.
- **Seletor de colunas** (`SeletorColunas`, ~200 linhas) é a peça mais cara:
  portal fixed, arraste por pointer events, lock de obrigatórias, larguras
  redimensionáveis. Independente de domínio.
- **Portabilidade:** a camada visual porta rápido (stack idêntico, autocontido).
  Como nosso B-09 já traz TODAS as ~2731 linhas ao cliente (Frente D), dá para
  usar o motor **client-side direto**, sem precisar de push-down server-side na
  v1. Cuidado com a fronteira RSC->client (funções `valor`/`get` das colunas não
  atravessam como prop; viram chaves/serializáveis).
- [x] **Frente B , Odoo etapas + cores:** concluída. Doc:
  `2026-07-20-frenteB-etapas-cores.md`.

### Achados Frente B (etapas + cores)

- **A cor JÁ está no cache**, sem nada novo a sincronizar: campo
  `raw_pedido_etapa.data->>'cor'`. É **hex literal** (ex.: `#fa7e1e`,
  `#00b159`, `#740001`), NÃO o índice 0-11 do Odoo. Usa direto na tag.
- Sem cor => `cor = false` (booleano JSON). 18 das 79 etapas de venda são assim
  (bloco `V.O -` etc). Renderizar neutro/cinza.
- A cor **não está nos fatos** (só `etapa_id`/`etapa_nome`). Ou fazemos join em
  `raw_pedido_etapa` por `etapa_id`, ou passamos a materializar `etapa_cor` no
  `fato_pedido`. Campo virgem no TS (nenhum código lê `cor` hoje).
- `raw_pedido_etapa`: 239 registros; `tipo=venda` = 79 (bate com a tela). Tabela
  completa das 79 (id, nome, cor, gatilhos, bucket) está no doc da frente.
- **Divergência de etapas é de COBERTURA, não de rótulo:** os 27 IDs do oficial
  todos batem como ABERTA na nossa lógica; MAS (a) 2 dos 27 nem são venda (id 87
  e 226 são `tipo=romaneio`); (b) nossa regra é dinâmica por gatilho e marca como
  ABERTA dezenas de outras etapas de venda fora dos 27. Ou seja, nossos conjuntos
  de etapas não coincidem com a lista fixa. (Frente C quantifica o efeito real.)
- **Capitalização (ajuste na regra do dono):** "2 letras maiúsculas" cobre só
  DF/NF/VF; no dado real há `PDV`, `JDS`, `JIB`, `SMARTFIT` (3+ letras) e `V.O`
  (2 letras com ponto). Recomendação: usar **allowlist de siglas** em vez de
  "detectar 2 letras". PONTO A CONFIRMAR COM O DONO.
- [x] **Frente C , divergência de dados:** concluída (agente + verificação
  inline contra o cache real). Doc: `2026-07-20-frenteC-divergencia-dados.md`.

### Achados Frente C (divergência de dados, cravado no cache real)

Fontes: planilha oficial (gerada 10:27, range 2019-2030) x cache `nexus_odoo_l1`
(sync de hoje ~12:42, muito fresco). Reprodução fiel do SQL oficial sobre os
`raw_*` (que espelham o Odoo 1:1; m2o = `[id,"nome"]`).

**Números:**
- Oficial (planilha): 377 pedidos / 3803 linhas / R$ 60,7 mi.
- Filtro oficial reproduzido NO CACHE: **325 pedidos / 3067 linhas / R$ 47,1 mi**.
- Cruzando os 377 números da planilha com o cache: **só 326 existem no cache**.

**Causa nº1 (estrutural, dominante): 51 pedidos da planilha NÃO existem no
cache.** O menor `data_orcamento` de venda no cache é **2026-01-04** (corte
técnico de ingestão, `src/worker/sync/corte.ts`). Os 51 ausentes têm orçamento
de **2024-11 a 2025-12** (todos pré-corte). Logo a planilha "2019-2030" sempre
terá mais que o cache. Para incluí-los seria preciso recuar o corte técnico de
ingestão (mais volume de sync) OU assumir que o relatório cobre 2026+.

**Comparando dentro do que o cache cobre (comparável de verdade):**
- Filtro oficial reproduzido: 325 pedidos.
- Nossa lógica (`bucket_demanda=ABERTA` + item `quantidade_a_atender>0`): 341.
- Em comum: 324. Nós temos **17 a mais**; falta **1**.

**Causa nº2: 17 pedidos a mais** = nossa regra dinâmica por gatilho classifica
como ABERTA etapas que a lista fixa de 27 do oficial não inclui. Distribuição:
AJUSTE FRACIONADO (5), Preview NF - Peças (3), Venda direta consumidor final (3),
Cancelado (2 = BUG, ver nº3), Emite NF Consumidor Final (2), CORREÇÃO (1),
FAT Cliente final (1). Adotar a lista fixa de 27 remove esses 17.

**Causa nº3 (BUG real): etapa "Cancelado" (id 6) entra como ABERTA** porque no
dado `finaliza_pedido_cancelando=false`. Pedidos cancelados aparecem
indevidamente. Corrigir independentemente do resto (a exclusão não pode depender
só desse flag para essa etapa).

**Correções de premissa (auto-perícia, contra sessões anteriores):**
- `fato_pedido_item.quantidade_a_atender` **NÃO está NULL** (0% nulo; job de
  atendimento rodou). Nosso "a atender" no cache **bate** com a fórmula oficial
  (`quantidade - entregas dos derivados via pedido_original_id`) e com o campo
  Odoo `quantidade_a_atender_pedido`: os três dão 3067 lin / R$ 47,1 mi no cache.
  A premissa antiga de "a atender quebrado/NULL" está SUPERADA.
- `pedido_original_id` **está preenchido** (m2o array); a fórmula de entregas
  derivadas É reproduzível. (O agente citou `pedido_pai_id` vazio, campo
  diferente e irrelevante para esta fórmula.)

**Causas de impacto ínfimo/nulo:** operação 67 (nem existe em
`raw_pedido_operacao`, zero pedidos), CFOP 5922/6922 + intragrupo (~2 pedidos).
Corte de data na tela reduz ~365 linhas / R$ 7,9 mi (tela usa corte de análise;
planilha usa 2019-2030).

### Detalhamento para a decisão do dono (2026-07-20)

**Cobertura dos 27 (esclarece "17 a mais e falta 1"):** dos nossos 341 pedidos
ABERTA no cache, **324 têm etapa dentro dos 27 do oficial e 17 têm etapa fora**.
Ou seja, cobrimos a lista dos 27 INTEIRA e ainda pegamos 17 extras. O "falta 1" =
PV-2676/26 (etapa "VF - SEGUIR COM RESERVA/FRACIONAMENTO 5117/6117") que existe no
filtro oficial mas ainda está SEM linha no `fato_pedido` (timing de rebuild do
fato), não é diferença de regra.

**Os 17 a mais (etapa + operação):**
- AJUSTE FRACIONADO (5): PV-2199, 2201, 2633, 2510, 2538.
- Preview NF - Peças (3): PV-1532, 0738, 2346 (operação "Venda de Peças").
- Venda direta consumidor final (3): PV-1810, 1811, 1091.
- Emite NF Consumidor Final (2): PV-2666, 1581.
- Cancelado (2): PV-1446, 1057 = BUG (não deviam contar).
- CORREÇÃO (1): PV-2576. FAT Cliente final (1): PV-2384.
Motivo: nossa regra é dinâmica (toda etapa de venda não-faturada/não-cancelada =
aberta); o oficial é lista manual de 27 curada pelo dono, que deixou essas de
fora de propósito.

**CFOP 5922/6922 = Vendas Futuras.** 15 no cache; 14 na etapa "VF - Emite NF"
(já classificamos FECHADA/IGNORAR, fora da demanda) e 1 em "Novo Fracionamento"
(ABERTA). Não são cancelados: são vendas faturadas antecipadamente com entrega
futura. Conceitualmente "vendido e não entregue" = poderia ser demanda; hoje
excluímos como faturamento. Decisão de negócio pendente.

**Os 51 pedidos antigos ausentes (status, da própria planilha oficial):** 742
itens, orçamento nov/2024 a dez/2025. Etapas: Input financeiro (26), Fracionar +
Novo Fracionamento (14), Aprovado (5), GERA BOLETO (3), Aprovação dono (2),
Reserva de estoque (1). **Todos em aberto/em andamento, nenhum cancelado nem
entregue.** Financeiro: 50 Liberado, 1 Bloqueado. **Valor a atender: R$ 13,4 mi**
= praticamente TODO o gap de valor (60,7 - 47,1 = 13,6 mi). São demanda real e
ativa; a decisão de recuar o corte de ingestão passa a ter peso alto.
- [x] **Frente D , nosso componente de tabela atual:** concluída. Doc:
  `2026-07-20-frenteD-tabela-atual.md`.

### Achados Frente D (tabela atual)

- B-09 usa um **DataTable próprio** (`src/components/charts/data-table.tsx`),
  sobre `ui/table` do base-ui (NÃO é TanStack). Recursos (busca, colunas,
  filtros, compacto, exportar, sort, paginação) são **100% client-side** sobre o
  array em memória, estado em `useState` (efêmero, sem URL/store).
- A página é RSC e traz **todas as ~2731 linhas ao browser** (sem take/skip):
  logo filtro/agrupamento/sort podem ser client-side sem custo de rede.
- **Reuso amplo:** o mesmo DataTable aparece em 8 arquivos (inclui Relatórios
  1.0/2.0). Evoluir por **props aditivas opcionais** ou **wrapper novo só do
  B-09** para não regredir as outras telas.
- O "filtros feio/ruim" atual = Popover de facetas por valor distinto embutido.
  MAS **já existe** um modelo de filtro recursivo **E/OU + operadores** pronto e
  testado (`filtro-avancado.ts`) com UI (`filters-dialog.tsx`), hoje só nos
  Relatórios via URL. **Reaproveitável** (e já casa com a decisão D1 E/OU).
- Design system cobre badge, badge-select (pílula + ícone), dialog, sheet,
  popover, select/searchable-select, checkbox, tabs, segmented-control,
  date-picker. Ícones Lucide.
- **Gaps a construir do zero:** agrupamento aninhado (não existe em lugar
  nenhum), reordenação de colunas por arraste (só há mostrar/ocultar), views
  persistidas. **Sem lib de DnD** (`@dnd-kit`/`react-dnd` ausentes; só
  `react-grid-layout` para blocos do dashboard). Reordenar coluna exige decidir:
  adicionar `@dnd-kit` ou reordenar por setas/sem arraste.

## 8. Consolidação e mapa de ataque

> Rascunho montado com as Frentes A, B, D. A FASE 1 (fonte de dados) recebe os
> números finais quando a Frente C aterrissar.

### Leitura geral

O porte é mais barato do que parecia: o protótipo do ERP Nexus é a **mesma base
de código** e **client-side puro**, e o nosso B-09 já entrega todas as ~2731
linhas ao browser. Então filtro/agrupamento/busca/reordenação podem rodar
**no cliente** na v1, sem push-down para o Prisma. O trabalho pesado real é
(a) **acertar a fonte de dados** e (b) **portar/adaptar a camada visual** sem
regredir as 8 telas que usam o DataTable de produção.

Estratégia de não-regressão: construir um **wrapper novo específico do B-09**
(ou props aditivas opcionais no DataTable), nunca alterar o comportamento atual
das outras telas.

### FASE 1 , Fonte de dados 1:1 com o SQL oficial (a mais crítica)

Objetivo: este relatório bater com o oficial. Com a Frente C cravada, o alinhamento
é MENOR do que parecia (dentro do cache já cobrimos 324 de 325). Ações:
- **Adotar a lista fixa de 27 etapas** como critério deste relatório específico
  (remove os 17 que temos a mais). Decisão do dono: este relatório passa a usar a
  lista curada, mesmo que o resto da plataforma siga a regra dinâmica.
- **Corrigir o BUG da etapa "Cancelado"** (id 6, `finaliza_pedido_cancelando=
  false`) que vaza como ABERTA. Vale para todas as pontas, não só este relatório.
- **a_atender: já está correto no cache** (nada a fazer aqui; premissa antiga de
  NULL superada). Manter `tipo_item='P'` e `a_atender>0` na tabela.
- CFOP 5922/6922 e operação 67: impacto ínfimo/nulo. Alinhar por completude, mas
  não movem o ponteiro.
- **DECISÃO DE PRODUTO PENDENTE (levar ao dono): os 51 pedidos antigos.** O corte
  técnico de ingestão (2026-01-04) faz o cache não ter pedidos pré-2026. A
  planilha "2019-2030" os inclui. Duas saídas: (a) recuar o corte técnico e
  ingerir o histórico (mais volume de sync, decisão de arquitetura), ou (b)
  assumir que o relatório cobre a janela 2026+ e comunicar isso na tela. Sem
  isso, nunca bate o total absoluto da planilha, e não é bug nosso.
- Escopo de data na tela: manter o toggle "incluir anteriores ao corte" e/ou um
  seletor de período próprio deste relatório (o dono usa 2019-2030 = "tudo").

**Achados investigação do CORTE DE INGESTÃO (2026-07-20):**
- Corte de ingestão = `CORTE_INGESTAO_ISO = "2026-01-01"` (constante fixa em
  `src/worker/sync/corte.ts`), aplicada por modelo via campo do catálogo
  (`pedido.documento` corta por `data_orcamento`), mas a DATA é global única.
- Corte de leitura = AppSetting `sync.corte_dados` (padrão 2026-03-16, mínimo
  `CORTE_DADOS_MINIMO=2026-01-01`). Existe ainda um purge MANUAL
  (`scripts/limpa/purge-pre-2026.ts`) que apaga fisicamente pré-corte.
- `rawDeleted=true` dispara quando um registro está no cache mas cai fora de
  `vivos=searchIds(corteDomain)`. Recuar a constante ANTES do back-fill evita o
  bug do PR #168. Os antigos entram pela RECONCILIAÇÃO (movimento "faltantes"),
  não pelo incremental (write_date antigo). Fatos se materializam sozinhos
  (builders só filtram `rawDeleted=false`).
- **Mínimo seguro (3 alavancas, nesta ordem):** (1) recuar `CORTE_INGESTAO_ISO`;
  (2) forçar reconcile + rebuild dos fatos; (3) recuar `sync.corte_dados` e baixar
  `CORTE_DADOS_MINIMO` (senão validação/calendário bloqueiam e a query de pedidos
  clampa em `corteAtualDate()` e esconde). Congelar o purge para não re-apagar.
- **TENSÃO (decisão do dono):** a alavanca de corte é GLOBAL. Recuar traz TODO o
  pré-2026 de TODOS os domínios (notas ~172 mil itens, financeiro, contábil...
  ~923 MB no purge original), não só os pedidos. Para trazer SÓ os pedidos
  antigos em aberto (o que o dono pediu) seria preciso um **override de corte
  por-modelo** (recuar só `pedido.documento` + `sped.documento.item` + cadastros
  de etapa/operação), mudança pequena de arquitetura e a forma cirúrgica de
  limitar volume sem cair no R1. RECOMENDAÇÃO: override por-modelo.

**Achados investigação da BASE DE DEMANDA (2026-07-20):**
- Fonte única confirmada: `fato_pedido.bucket_demanda`, montada por
  `fato-pedido-classificacao.ts` (2 funções gêmeas build+rebuild) com dois gates
  ORTOGONAIS: **OPERAÇÃO** (`classifica-operacao.ts`) + **ETAPA**
  (`classifica-etapa-demanda.ts`). Só o gate de ETAPA vira whitelist. Ninguém
  reimplementa; todas as pontas leem a coluna.
- Consumidores (4 pontas): Diretoria (`pedidos.ts` B2/B4/B6, `entregas-parciais.ts`,
  `estoque.ts` A12/necessidade de compra), Relatórios 1.0/2.0 (`comercial.ts`:
  `queryDemandaEmAberta`, `_por_produto`, `queryEstoqueDisponivel`), Nex/MCP
  (`comercial_demanda_*`, `pedido_situacao`, BI 3c em `bi-schema-reference.ts`).
- **"Carteira a faturar" e "a receber" NÃO usam bucket** (vêm de
  `fato_financeiro_titulo`): imunes à mudança.
- Impacto da whitelist de 27: os números de demanda CAEM e alinham ao oficial em
  todas as pontas; nenhum aumenta. **Efeito colateral a confirmar: peças e venda
  a consumidor final saem da demanda**, some o estoque comprometido dessas
  famílias na necessidade de compra.
- Cancelado (6, 123): não estão nos 27, a whitelist elimina o vazamento sozinha.
  Hoje ele contamina total/valor, "atrasadas", disponível negativo e compra
  fantasma no estoque, e o drill do Nex.
- Exceção "Nota emitida e não entregue" (226) JÁ está nos 27: coberta.

**Plano técnico da FASE 1 (consolidado):**
1. Constante compartilhada `ETAPAS_DEMANDA_ABERTA` (Set dos 27 ids) em
   `src/lib/fiscal/regras/`. Gate de ETAPA vira whitelist por id; **preservar o
   gate de OPERAÇÃO**, mas resolver a interação com D5 (venda futura): confirmar
   contra o dado que os VF em aberto passam o gate de operação (senão ajustar para
   não barrar 5922/6922 quando a etapa é de demanda). PONTO A TESTAR na spec.
2. Corrigir Cancelado por tabela (resolvido pela whitelist; validar nas 4 pontas).
3. Override de corte de ingestão por-modelo (pedido + item + cadastros) recuando
   para ~nov/2024 + reconcile dirigido + rebuild fatos + recuar corte de leitura
   e `CORTE_DADOS_MINIMO` + congelar o purge.
4. Mudança é GLOBAL (4 pontas). Atualizar `docs/kpis-diretoria.md` e o comentário
   de `bi-schema-reference.ts` no mesmo commit.

**Verificação D5 (venda futura x gate de operação), cravada no cache:** dos 14
pedidos com operação 5922/6922, só 1 tem etapa nos 27 (e já é ABERTA); os outros
13 estão em etapas de faturamento fora dos 27. Combinado com "324 de 325 em
comum, só 1 falta por timing", conclui-se que **o gate de operação não barra
nenhum pedido das 27 etapas**. Logo: adotar whitelist de 27 + preservar gate de
operação NÃO conflitam, e a venda futura em aberto entra. Nada a mexer no gate de
operação.

Spec da FASE 1: `docs/superpowers/specs/2026-07-20-fase1-base-calculo-entregas-parciais.md`.

### Achado-chave: os 27 etapas mapeados (2026-07-20)

Os 27 IDs do oficial, com nome/cor/flags (do cache):
- Fluxo normal: Aguardando Autorização (130), Aprovado (5), Input financeiro (86),
  Aprovação diretoria (94), Aprovação dono (95), Fracionar (132), Novo
  Fracionamento (133), GERA BOLETO (167).
- **Venda Futura EM ABERTO (já inclusas!):** VF - Aguardando autorização (4),
  VF 5922/6922 - PDV (103), VF - Fracionar (120), VF - Novo Fracionamento (121),
  VF - Input Financeiro (124), VF - Aprovado (129), VF - SEGUIR COM RESERVA/
  FRACIONAMENTO 5117/6117 (171), VF - 5117/6117 (179).
- V.O (ordem de venda) 5923/6923: 180, 183, 185, 186, 187.
- Transferências DF x Sergipe: 202, 203, 204, 205.
- **Romaneio (tipo != venda):** Reserva de Estoque (87), Nota emitida e não
  entregue (226, exceção da Mariane já conhecida).

**Consequências (simplificam a FASE 1):**
- **D5 (venda futura) sai de graça:** as VF em aberto já estão nos 27; as VF
  faturadas (VF - Emite NF=128 conf=true, VF - Fat Cliente Final=125/126/127, VF
  - Fracionamento concluído=122) NÃO estão nos 27 e ficam fora, corretamente. Não
  precisa de lógica de CFOP separada. Confirma o Q4 (os 15 pedidos 5922/6922
  estavam em "VF - Emite NF", faturados, e devem mesmo ficar de fora).
- **D4 (Cancelado) some deste relatório automaticamente** (etapa "Cancelado" id 6
  e "VF - Cancelado" id 123 não estão nos 27). A correção manual do vazamento de
  cancelamento é para as OUTRAS pontas que usam a regra dinâmica.
- **2 dos 27 são `tipo=romaneio`** (87, 226): confirmar se `fato_pedido` os
  ingere (a classificação atual é para tipo=venda). Ponto para a spec.
- **6 dos 27 têm cor `false`** (179,180,183,185,186,187): tag neutra.

### FASE 2 , Etapas como tags coloridas

- Carregar `etapa_cor` (hex do `raw_pedido_etapa.data->>'cor'`) até a linha, via
  join por `etapa_id` ou materializando no `fato_pedido`.
- Componente de tag de etapa: fundo/borda derivados do hex; `cor=false` => tag
  neutra. Contraste AA nos dois temas (o hex vem do Odoo, pode não ter contraste
  bom no dark , derivar tom/opacidade).
- **Capitalização por allowlist de siglas** (DF, NF, VF, PDV, JDS, JIB, V.O,
  SMARTFIT...), não pela regra literal de "2 letras". Confirmar allowlist final
  com o dono.

### FASE 3 , Colunas completas do oficial

Adicionar as que faltam: Orçamento, Prevista, Contrato/Validade, Emitente, CNPJ,
CEP, Código do produto, Unitário, Valor (cheio), Observações, Obs Entrega,
Vendedor. Algumas exigem materializar campo novo no fato (ex.: vendedor, emitente,
datas, obs). Cada coluna precisa ser **filtrável e agrupável** (requisito do dono).

### FASE 4 , Motor de filtro E / OU aninhado + busca inteligente

- Portar o motor `Regra`/`GrupoRegras` (árvore serializável, conector **E/OU**,
  avaliação recursiva client-side) e a UI de filtro personalizado, aplicando a
  decisão **D1 (E/OU no lugar de TODAS/QUALQUER)**.
- Busca inteligente por facets (valores distintos das colunas) com sugestão
  "Campo: valor". Presets de filtro (a definir quais fazem sentido aqui).

### FASE 5 , Agrupamento multinível com subtotais

- Portar a recursão de agrupamento (nós grupo/linha com count + soma por nível),
  com os campos que o dono pediu: etapa, cliente, UF, status, produto, vendedor.
  Aninhável. É "forma de visualizar", separado do filtro.

### FASE 6 , Seletor e reordenação de colunas

- Portar `SeletorColunas` (mostrar/ocultar + **reordenar por arraste** + lock de
  obrigatórias + largura). Decidir DnD: reusar os pointer events manuais do
  protótipo (sem nova dependência) em vez de adicionar `@dnd-kit`.

### FASE 7 , Views alternativas + salvar visão

- Kanban (por etapa/status), calendário (por data de orçamento/prevista), pivô
  (ex.: vendedor x mês, UF x etapa). Priorizar por valor; podem vir por último.
- "Salvar visão"/favoritos: persistir a config (colunas, filtros, agrupamento,
  view). Local (localStorage) na v1; server (padrão `SavedReport`/`layout-repo`)
  se o dono quiser compartilhar entre usuários.

### Fora deste escopo (evoluções seguintes)

- Reformular os KPIs ("KPIs muito melhores").
- Desmembramento e valor de kit neste relatório.

### Sequência sugerida de entrega

FASE 1 (fonte de dados, destrava a confiança nos números) -> FASE 2 (tags de
etapa) + FASE 3 (colunas) -> FASE 4 (filtro E/OU) -> FASE 5 (agrupamento) ->
FASE 6 (colunas DnD) -> FASE 7 (views + salvar). Cada fase: spec -> 2 reviews ->
plano -> 2 reviews -> execução TDD -> perícia -> E2E contra o cache real.
