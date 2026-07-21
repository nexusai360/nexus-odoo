# PLANNER , FASE 3: Colunas completas do relatório oficial (B-09 Entregas Parciais)

> Metodologia D0 (dono, máxima agilidade): planner v1 -> 1 review adversarial ->
> planner v2 -> implementação (UI inline + ui-ux-pro-max) -> testes -> perícia.
> Sem spec. Branch `feat/entregas-parciais-base-calculo` (LOCAL, nada em produção).
> Hub: `docs/superpowers/research/2026-07-20-entregas-parciais-repaginacao-pesquisa.md`.

## 0. REVIEW ADVERSARIAL APLICADA (v2, 2026-07-20)

A review (Opus) validou a arquitetura contra o código e o cache real e achou
material. Correções incorporadas (o texto abaixo permanece; estas prevalecem):

- **H1 (ALTO) , "Limpar" pode zerar as colunas.** A trava `>=1 visível` vive só
  no `toggleColuna` unitário; uma escrita em lote a fura e quebra a tabela
  (`colSpan=0`). Decisão: "Marcar todas" e "Limpar" do seletor operam sobre o
  conjunto **filtrado pela busca do seletor**, e a escrita final passa por um
  guard que garante **>=1 coluna visível global** (se "Limpar" zerar, mantém a
  primeira coluna definida visível).
- **M1 (MÉDIO) , premissa factual corrigida:** `dataOrcamento` está só no `where`,
  NÃO no `select` (`entregas-parciais.ts:181-193`). T2 adiciona `dataOrcamento`
  ao select **explicitamente** (não "já lá"). "Valor cheio" (`vrProdutos` do
  item) esse sim já está no select , correto.
- **M2 (MÉDIO) , deps de memo:** ao trocar busca/filtro para `colunasVisiveis`,
  incluir `visiveis` nas deps de `filtered`, `valoresPorColuna` e
  `colunasFiltráveis`, senão alternar coluna não re-filtra (busca "presa").
- **M3 (MÉDIO) , filtro-por-coluna órfão:** ao ocultar uma coluna, **limpar sua
  entrada em `colFiltros`** (no `toggleColuna`), para não deixar filtro ativo
  invisível sumindo linhas sem explicação.
- **B1 , Unitário derivado:** confirmado no cache que `vr_produtos/quantidade ==
  vr_unitario` (inclusive com desconto: `vr_produtos` é BRUTO, e com quantidade
  fracionária). Drift só de arredondamento de centavo em ~1,4% dos itens (efeito
  de `vr_produtos` já vir a 2 casas). **Aceito** (coluna de exibição `moeda`, 2
  casas); a perícia §6.1 roda a query **agregada** (não 3-5 linhas).
- **B2 , datas:** off-by-one NÃO se materializa (storage `timestamp` 00:00:00 +
  DB TZ UTC). Reusar o padrão já provado no repo `d.toISOString().slice(0,10)`
  (`estoque.ts:868`) em vez de criar `isoDataUTC`. Nulo -> `null` -> `DASH` na UI.
- **B4 , mock:** estender `opts.parceiros` com `documento`/`cep` (e o ramo `else`
  do mock); o ramo `documentoDigits` de `carregarParticipantesGrupo` fica intacto.
- **B5 , observações:** join `fato_pedido(ABERTA) == raw_pedido_documento` cobre
  **100%** (450/450). `obs` preenchida ~51% (coluna ÚTIL), `obs_produtos` ~5%.
  Correção da justificativa: a coluna nasce oculta por anti-inundação (28 col.),
  não por "quase sempre vazia" (isso só vale para Obs entrega).
- **B6 , UI:** `aria-label` no input de busca do seletor; ordenação de data
  (`localeCompare` sobre ISO) e alinhamento moeda já corretos automaticamente.

## 1. Objetivo

Trazer ao B-09 as **12 colunas** do relatório oficial (ID 28) que ainda faltam,
cada uma pronta para ser filtrada/agrupada nas Fases 4-5. Regra dura desta fase:
**ZERO migration e ZERO rebuild de worker** , tudo resolve na camada de query +
UI, exatamente como a Fase 2 fez com a cor da etapa (batch no raw, sem tocar o
fato). E **zero regressão** nas outras 7 telas que usam o `DataTable`.

