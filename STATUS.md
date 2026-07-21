# STATUS , ponto de retomada

Branch ativa: **`feat/entregas-parciais-base-calculo`** (LOCAL, nada em produção).
Dev local no ar em `localhost:3000` (containers `db`+`redis` up; Docker reiniciado/destravado em 2026-07-21).

## Onde estamos (2026-07-21, noite 3) , LINHA DE TOTAL FIXA + CABEÇALHO + RENOMES + AUTO-SCROLL

Vários ajustes do dono no B-09:
- **Linha de TOTAL fixa (sticky) no rodapé** com somatórios por coluna, calculados
  sobre TODAS as linhas filtradas (não só a página). Novo `rodape?: (rows) => Node`
  em `ColunaDef`; `tabela-avancada` renderiza `<tfoot sticky bottom-0>`. Totais:
  Pedido = contagem (70 pedidos); Produtos = tag com total de linhas (753); Qtd.
  Total/Atendida/A Atender = soma; Valor Atendido/A Atender = soma (custo/venda pelo
  toggle); Desconto/Subtotal/Comissão(R$)/Custo Comercial/ICMS/DIFAL/FCP/PIS/COFINS/
  IRPJ/CSLL/Lucro Líquido = soma. **Margem geral = Σlíquido÷Σsubtotal** e **% Comissão
  geral = Σcomissão÷Σsubtotal** (fórmula do Odoo, nunca média de %). Financeiro =
  bloco central "Nverde | Nvermelho" (liberados|bloqueados). Validado: Valor A Atender
  total = R$ 5.935.873,07 (= KPI Falta entregar custo); Margem 9,75%; Financeiro 68|2.
- **Cabeçalho com cor distinta** (`bg-muted` + borda 2px) para separar do corpo.
- **IRPJ e CSLL** (novas colunas): `vr_irpj`/`vr_csll` do `raw_pedido_documento`
  (extrairRentabilidade), sem migration/rebuild. Também no detalhe.
- **"Valor total" REMOVIDA da lista** (duplicava Custo Comercial; decisão do dono).
- **Renomes** (colunas): Qtd. Total / Qtd. Atendida / Qtd. A Atender / Valor Atendido /
  Valor A Atender / % Comissão / Valor Comissão / Custo Comercial / Lucro Líquido /
  Condição de Pagamento. Detalhe idem (Custo Comercial, IRPJ, CSLL, Lucro Líquido).
- **Auto-scroll no seletor de Colunas durante o arraste** (`ui.tsx`): com o cursor
  perto do topo/fundo da lista, ela rola sozinha (rAF, velocidade por profundidade da
  borda); o alvo passou a ser ciente do scroll (deslocamento efetivo = cursor + scroll),
  permitindo levar uma coluna da última posição para o topo e vice-versa.
- tsc/eslint verdes; validado por Playwright (render-check), 0 erros de runtime.

## Onde estamos (2026-07-21, noite 2) , CONDIÇÃO VISÍVEL + COLUNA DE DESCONTO

Dois ajustes do dono no B-09:
- **Condição de pagamento agora VISÍVEL por padrão** (`padrao: true`). Estava
  `padrao: false` (existia mas ficava escondida no seletor , por isso ele "não via").
- **Desconto (novo)** em pedido E produto, do Odoo, SEM migration/rebuild:
  `extrairDesconto` lê `vr_desconto`(R$)/`al_desconto`(%) do cabeçalho
  (`raw_pedido_documento`); item lê os mesmos campos de `raw_sped_documento_item`
  (adicionados a `extrairRentabilidadeItem`). Coluna "Desconto" (R$) na lista
  (padrao), campo no filtro (Financeiro), seção Rentabilidade do detalhe (com %) e
  coluna Desconto na grade de produtos do detalhe.
- `storageKey` bumpado **v5→v6** (o `vis` persistido sem condição/desconto
  sobrescreveria; v6 aplica o novo default visível).
- Validado por Playwright (render-check): headers do default trazem "Condição de
  pagamento" e "Desconto"; PV-2557 no detalhe = **Desconto R$ 44.465,45 (61,88%)**
  (bate com o banco), produtos com desconto por item (R$ 21.920,96 / 18.886,83).
  tsc/eslint verdes.

## Onde estamos (2026-07-21, noite) , ORDEM DE COLUNAS + FINANCEIRO CENTRADO + CONDIÇÃO DE PAGAMENTO

Ajustes do dono no B-09 (após ver no browser):
- **Ordem TEMÁTICA das colunas** (COLUNAS em `entregas-catalogo.tsx`): assuntos
  juntos numa sequência que faz sentido , Identificação/Status (Pedido, Nº Mercos,
  Produtos, Etapa, Financeiro) → Cliente e localização (Cliente, CNPJ, Emitente, UF,
  Cidade, CEP) → Comercial (Vendedor, Operação, Modalidade, Forma, Condição) → Datas
  (Orçamento, Prevista, Validade) → Quantidades → Valores da entrega → Rentabilidade
  → Observações. O default visível segue essa ordem. `storageKey` bumpado **v4→v5**
  para o novo default valer (localStorage antigo sobrescreveria).
- **Financeiro CENTRALIZADO** na coluna (era à direita): novo `align?: "left"|
  "center"|"right"` em `ColunaDef` (tipos.ts), aplicado no header e na célula da
  `tabela-avancada.tsx` (sobrepõe o default numérica→direita). Status usa
  `align:"center"`. Medido no browser: centro da coluna = centro do ícone = 1302px
  (acompanha o resize, pois é `text-center`, não margem fixa).
- **Coluna "Condição de pagamento"** (do Odoo, logo após "Forma de pagamento"):
  `extrairCondicaoPagamento` lê `raw_pedido_documento.data.condicao_pagamento_id`
  (many2one [id,nome]), **mesmo jsonb já carregado, SEM migration e SEM rebuild**.
  PV-2464 = "Livre" (bate com o Odoo). Também no filtro (grupo Comercial) e no detalhe.
- Toggle custo/venda: o dono avaliou e decidiu **manter como está** (sem mudança).
- NOTA: o dropdown de produtos na LISTA foi posto em STAND-BY pelo dono (o detalhe já
  mostra os produtos); a rentabilidade por produto segue viva na tela de detalhe.
- Validado por Playwright (render-check): nova ordem dos headers, Financeiro centrado
  (medição), Condição "Livre" no detalhe. tsc/eslint verdes.

## Onde estamos (2026-07-21, fim de tarde) , RENTABILIDADE POR PRODUTO

**Comissão e Margem A NÍVEL DE PRODUTO no B-09** (dropdown + tela de detalhe),
replicando a rentabilidade do pedido para cada item. Dados prontos do Odoo em
`raw_sped_documento_item.data` (`al_comissao`, `vr_comissao`, `al_margem`,
`vr_liquido`), extraídos pelo mesmo padrão jsonb, **sem migration e sem rebuild**.

- Query `entregas-parciais.ts`: `extrairRentabilidadeItem`, `odooId` no select do
  item, carga em lote de `raw_sped_documento_item` (join 1:1 provado: 18895/18895),
  campos `itemComissaoPct/itemComissaoValor/itemLiquido/itemMargemPct` na linha.
- `ItemEntrega` ganhou `comissaoPct/comissaoValor/liquido/margemPct`; `ListaProdutos`
  ganhou 2 colunas (Comissão R$ e Margem %), grid `min-w-[70rem]`. Margem colorida
  por sinal (rose/emerald), tooltip com Líquido; Comissão com tooltip do %.
- **PERÍCIA (achado real):** ~52% dos itens de pedidos abertos vêm com
  `al_margem=0`/`vr_liquido=0` mesmo tendo valor e custo (3375 itens): o Odoo NÃO
  materializa a margem por item em vários pedidos, só no cabeçalho. Como a regra é
  **NUNCA recalcular margem** (Lucro Real), a célula mostra **"-" honesto** quando
  `margemPct==0 && liquido==0`, em vez de fabricar "0,00%". Comissão é sempre real
  (mostra R$; 0 genuíno quando o item não tem comissão, confirmado em PV-2464).