As 12 colunas: Orçamento (data), Prevista (data), Contrato/Validade (data),
Emitente, CNPJ, CEP, Código do produto, Unitário, Valor cheio, Observações,
Obs Entrega, Vendedor.

## 2. Fontes cravadas (3 frentes de reconhecimento, 2026-07-20)

Confirmado contra `prisma/schema.prisma` e o cache real (`nexus_odoo_l1`).

| Coluna | Fonte | Materializar? | tipo coluna |
|---|---|---|---|
| Orçamento | `fatoPedido.dataOrcamento` (já no select) | Não | `data` |
| Prevista | `fatoPedido.dataPrevista` (add ao select) | Não | `data` |
| Contrato/Validade | `fatoPedido.dataValidade` (add ao select) | Não | `data` |
| Emitente | `fatoPedido.empresaNome` (add ao select) | Não | `texto` |
| Vendedor | `fatoPedido.vendedorNome` (add ao select) | Não | `texto` |
| Valor cheio | `fatoPedidoItem.vrProdutos` (já no select) | Não | `moeda` |
| CNPJ | `fatoParceiro.documento` (add Map por participanteId) | Não | `texto` |
| CEP | `fatoParceiro.cep` (mesmo Map) | Não | `texto` |
| Código produto | `fatoProduto.codigo` (add ao select + Map por produtoId) | Não | `texto` |
| Unitário | derivado: `valorCheio / quantidade` do item | Não | `moeda` |
| Observações | `raw_pedido_documento.data->>'obs'` (batch por odooId) | Não | `texto` |
| Obs Entrega | `raw_pedido_documento.data->>'obs_produtos'` (mesmo batch) | Não | `texto` |

Todas as fontes já são tabelas/joins que a query hoje toca (fato_pedido,
fato_pedido_item, fato_produto, fato_parceiro) mais **um** batch novo em
`raw_pedido_documento` (padrão idêntico ao `raw_pedido_etapa` da Fase 2).

## 3. Decisões desta fase

- **D-F3-1 (arquitetura):** sem migration, sem rebuild. Tudo query + UI. O único
  fetch novo é `rawPedidoDocumento.findMany({ where: { odooId: {in ids}, rawDeleted:
  false }, select: { odooId, data } })`, para `obs` e `obs_produtos`. Segue a
  regra durável (corte = filtro, nunca faxina) e o padrão da Fase 2.
- **D-F3-2 (Unitário):** derivar `unitario = valorCheio / quantidade` quando
  `quantidade > 0`, senão `0`. Helper puro testável. **Risco assumido:** se o
  item tiver desconto, `vr_produtos` pode ser líquido e o unitário derivado é o
  "efetivo", não o `vr_unitario` bruto do Odoo. A perícia (§6) confere contra 3
  linhas reais do cache (`raw_sped_documento_item.data->>'vr_unitario'`); se
  divergir de forma material, troca-se para batch raw de `vr_unitario`.
- **D-F3-3 (Valor cheio):** `= fatoPedidoItem.vrProdutos`, o total da linha
  (qtd x unitário, sem o desconto do a-atender). Distinto das colunas já
  existentes "A atender (venda)" e "A atender (custo)", que são o SALDO. Rótulos
  claros para não confundir o dono.
- **D-F3-4 (Obs Entrega , fonte ambígua):** o Odoo desta Tauga não tem campo
  dedicado "obs de entrega". Melhor candidato é `obs_produtos` do pedido; o
  alternativo (obs do endereço de entrega) vem quase sempre vazio. Adotar
  `obs_produtos` na v1, com `// TODO(dono): confirmar fonte de "Obs Entrega"` no
  código e **flag explícita no resumo ao dono**. NÃO trava a fase (dado quase
  sempre vazio; a coluna nasce oculta).
- **D-F3-5 (Contrato/Validade):** usar `fatoPedido.dataValidade` (campo
  `data_validade` do cabeçalho), rótulo "Contrato" como no oficial. Flag leve
  para o dono confirmar a semântica (há também `data_ultima_parcela_contrato_a_faturar`
  no raw, não materializado).
- **D-F3-6 (UX , 28 colunas):** com 16 atuais + 12 novas = 28, mostrar todas de
  uma vez é inusável. Adicionar à `ColumnDef` a flag **aditiva** `ocultaInicial?:
  boolean` (booleano, RSC-safe). As **16 atuais permanecem visíveis** (zero
  regressão); as **12 novas nascem ocultas**, a um clique no seletor. Sem essa
  flag, toda coluna segue visível (as 7 outras telas não mudam).
- **D-F3-7 (seletor usável p/ 28 itens):** o seletor de colunas ganha **busca** +
  **"Marcar todas / Limpar"**. Além disso, **busca global e filtro-por-coluna
  passam a operar só nas colunas VISÍVEIS** (hoje varrem todas): com colunas
  ocultas isso evita "busquei um CNPJ e a tabela filtrou por uma coluna que não
  estou vendo". Nas outras telas (sem ocultas) o efeito é nulo. Alinha com a
  intenção já registrada na Fase 2 ("busca só nas colunas visíveis").
- **D-F3-8 (datas, off-by-one):** as datas do Odoo (`Date`) são meia-noite; para
  o ISO `YYYY-MM-DD` usar componentes **UTC** (`getUTCFullYear/Month/Date`),
  nunca `toISOString` sobre datetime local, para não voltar um dia. Nulo -> `DASH`
  (o `formatarDataBR` devolve intacto valores não-ISO, então `DASH` fica "-").

## 4. Não-regressão (invariantes a preservar)

1. A reconciliação KPI-custo == soma das linhas (função `aAtenderDoItem`) **não
   pode mudar**. As colunas novas são aditivas ao shape; nenhuma toca o cálculo
   de a-atender nem os indicadores.
2. `ocultaInicial` ausente => coluna visível. As 7 telas que reusam o `DataTable`
   (Relatórios 1.0/2.0 etc) não declaram a flag => idênticas.
3. A UF continua vindo de `siglaDeUf`, o status de bloqueio da mesma query, a cor
   da etapa do mesmo batch. Nada disso é tocado.
4. O corte: demanda segue a pílula de período (D8/RF-A5). Campos novos com data
   (Prevista/Validade) são apenas exibidos; **não** entram em nenhum filtro de
   janela (só a `dataOrcamento` já recorta, como hoje).

## 5. Tasks (TDD onde há lógica pura; UI inline)

Ordem sequencial. Cada task fecha com tsc verde antes da próxima.

- **T1 , helpers puros (TDD):** em `entregas-parciais.ts` (ou um `_helpers` local):
  - `isoDataUTC(d: Date | null | undefined): string | null` , componentes UTC.
  - `precoUnitarioItem(valorCheio: number, quantidade: number): number` ,
    `quantidade > 0 ? valorCheio / quantidade : 0`.
  - `extrairObsPedido(data: unknown): { obs: string | null; obsEntrega: string | null }`
    , lê `obs` e `obs_produtos`, normaliza `false`/""/não-string para `null`.
  Testes unitários dos três (incl. off-by-one de data, quantidade 0, `false` do
  Odoo).

- **T2 , query: expandir fato_pedido:** adicionar `dataOrcamento` (já lá),
  `dataPrevista`, `dataValidade`, `empresaNome`, `vendedorNome` ao `select`.
  Expor no shape `LinhaEntregaParcial`: `orcamento`, `prevista`, `validade`
  (string ISO | null via `isoDataUTC`), `emitente`, `vendedor` (string | null).

- **T3 , query: parceiro (CNPJ/CEP) e produto (código):** adicionar `documento`,
  `cep` ao select de `fatoParceiro`; montar Map por participanteId. Adicionar
  `codigo` ao select de `fatoProduto`; Map por produtoId. Expor no shape:
  `cnpj`, `cep`, `codigoProduto` (string | null). Atualizar o mock de teste
  (`makePrisma`) para os campos novos SEM quebrar o ramo `documentoDigits` de
  `carregarParticipantesGrupo`.