- Validado por Playwright (render-check): detalhe de PV-2464 com Margem por item
  20,64% / 19,86% (verde) e Comissão R$ 0,00 (valor real). tsc/eslint verdes.

## Onde estamos (2026-07-21, tarde) , ESTADO ANTERIOR

9 commits nesta sessão (`3946baf5..520c580a`), LOCAL, nada em prod, sem PR/merge.
Dev local no ar (rodei `dev:fresh` várias vezes , mudança de query/provider NÃO
aplica por fast-refresh, exige **hard reload** Cmd+Shift+R no browser).

**1) B-09 reformulado para modelo POR PEDIDO (era 1 linha por item):**
- 748 itens viraram **67 pedidos** (1 linha = 1 pedido em todas as visões).
- Coluna **Pedido = tag clicável** que abre o pedido no Odoo (URL do modelo
  `pedido.documento` montada de `linha.pedidoId`; confirmado no banco:
  3210=PV-2511/26, 3500=PV-2684/26).
- **Dropdown** expansível com os produtos; **detalhe redesenhado** em seções (sem
  cards retangulares; lista de produtos limpa, sem gridlines).
- Genérico `tabela-avancada.tsx` ganhou `expandirRow`/`renderDetalhe`/`textoBusca`/
  `permiteVenda` + `OpcoesTabelaContext`. Catálogo virou `LinhaEntrega`(pedido) +
  `ItemEntrega`; agregação em `blocos-pedidos.tsx`. storageKey da tabela em **v4**.

**2) Ajustes de UI:** pedido completo (sem truncar), chevron à esquerda, quinas do
card (overflow-hidden), hover por coluna (setas + divisória roxa), duplo-clique
auto-fit. Nome do cliente completo (`nomeLimpo` maxLen 999).

**3) Forma de pagamento CORRIGIDA NA FONTE:** vinha das parcelas (só ~40% dos
pedidos em aberto têm parcela) → agora de `raw_pedido_documento.data.forma_pagamento_id`
(cabeçalho, cobre 100%). PV-2464 passou de "-" para **Boleto**.

**4) Quantidade** (Total/Atendida/A atender) e **Valor** (Total/Atendido/A atender)
+ **toggle custo/venda com ícones** (Coins âmbar em cima / Tag verde embaixo), botão
"Mostrar venda".

**5) RENTABILIDADE do PEDIDO** (comissão/subtotal/margem/impostos) , extraída direto
do jsonb `raw_pedido_documento.data` (campos PRONTOS do Odoo, aba Rentabilidade):
`vr_operacao_tributacao`(subtotal), `vr_custo_comercial`, `vr_icms_proprio`,
`vr_difal`, `vr_fcp`, `vr_pis_proprio`, `vr_cofins_proprio`, `al_comissao`,
`vr_comissao`, `vr_liquido`, `al_margem`. **PERÍCIA CRÍTICA: Margem = Líquido ÷
Subtotal, e líquido/margem vêm PRONTOS , NÃO recalcular** (subtração simples das
colunas de imposto bruto dá margem errada, porque é Lucro Real e o `vr_liquido` já
abate créditos). Coluna **Margem** (colorida) + seção "Rentabilidade do pedido" no
detalhe; novo `CelulaTipo "percent"`. "Contrato" → **"Validade"**.

**6) MODO ESTENDIDO (tela larga) em TODAS as telas da Diretoria** (só lá):
`src/components/diretoria/modo-estendido.tsx` (`ModoEstendidoProvider` no
`diretoria/layout.tsx` + localStorage; `DiretoriaShell` substitui `PageShell wide`;
`BotaoModoEstendido` no padrão do "Editar layout"). Ligado: `max-w-none` + margem
25px. **Animação suave via Web Animations API (FLIP no max-width)** porque
`max-width:none` não é animável por CSS (dava a piscada); blocos do grid com
`.anim-off` (transition:none no modo visualização) acompanham quadro a quadro.