- **T4 , query: item (unitário/valor cheio):** expor no shape `valorCheio`
  (= `it.vrProdutos`) e `unitario` (= `precoUnitarioItem(vrProdutos, quantidade)`).

- **T5 , query: observações (batch raw):** um `rawPedidoDocumento.findMany` pelos
  `ids` (rawDeleted:false), Map odooId -> `extrairObsPedido(data)`. Expor no
  shape `observacoes`, `obsEntrega` (string | null). Guarda: se `ids` vazio, não
  dispara a query (padrão do batch de etapa).

- **T6 , DataTable (aditivos, inline):** em `data-table.tsx`:
  - `ColumnDef.ocultaInicial?: boolean` (doc no tipo).
  - `useState(visiveis)` inicial = `!c.ocultaInicial`.
  - `filterRows(...)` e `colunasFiltráveis`/`valoresPorColuna` passam a usar as
    colunas **visíveis** (não todas).
  - Seletor de colunas: input de busca (filtra por `c.header`), botões "Marcar
    todas"/"Limpar" (respeitando a trava de >=1 visível). Design system: reusar
    `Input`, `Button`, ícone `Search` (Lucide), tokens semânticos. Dark/light.

- **T7 , B-09 (inline):** em `blocos-pedidos.tsx` `TabelaEntregasParciais`:
  mapear as 12 novas no objeto de linha (datas -> ISO|DASH; texto -> valor|DASH;
  moeda -> número) e acrescentar as 12 `ColumnDef` com `ocultaInicial: true`.
  Rótulos: "Orçamento", "Prevista", "Contrato", "Emitente", "CNPJ", "CEP",
  "Código", "Unitário", "Valor cheio", "Observações", "Obs entrega", "Vendedor".
  Posição: inserir as novas após as afins (ex.: datas perto de Pedido; CNPJ/CEP
  perto de Cliente; Código/Unitário/Valor cheio perto de Produto/Qtd; Vendedor
  ao fim). `// TODO(dono)` na Obs entrega (D-F3-4) e no Contrato (D-F3-5).

- **T8 , verificação:** `npx tsc` (raiz), `npm test` (suíte + novos testes),
  `eslint` nos arquivos tocados. Rebuild não se aplica (nada de worker/mcp).

## 6. Perícia inline (obrigatória, após T8)

Hipóteses a caçar no CÓDIGO e no DADO real (cache `nexus_odoo_l1`):
1. **Unitário derivado x `vr_unitario` real:** rodar SELECT em
   `raw_sped_documento_item` para 3-5 itens do B-09 e comparar `vr_produtos/quantidade`
   com `vr_unitario`. Se divergir material (desconto), aplicar D-F3-2 fallback.
2. **Datas sem off-by-one:** conferir `orcamento` de um pedido conhecido contra o
   `data_orcamento` do raw (mesmo dia).
3. **CNPJ/CEP corretos:** o Map usa `participanteId` (sped.participante), a fonte
   certa (perícia 2026-07-12 puniu quem cruzou por res.partner). Conferir 2
   clientes reais.
4. **Não-regressão:** as 7 outras telas do `DataTable` seguem com todas as
   colunas visíveis (grep por consumidores; nenhuma declara `ocultaInicial`).
5. **Shape/KPIs intactos:** os 4 indicadores e a contagem de linhas não mudaram
   (testes existentes seguem verdes sem edição de expectativa de valor).
6. **Obs quase sempre vazia:** confirmar que a coluna nasce oculta e que `false`
   do Odoo vira `DASH`, não "false".

## 7. Fora do escopo (vai para as fases seguintes)

- Filtro E/OU aninhado + busca inteligente por facets = Fase 4.
- Agrupamento multinível com subtotais (incl. por Vendedor/Emitente) = Fase 5.
- Reordenar/redimensionar colunas por arraste + persistir a escolha = Fase 6.
- Views (kanban/calendário/pivô) + salvar visão = Fase 7.
- Materializar `vr_unitario`/`obs` no fato (só se a perícia exigir fidelidade que
  a derivação/batch não dê).