Validado por E2E Playwright (usuário `render-check`): 67 pedidos, tag, dropdown,
detalhe, rentabilidade (PV-2464 Margem 16,36%), toggle custo/venda, modo estendido
(1399→2320px em 2560). tsc/eslint verdes.

### PRÓXIMA SESSÃO (retomar por aqui)
1. ~~Replicar comissão/margem a nível de produto~~ **FEITO** (ver seção do topo).
2. Continuar os ajustes finos do B-09 conforme o dono validar.
3. (Futuro, opcional) materializar a rentabilidade nos fatos (migration + builder
   `fato-pedido.ts`/`fato-pedido-item.ts` + rebuild worker via `docker compose
   build app`) se quiser performance/uso por outros consumidores , investigação já
   feita (relatório do agente nesta sessão).

Obs.: os PDFs em `docs/nova-implementacao-dashboards/` NÃO são desta frente (outra
atividade); deixados intactos, fora dos meus commits.

---

## Onde estamos (2026-07-21, manhã)

**Tabela avançada do B-09 (Entregas Parciais) , réplica da tabela do ERP Nexus , ENTREGUE e no ar.**

Perícia completa do código-fonte do ERP Nexus + tabela rica e genérica portada
para `src/components/tabela-avancada/`, ligada no B-09
(`src/components/diretoria/blocos/blocos-pedidos.tsx`), substituindo o DataTable
antigo. As outras 7 telas seguem no `data-table.tsx` antigo. Tudo client-side.

Recursos: busca grande + inteligente por facets; UM "Filtros e agrupar" (presets
+ filtro E/OU aninhado com busca de campo + agrupar multinível + favoritos);
agrupamento com subtotais; multi-sort; seletor de colunas (buscar + reordenar por
arraste + coluna travada) na TOOLBAR; redimensionar (drag + duplo-clique);
compacto; exportar CSV; paginação corrigida; views Lista + Kanban (por dimensão
selecionável, com busca por coluna) + Calendário (Dia/Semana/Mês); tela de
detalhe do pedido (destaque no número, campos por largura, observações em bloco,
filtro por número + navegar); persistência por tela (localStorage).

### Entregue e validado (screenshots, 0 erros de runtime, tsc/eslint verdes):
- Ondas 0-5 (portagem completa) , commits 3681614f, 0e6056bc, 735fdd81.
- 6 ajustes do dono , 643c9e88 (altura grid até 12, fonte cabeçalho, seletor de
  colunas na toolbar) e 18594c0d (calendário Dia/Semana/Mês, kanban por dimensão,
  detalhe do pedido).
- Calibração (2a rodada) , fd660b74 (calendário: "Sem registro" nos dias vazios,
  tela de dia vazio, range com hífen, cabeçalho reorganizado período-central +
  seletor à direita + "Hoje" removido; DETALHE redesenhado com número em
  destaque, campos por detalheSpan, filtro por número do pedido).

## Docs de referência
- Perícia + decisões: `docs/superpowers/research/2026-07-20-pericia-tabela-erp-nexus-replicar-b09.md`
- PROGRESSO detalhado: `docs/superpowers/plans/2026-07-21-PROGRESSO-tabela-avancada-b09.md`
- Histórico: `docs/agents/HISTORY.md` (linhas de 2026-07-20 e 2026-07-21).

## PRÓXIMA AÇÃO
Aguardando o dono avaliar no browser e (a) pedir novos ajustes finos , aplicar
inline (UI + ui-ux-pro-max) + screenshot de validação (usuário render:
`render-check@local.test` / `Teste@12345`; script playwright com
`channel:"chrome"`, playwright já instalado via `--no-save`); ou (b) autorizar o
MERGE para produção. **Nada vai para produção sem "sim" explícito do dono.**

## Regras vivas
- Commit na pasta principal fora da main exige `GIT_AGENTE_BYPASS=1` (todas as
  fases desta branch foram commitadas assim).
- Proibido travessão em qualquer texto. UI sempre inline + `ui-ux-pro-max`.
- Metodologia ágil (D0): planner -> 1 review -> planner v2 -> implementação -> perícia.
