## Módulo 5 , Demandas
> Telas: 16, 17, 18. Prioridade de entrega: por último (escopo a refinar, cliente vai revisar).

> **Aviso de maturidade (ler antes de planejar).** Este foi o módulo **menos detalhado** na
> reunião de escopo (2026-07-20). O próprio dono declarou, ao apresentá-lo, que "vou refazer
> com calma", e ele aparece em **último** na ordem de prioridade que ele mesmo ditou no fim da
> reunião (1 Estoque, 2 Conferência, 3 Vendas, 4 Ciclos, 5 Financeiro, 6 Demandas). Portanto:
> este documento **congela o que já existe hoje** (a tela `diretoria/pedidos/page.tsx` já
> entrega boa parte disto) e **descreve o alvo dos protótipos 16/17/18**, mas todo requisito
> marcado `COULD` ou com a etiqueta **[A REFINAR]** depende de uma segunda passada de escopo
> com o cliente antes de virar plano de execução. Não tratar `COULD`/`[A REFINAR]` como
> contrato fechado. Ver seção 5.12.

> **Reaproveitamento é a regra aqui.** Diferente dos módulos novos, o Demandas é uma
> **evolução** de uma tela que já roda em produção. A maioria das consultas já existe
> (`queryIndicadoresDemandas`, `queryDemandasPendentes`, `queryDemandasPorUf`,
> `queryEntregasParciais`, `queryEstoqueDisponivel`, `queryDemandaPorProduto`,
> `queryPedidoSituacao`). Cada bloco abaixo marca explicitamente **[REUSO]** (a consulta já
> serve, no máximo um campo a mais) ou **[NOVO]** (métrica/bloco que não existe). Quem
> executar deve começar por ler o arquivo citado, nunca reescrever do zero.

---

### 5.1 Objetivo e usuário

O Módulo Demandas responde uma pergunta operacional única: **o que a empresa vendeu e ainda
não entregou, quanto disso está atrasado, e se há estoque para cobrir**. Não é um painel de
vendas (isso é o Módulo Comercial) nem de estoque parado (isso é o Módulo Estoque): o recorte
é o **pedido em carteira / ativo ainda não entregue**, do primeiro pedido em aberto até hoje.

- **Usuário primário:** diretoria e gestão de operações/logística. Quer saber onde estão os
  gargalos de entrega (qual cliente, qual UF, qual produto), quanto de receita está travada em
  pedido não entregue e quanto disso já venceu o prazo prometido.
- **Usuário secundário:** comercial e compras. O bloco "Máquinas em estoque × demanda" e a
  "concentração de atrasos por produto" alimentam decisão de compra e de priorização de
  produção/remessa.
- **Perguntas que a tela precisa responder de relance:**
  1. Quanto vale o que ainda tenho para entregar? (`valor pendente`)
  2. Quantos pedidos estão abertos e quantos já atrasaram? (`pedidos abertos`, `pedidos atrasados`)
  3. Quantas unidades faltam sair e quanto disso já tem estoque reservado/coberto? (`itens
     pendentes`, `demandas cobertas %`, `valor descoberto`)
  4. Qual produto concentra os atrasos e quanto isso representa em dinheiro? (bloco B9)
  5. Onde (UF) e para quem (cliente) está a demanda? (mapa B4, lista B2)

- **Recorte de dado (não negociável):** só entram pedidos em **demanda em aberta**
  (`fato_pedido.bucket_demanda = 'ABERTA'`), definição na seção 5.2. Pedido já entregue,
  faturado, concluído ou cancelado **não** aparece neste módulo.

- **RBAC:** módulo de diretoria. Capability `diretoria.comercial.view` (ou a área que o
  catálogo de componentes já usa para os blocos de pedido; conferir `catalogo` de componentes,
  onde `G-03 Mapa de demandas por estado` já está registrado no domínio `G`). Segue o padrão
  transversal da seção 7.7 da Parte I. Sem capability, o item de menu não aparece.

---

### 5.2 Definição de demanda em aberto (whitelist de etapas)

Esta é a regra **central** do módulo. Errar aqui contamina todos os oito blocos.

**Fonte única do bucket:** a coluna materializada `fato_pedido.bucket_demanda` (valores
`ABERTA` / `FECHADA` / `null`). Ela é calculada pelo builder do worker
(`src/worker/fatos/fato-pedido-classificacao.ts`), não em tempo de leitura. Toda consulta
deste módulo filtra por `bucket_demanda = 'ABERTA'` e **nunca** reimplementa a classificação.

**Como o bucket é decidido (ordem exata do builder):**

1. **Whitelist autoritativa de etapas.** A constante
   `ETAPAS_DEMANDA_ABERTA` (arquivo `src/lib/fiscal/regras/etapas-demanda-aberta.ts`,
   reexportada por `src/lib/fiscal/regras/index.ts`) é um `ReadonlySet<number>` com **27 IDs de
   etapa** curados a dedo pelo dono, reproduzindo o `pd.etapa_id IN (...)` do relatório oficial
   de Entregas Parciais do Odoo (relatório ID 28). Conteúdo atual (27 itens):

   ```ts
   export const ETAPAS_DEMANDA_ABERTA: ReadonlySet<number> = new Set<number>([
     130, 94, 95, 5, 132, 86, 133, 4, 129, 124, 120, 171, 121, 103, 87, 167,
     202, 203, 204, 205, 179, 180, 185, 186, 187, 183, 226,
   ]);
   ```

   No builder (`fato-pedido-classificacao.ts`): `if (input.etapaId != null &&
   ETAPAS_DEMANDA_ABERTA.has(input.etapaId)) return "ABERTA";`. **Pertencer ao conjunto VENCE**
   os gatilhos dinâmicos da etapa.

2. **Gatilhos dinâmicos (papel secundário).** A função pura
   `classificaEtapaDemanda(gatilhos)` em `src/lib/fiscal/regras/classifica-etapa-demanda.ts`
   ainda existe e classifica o **estágio** da etapa (`ABERTA` / `FECHADA` / `IGNORAR`) pelos
   gatilhos `finalizaFaturamento`, `finalizaPedidoConfirmando`, `finalizaPedidoCancelando`
   (ordem: cancelamento > conclusão/emissão > fallback ABERTA). **Atenção:** desde a Fase 1A
   esta função **não é mais a fonte do bucket**; quem manda é a whitelist. Ela continua útil
   como leitura de estágio e para a coluna `pendencia_etapa`. A exceção antiga por nome ("Nota
   emitida e não entregue") **saiu**: a etapa 226 é mantida na demanda pela whitelist, não por
   nome.

3. **Cruzamento com operação e aprovação** (no builder, não neste módulo): só operações de
   **venda ao cliente** entram, e o gate de aprovação (`data_aprovacao`) é aplicado lá. O
   módulo Demandas confia no `bucket_demanda` já materializado.

**Exceção de janela (seção 6.1 da Parte I) , OBRIGATÓRIA neste módulo:**

A métrica "demanda a entregar" **NÃO** é recortada pelo corte de dados de leitura
(`AppSetting sync.corte_dados`). Um pedido feito em 2025 e ainda não entregue precisa aparecer
hoje. Portanto:

- Toda consulta de demanda usa `janelaDemandaAberta(periodoDe, periodoAte)` de
  `src/lib/corte-dados.ts`, **não** `janelaClampada`. O piso é `PISO_DEMANDA_ABERTA =
  "2000-01-01"` (na prática, o primeiro pedido; "abre tudo").
- A janela vem **só da pílula de período** do topo. Sem período informado, a janela é "Tudo"
  (piso 2000 até o futuro). Com período, recorta pela pílula, mas **nunca** grampeia no corte.
- O campo de data usado para posicionar o pedido na janela é `fato_pedido.data_orcamento`
  (documento com data). Pedido sem `data_orcamento` fica **de fora** (não há data que prove a
  que janela ele pertence).
- Esta exceção vale para os módulos Estoque (demanda), Ciclos (demanda) **e** Demandas. As
  **outras** métricas do sistema seguem `janelaClampada` (piso no corte); só a demanda a
  entregar não.

> **Invariante de paridade (não quebrar):** o card "Demandas a entregar" da diretoria e o
> Relatório de Entregas Parciais somam **exatamente o mesmo número** no mesmo período e mesma
> empresa, porque os dois usam a mesma peça `aAtenderDoItem`
> (`src/lib/diretoria/atendimento-item.ts`). Se divergirem no mesmo escopo, é bug. Ver RN-5.6.

> **Pendência herdada (D7 / P1):** ao adotar os 27 IDs, **peças** e **venda a consumidor
> final** saíram da demanda (some o comprometido dessas famílias na necessidade de compra). O
> dono autorizou remover "por ora" mas **exige a decisão final**. Enquanto não decide, o
> módulo herda esse recorte. Ver `etapas-demanda-aberta.ts` (TODO do dono) e a pesquisa mestre
> 2026-07-20. Rastreado em DEP-5.7 / seção 5.12.

---

### 5.3 Pré-requisitos de dado (tabelas, campos, gaps)

Fontes canônicas (detalhe na seção 5 da Parte I). Campos citados são do schema Prisma
(`prisma/schema.prisma`), com o nome de coluna do banco entre parênteses.

**DEP-5.1 , `FatoPedido` (`fato_pedido`) , cabeçalho do pedido. [existe]**
Campos usados por este módulo:
- `odooId` (PK), `numero`, `tipo`, `etapaId` / `etapaNome`, `operacaoId` / `operacaoNome`.
- `modalidadeFrete` (`modalidade_frete`) , código NF-e modFrete; rótulo via
  `src/lib/diretoria/modalidade-frete.ts`.
- `participanteId` / `participanteNome`, `vendedorId` / `vendedorNome`, `empresaId` /
  `empresaNome`.
- Datas: `dataOrcamento` (janela da demanda), `dataAprovacao`, `dataValidade`, `dataPrevista`
  (**prazo de entrega**, base do "atrasado").
- Valores: `vrProdutos` (valor cheio de produtos), `vrNf`.
- Colunas derivadas (materializadas pelo builder): `categoriaOperacao` (`categoria_operacao`),
  **`bucketDemanda`** (`bucket_demanda`, indexado), `pendenciaEtapa` (`pendencia_etapa`).
- Índices já existentes relevantes: `@@index([dataOrcamento])`, `@@index([etapaId])`,
  `@@index([bucketDemanda])`, `@@index([categoriaOperacao])`.

**DEP-5.2 , `FatoPedidoItem` (`fato_pedido_item`) , linhas de produto do pedido. [existe]**
- `odooId` (PK), `pedidoId` (`pedido_id`, indexado), `produtoId` / `produtoNome`,
  `familiaNome`, `marcaNome`.
- `quantidade` (Decimal 18,4 , quantidade cheia da linha).
- `cfopId`, `localReservaId` (`local_reserva_id`) , **base candidata da coluna "reserva"** do
  B2 (ver DEP-5.6, é gap de definição, não de dado).
- `vrProdutos` (valor de venda da linha), `vrCusto`.
- `quantidadeAAtender` (`quantidade_a_atender`, **nullable**) e `quantidadeAtendida`
  (`quantidade_atendida`, **nullable**) , campos COMPUTADOS do Odoo, mantidos pelo job de
  atendimento (`src/worker/sync/atendimento.ts`). **Nulo de propósito** enquanto o job não
  rodou (nulo = "ainda não sei"; zero significaria "nada a entregar"). Ver DEP-5.5.
- Índices: `@@index([pedidoId])`, `@@index([produtoId])`.

**DEP-5.3 , `FatoEstoqueSaldo` (`fato_estoque_saldo`) , saldo de estoque por produto/local.
[existe]**
- `produtoId` / `produtoNome`, `localId` / `localNome`, `quantidade` (Decimal 18,4),
  `vrSaldo`, `familiaId` / `familiaNome`, `marcaId` / `marcaNome`.
- Usado no lado do SALDO de B7 (máquinas em estoque) e no cálculo de cobertura (`demandas
  cobertas %`, `valor descoberto`). Regra do saldo: **só `quantidade > 0`** (linha negativa é
  furo de inventário e não vira "disponível"), e só o **estoque físico da casa** (escopo
  `fisico` via `whereLocalDoEscopo`), como já faz `queryEstoqueDisponivel`.

**DEP-5.4 , `FatoParceiro` (`fato_parceiro`) , cliente e UF. [existe]**
- `uf` (indexado) , base do mapa B4 e da coluna UF do B2, normalizada por `siglaDeUf`
  (`src/lib/diretoria/uf.ts`). `nome`, `cidade`.
- **Gap conhecido:** parte dos pedidos não resolve UF do cliente (participante sem UF). Isso
  gera o balde **"Sem UF"** já tratado nos KPIs de diretoria (ver `docs/kpis-diretoria.md`). O
  mapa não deve somar "Sem UF" a nenhum estado; é uma linha à parte.

**DEP-5.5 , Job de atendimento (frescor do "a atender"). [existe, condicional]**
- Fonte da verdade de "quanto falta entregar por linha". Estado lido por
  `atendimentoSincronizado(prisma)` (`src/lib/diretoria/atendimento-status.ts`), que devolve
  `{ ok, em }`. Quando `ok=false` (job nunca rodou ou está velho), **toda** métrica de "a
  entregar" cai na **quantidade cheia** com aviso na UI ("valores provisórios"). Regra
  encapsulada em `aAtenderDoItem` (piso em zero; o Odoo devolve negativo quando entregou a
  mais). **Nenhuma consulta deste módulo pode ignorar esse flag.**

**DEP-5.6 , Coluna "reserva" do B2. [GAP DE DEFINIÇÃO , A REFINAR]**
O protótipo 16 mostra uma coluna **RESERVA** com um checkbox por linha. Não há, hoje, um
conceito fechado de "reserva" no cache. Candidatos:
- (a) `FatoPedidoItem.localReservaId` preenchido = item tem local de reserva definido no Odoo;
- (b) existência de saldo de estoque reservado para aquele produto;
- (c) um flag operacional que o cliente ainda vai definir.
Marcado como **pendência de escopo** (o cliente vai refinar). Até lá, a coluna pode ser
renderizada como "indefinida" ou omitida. Ver seção 5.12 / RN-5.9.

**DEP-5.7 , Whitelist de etapas (peças / consumidor final). [decisão pendente do dono]**
Ver seção 5.2 (D7 / P1). Não bloqueia a tela; muda **o conjunto** de pedidos considerados
demanda quando o dono decidir. Qualquer número deste módulo se move se a whitelist mudar.

**DEP-5.8 , Atributo "linha" e "tipo" do produto. [GAP , camada base B1/B4 da Parte I]**
Os protótipos de outros módulos falam de agrupar por **linha** (Magnum/Ultra/Versa/Aura) e
**tipo** (seletorizada/peso livre/cardio/acessório). Hoje o cadastro só tem **marca** e
**família**. O B7 (máquinas em estoque) e o B8 (itens ativos) do protótipo já exibem
subtítulos tipo "ACESSÓRIOS · BODY JOY" (família · marca), então **não dependem** de linha
para a v1. Se o cliente pedir recorte por linha/tipo aqui, isso reusa o gap já resolvido na
camada base (seção 8 da Parte I), não é trabalho deste módulo.

---

### 5.4 Requisitos funcionais [MoSCoW]

Prioridade conforme seção 2.2 da Parte I (MUST / SHOULD / COULD / WON'T). Como o módulo é o
último e "a refinar", o núcleo já entregue hoje é `MUST`; o que é novidade dos protótipos é
majoritariamente `SHOULD`/`COULD`.

| ID | Requisito | Prioridade |
|---|---|---|
| RF-5.1 | Exibir o **resumo** (8 cards): valor pendente, pedidos abertos, pedidos atrasados, itens pendentes, ticket médio, demandas cobertas %, valor descoberto, valor atrasado. | MUST |
| RF-5.2 | Listar **pedidos pendentes** em tabela, **uma linha por unidade de item**, agrupada por pedido (rótulo "unidade X de Y"), com cliente, modelo, UF, prazo, status, reserva e valor pendente. | MUST |
| RF-5.3 | Filtros da lista B2: **Abertos / Atrasados / Todos** + busca livre por cliente, modelo, UF ou status. | MUST |
| RF-5.4 | Bloco **Máquinas em estoque × demanda** (B7): por modelo, disponível, demanda e % em demanda, com busca. | MUST |
| RF-5.5 | **Drill do pedido selecionado** (B5): clicar numa linha do B2 abre os indicadores detalhados do pedido (trilha de etapas, itens, saldo de estoque, pendência). Estado vazio quando nada selecionado. | SHOULD |
| RF-5.6 | **Visão geral** (B6): valor total em pedidos ativos, quantidade de pedidos ativos, valor médio, "quando mais caro" (maior pedido) e rosca **atrasados × no prazo × sem prazo** (três baldes disjuntos, ver 5.6.5). | SHOULD |
| RF-5.7 | **Mapa de demandas por estado** (B4): heatmap do Brasil, colorido pela intensidade da demanda por UF, **clicável para filtrar** o módulo por estado. | SHOULD |
| RF-5.8 | **Itens vendidos em pedidos ativos** (B8): por modelo, split entregues × a entregar × atrasados, gráfico de quantidade vendida (barras, top N), com card de indicadores do modelo selecionado e toggle de período. | SHOULD |
| RF-5.9 | **Concentração de atrasos por produto** (B9): ranking dos produtos com mais itens atrasados (barras + valor + % dos atrasos) e cards agregados (total de itens atrasados, valor total atrasado, produto com mais atraso, Top 3 concentra %). | SHOULD |
| RF-5.10 | Todas as métricas respeitam a **pílula de período** (janela da demanda, não o corte) e o **filtro de empresa**. **Exceção:** cobertura % (M-5.6) e valor descoberto (M-5.7) usam saldo físico que **não é escopável por empresa/UF**; sob filtro de empresa/UF ficam travados ao grupo ou avisam (RN-5.8). | MUST |
| RF-5.11 | Selecionar um modelo no B8 recorta os indicadores do modelo; "Limpar seleção" volta ao agregado ("Todos os modelos"). | COULD |
| RF-5.12 | Selecionar um estado no B4 filtra **B2/B6/B8/B9** (blocos demand-side) por aquela UF; **B7 não é afetado** (saldo físico não é escopável por UF, RN-5.8), assim como B4 (o próprio mapa) e B5 (drill de um pedido). Lista canônica dos blocos afetados: seção 5.9. Clicar de novo limpa. | COULD |
| RF-5.13 | Coluna/flag **Reserva** com semântica fechada de negócio. | COULD (bloqueado por DEP-5.6) |
| RF-5.14 | Recorte por **linha** / **tipo** de produto neste módulo. | WON'T (v1) , depende da camada base B1/B4 |
| RF-5.15 | Aviso de **frescor** ("atualizado há Xs") e de **valores provisórios** quando o job de atendimento não rodou. | MUST |

---

### 5.5 Métricas e fórmulas

Convenções: `Σ` = soma sobre o universo filtrado (bucket ABERTA + janela da demanda + empresa
+ UF opcional). `aAtender(linha)` = `aAtenderDoItem(...)` (piso 0; cheia quando job off).
Todos os valores monetários em BRL, 2 casas.

**M-5.1 , Valor pendente.**
Valor de venda do que ainda falta entregar, somado sobre todas as linhas de item dos pedidos
abertos:
```
valorPendente = Σ_linha ( aAtender(linha) × precoUnitVenda(linha) )
precoUnitVenda(linha) = linha.vrProdutos / linha.quantidade   (0 se quantidade = 0)
```
O card VALOR PENDENTE usa o `aAtenderVenda` de `IndicadoresEntregasParciais`
(`queryEntregasParciais`) no mesmo escopo , **é venda**. **Não** usar o `valorAEntregar` de
`queryIndicadoresDemandas`, que soma **a custo** e serve só à paridade interna (RN-5.6), não ao
card. Card mostra o total. (Ver RN-5.4 para a base venda/custo por card.)

**M-5.2 , Pedidos abertos.**
`pedidosAbertos = COUNT(DISTINCT pedidoId)` no universo (bucket ABERTA + janela + empresa/UF).
No protótipo: 42.

**M-5.3 , Pedidos atrasados.**
`pedidosAtrasados = COUNT(DISTINCT pedidoId WHERE dataPrevista != null AND dataPrevista <
hoje)`. "Atrasado" = **prazo de entrega (`data_prevista`) já venceu**. Pedido sem
`data_prevista` **não** conta como atrasado (é "sem prazo"). No protótipo: 41.

**M-5.4 , Itens pendentes.**
`itensPendentes = Σ_linha aAtender(linha)` (unidades, não linhas). No protótipo: 105.

**M-5.5 , Ticket médio.**
`ticketMedio = valorPendente / pedidosAbertos` (guardar divisão por zero → 0). Confere no
protótipo: 2.148.900,00 / 42 = 51.164,29.

**M-5.6 , Demandas cobertas (%).**
Fração das unidades pendentes que **têm estoque disponível** para cobrir. Cruza demanda ×
saldo por produto (mesma lógica de `queryEstoqueDisponivel`):
```
Para cada produto p:
  demanda(p)      = Σ aAtender das linhas de p          (unidades pendentes)
  disponivel(p)   = saldoFisicoPositivo(p) − demanda(p) (pode ser negativo)
  cobertas(p)     = min(demanda(p), max(0, saldoFisicoPositivo(p)))
demandasCobertas% = Σ_p cobertas(p) / Σ_p demanda(p)
```
No protótipo: "22,9% , 24 de 105 unidades pendentes cobertas". **[A REFINAR]** confirmar com o
cliente se cobertura é "há saldo hoje" (o cálculo acima) ou "há reserva vinculada" (depende de
DEP-5.6).

> **Escopo do saldo (assunção A-5.6, validar contra o cache):** `fato_estoque_saldo` **não tem
> `empresaId`** , o saldo é físico da casa inteira (grupo). Logo a cobertura só é **íntegra no
> nível GRUPO**. Com filtro de empresa/UF ativo, a **demanda** encolhe para o CNPJ/UF mas o
> **saldo** continua o do grupo inteiro, o que **infla** a cobertura (estoque do grupo "cobre" a
> demanda de um CNPJ). Regra: quando houver filtro de empresa ou UF, **travar cobertura % e
> valor descoberto ao escopo global** (calcular sempre no grupo) **ou** exibir aviso de que
> "saldo não é escopável por empresa/UF" e a cobertura é do grupo. Ver RN-5.8. **Passo de
> validação:** confirmar no schema/`SELECT` que `fato_estoque_saldo` não tem coluna de empresa
> antes de implementar; se passar a ter, esta restrição cai.

**M-5.7 , Valor descoberto.**
Valor de venda das unidades pendentes **sem** cobertura de estoque:
```
descobertas(p)  = max(0, demanda(p) − max(0, saldoFisicoPositivo(p)))
valorDescoberto = Σ_p ( descobertas(p) × precoUnitVendaMedio(p) )
```
No protótipo: R$ 1.502.800,00 , "81 unidades sem cobertura confirmada" (105 − 24 = 81).
Mesma restrição de escopo da M-5.6 (assunção A-5.6): como o saldo não é escopável por
empresa/UF, o valor descoberto só é íntegro no nível GRUPO; com filtro de empresa/UF, travar ao
escopo global ou avisar (ver RN-5.8).

**M-5.8 , Valor atrasado.**
Valor pendente dos pedidos com prazo vencido:
```
valorAtrasado = Σ_linha∈pedidosAtrasados ( aAtender(linha) × precoUnitVenda(linha) )
```
No protótipo: R$ 2.135.300,00 , "41 pedidos com prazo vencido". (Note que casa com o total do
B9 "103 itens atrasados · R$ 2.135.300,00": a mesma base, um agregada por valor, a outra por
produto.)

**M-5.9 , % em demanda (por modelo, B7).**
`percEmDemanda(p) = demanda(p) / (saldoFisicoPositivo(p) + demanda(p))` **[A REFINAR]** , o
denominador pode ser `disponível + demanda` ou só `saldo`. Definição do denominador vai com o
cliente. No protótipo, todos os modelos aparecem com 0% porque o mock está com demanda = 0 em
todos (dado sintético; ver RN-5.10).

**M-5.10 , Split do modelo (B8): entregues × a entregar no prazo × atrasados. [A REFINAR]**
Por modelo `p`, sobre os itens em pedidos ativos, em **três baldes DISJUNTOS** (não se
sobrepõem), para que os percentuais somem 100%:
```
aEntregar(p)      = Σ aAtender das linhas de p              (total ainda pendente)
entregues(p)      = Σ quantidadeAtendida das linhas de p    (unidades já saídas)
atrasados(p)      = Σ aAtender das linhas de p em pedidos com data_prevista < hoje
aEntregarPrazo(p) = aEntregar(p) − atrasados(p)             ("a entregar no prazo", disjunto)
```
Os três baldes exibidos são `entregues`, `aEntregarPrazo` e `atrasados`. **Atenção:**
`atrasados` **não** é subconjunto do balde "a entregar" mostrado; o que aparece como "a
entregar" é o `aEntregarPrazo` (a entregar menos atrasados). O denominador dos percentuais é
fixo em `entregues + aEntregar` (o "total" do modelo naquele recorte, que é igual a
`entregues + aEntregarPrazo + atrasados`). No protótipo agregado (B8 "Todos os modelos"):
entregues 0, a entregar no prazo 271 (72,5%), atrasados 103 (27,5%), base 374 (= 0 + 271 +
103). **Nota:** "entregues 0" no protótipo é artefato do mock (job de atendimento não
populado); em produção `quantidadeAtendida` traz o real. **[A REFINAR]:** este split é um ponto
do desenho que o cliente ainda vai revisar (ver seção 5.12).

**M-5.11 , Concentração de atrasos (B9).**
```
Para cada produto p com itens atrasados:
  itensAtrasados(p) = Σ aAtender das linhas de p em pedidos atrasados
  valorAtrasado(p)  = Σ ( aAtender × precoUnitVenda ) dessas linhas
  %dosAtrasos(p)    = valorAtrasado(p) / Σ_q valorAtrasado(q)
totalItensAtrasados = Σ_p itensAtrasados(p)                 (protótipo: 103)
valorTotalAtrasado  = Σ_p valorAtrasado(p)                  (protótipo: R$ 2.135.300,00)
produtoComMaisAtraso = argmax_p itensAtrasados(p)           (protótipo: Leg Press 45° Titanium)
top3Concentra%      = Σ top3 valorAtrasado(p) / valorTotalAtrasado   (protótipo: 60,2%)
```

**Regra de valoração transversal (seção 6.5 da Parte I):** os cards de resumo do protótipo
estão a **preço de venda** (o `valorPendente` de 2,14M bate com venda). O painel legado da
diretoria usa **custo** em alguns lugares. Ao consolidar, decidir por card e **rotular**
(venda/custo), como o Relatório de Entregas Parciais já faz. Ver RN-5.4.

---

### 5.6 Especificação da tela por bloco

Layout dos protótipos (16/17/18), de cima para baixo, duas colunas na maior parte:
- Faixa de topo: **Resumo das demandas** (8 cards).
- Linha: **B2 Lista de pedidos pendentes** (esquerda) | **B7 Máquinas em estoque** (direita).
- Linha: **B5 Indicadores do pedido selecionado** (esquerda) | **B4 Mapa por estado** (direita).
- **B6 Visão geral das demandas** (esquerda, ao lado do mapa em 18).
- **B8 Itens vendidos em pedidos ativos** (faixa larga).
- **B9 Concentração de atrasos por produto** (faixa larga).

Todos os blocos herdam os padrões de UI da seção 7 da Parte I (card de KPI 7.1, tabela 7.2,
rosca de status 7.4, estados 7.5, tema/acessibilidade 7.6). Cor primária violet `#7c3aed`;
tokens semânticos (`bg-card`, `text-muted-foreground`, `border-border`); ícones Lucide; zero
emoji.

#### 5.6.1 Resumo das demandas (cards)

Cabeçalho: título "RESUMO DAS DEMANDAS", subtítulo "Pedidos ativos, pendências, atrasos,
cobertura e valor descoberto", canto direito "N pedidos abertos no filtro".

Oito cards de KPI (padrão 7.1), em duas linhas de quatro:

| Card | Valor (fonte) | Legenda | Cor de destaque |
|---|---|---|---|
| VALOR PENDENTE | M-5.1 | "em pedidos ativos ainda não entregues" | neutro/branco |
| PEDIDOS ABERTOS | M-5.2 | "N abertos na base total" | azul |
| PEDIDOS ATRASADOS | M-5.3 | "Há prazos vencidos no filtro" | vermelho |
| ITENS PENDENTES | M-5.4 | "Unidades ainda não entregues" | azul claro |
| TICKET MÉDIO | M-5.5 | "Média por pedido aberto filtrado" | verde |
| DEMANDAS COBERTAS | M-5.6 (%) | "X de Y unidades pendentes cobertas" | verde/âmbar por faixa |
| VALOR DESCOBERTO | M-5.7 | "Z unidades sem cobertura confirmada" | vermelho |
| VALOR ATRASADO | M-5.8 | "N pedidos com prazo vencido" | vermelho |

Regras de UI:
- Cores por **semântica**, não hardcode: "atrasado"/"descoberto" em vermelho semântico;
  "ticket"/"cobertas" em positivo. Contraste AA nos dois temas.
- Card com valor 0 e universo vazio: mostrar 0 formatado, não travar (ver 5.10).
- Frescor: rodapé/badge do bloco mostra "atualizado há Xs" (última sync) e, se o job de
  atendimento estiver off, aviso "valores provisórios (quantidade cheia)".

[REUSO parcial] `queryIndicadoresDemandas` já entrega `totalPendentes` e `atrasadas`
(contagens) e `valorAEntregar` **a custo**. Atenção: os oito cards do resumo são **a venda**, e
o `valorAEntregar` a custo **não** alimenta o card VALOR PENDENTE , ele é insumo da paridade
interna a custo (RN-5.6), que é invariante interno, não card. O card VALOR PENDENTE (M-5.1) vem
do `aAtenderVenda` de `queryEntregasParciais`. [NOVO] itens pendentes (unidades), ticket médio,
demandas cobertas %, valor descoberto, valor atrasado. Consolidar numa consulta única (Q-5.1)
para os oito virem coesos.

#### 5.6.2 Lista de pedidos pendentes (B2)

Cabeçalho: "B2 , LISTA DE PEDIDOS PENDENTES", canto direito "N pedidos · M linhas unitárias ·
K em demandas". Busca: "Buscar cliente, modelo, UF ou status...". Abas: **ABERTOS |
ATRASADOS | TODOS**.

**Grão: uma linha por UNIDADE de item, agrupada por pedido.** No protótipo, "Cross Station
Funcional" de "Arena Fitness Fortaleza" aparece em 4 linhas: "UNIDADE 1 DE 4" ... "UNIDADE 4
DE 4", todas com mesmo cliente, UF, prazo e status. Ou seja, cada unidade **ainda pendente** de
uma linha de item vira uma linha visual. Isso é **evolução**: a consulta atual
`queryDemandasPendentes` devolve **uma linha por pedido**; `queryEntregasParciais` devolve
**uma linha por item** (com `qtdAAtender` agregada), mas nenhuma das duas explode por unidade.

Colunas:
- **CLIENTE** , `fato_parceiro.nome` (via `participanteId`).
- **MODELO** , `fato_pedido_item.produtoNome` + subtítulo "UNIDADE i DE n" (n = `aAtender` da
  linha, arredondado para inteiro; i = índice da unidade).
- **UF** , `siglaDeUf(fato_parceiro.uf)`; "Sem UF" quando nulo.
- **PRAZO** , `fato_pedido.dataPrevista` (dd/mm/aaaa); vazio quando sem prazo.
- **STATUS** , badge "ATRASADO" (vermelho) quando `dataPrevista < hoje`; "ABERTO" (neutro)
  caso contrário.
- **RESERVA** , checkbox. **[A REFINAR / DEP-5.6]** semântica pendente; até definir, renderizar
  desabilitado/indefinido.
- **VALOR PENDENTE** , valor de venda da **unidade** = `precoUnitVenda(linha)` (por unidade) ou
  o valor da linha rateado por unidade. No protótipo cada unidade de "Cross Station" = R$
  31.200,00.

Comportamento:
- **Abas** filtram o conjunto: ABERTOS (todas as unidades pendentes), ATRASADOS (só de pedidos
  com prazo vencido), TODOS (inclui as já entregues? , **[A REFINAR]**: como o universo é só
  bucket ABERTA, "TODOS" provavelmente = abertos + atrasados sem o filtro de aba; confirmar).
- **Busca** casa cliente, modelo, UF ou status, case-insensitive, substring.
- **Clique numa linha** seleciona o pedido e alimenta o B5 (drill). Linha selecionada com
  realce (borda violet).
- Ordenação default: por valor pendente desc (como `queryDemandasPendentes` já faz), com
  agrupamento visual por pedido preservado.
- Rodapé conta "N pedidos · M linhas unitárias" (M = Σ `aAtender` inteiro).

[REUSO base] `queryDemandasPendentes` (universo, UF, valor) + `queryEntregasParciais`
(grão-item, `qtdAAtender`, cor de etapa, status financeiro). [NOVO] explosão por unidade e a
coluna reserva. Ver Q-5.2.

#### 5.6.3 Máquinas em estoque × demanda (B7)

Cabeçalho: "B7 , MÁQUINAS EM ESTOQUE", canto direito "N modelos · M disponíveis · K em
demanda". Busca: "Buscar por letras ou números do modelo...".

Tabela por **modelo** (produto), ordenada por menor disponibilidade primeiro (quem precisa de
compra no topo, como `queryEstoqueDisponivel` já faz):
- **MODELO** , `produtoNome` + subtítulo "FAMÍLIA · MARCA" (ex.: "ACESSÓRIOS · BODY JOY").
- **DISPONÍVEL** , `disponivel = saldoFisicoPositivo − demanda` (verde quando ≥ 0; vermelho
  quando negativo = precisa comprar).
- **DEMANDA** , unidades pendentes do modelo (`demanda(p)`, Σ `aAtender`).
- **% EM DEMANDA** , M-5.9, com barra de progresso.

Regras:
- Lado do saldo: só `quantidade > 0` e só estoque **físico da casa** (escopo `fisico`), idêntico
  a `queryEstoqueDisponivel` (não contar demonstração/terceiros; senão fabrica "disponível"
  onde não há mercadoria).
- Lado da demanda: `janelaDemandaAberta` (segue a pílula, não o corte). O saldo é foto de hoje
  (sem data), então a janela **não** se aplica ao saldo.
- Busca por nome/código do produto (substring, case-insensitive).

[REUSO direto] `queryEstoqueDisponivel` já entrega `saldo`, `demanda`, `disponivel` por
produto. [NOVO] só o campo **% em demanda** (M-5.9) e o subtítulo família·marca. Ver Q-5.3.

#### 5.6.4 Indicadores do pedido selecionado (B5 , drill)

Cabeçalho: "B5 , INDICADORES DO PEDIDO SELECIONADO", canto direito "Selecione uma linha no
B2". **Estado vazio** (default): "Clique em um pedido na tabela B2 para visualizar os
indicadores detalhados do pedido." (padrão 7.5).

Ao selecionar um pedido no B2, exibir o detalhe do pedido:
- Cabeçalho do pedido: número (`fato_pedido.numero`), cliente, UF/cidade, etapa atual
  (`etapaNome` + cor da etapa), valor cheio e valor pendente, prazo (`dataPrevista`), status
  atrasado/no prazo, dias parado na etapa atual.
- **Trilha de etapas**: por onde o pedido passou e há quanto tempo está na etapa atual (dias
  parado), o que `queryPedidoSituacao` já devolve (`trilha`, `tempoEtapaDias`).
- **Itens do pedido**: por linha, produto, quantidade, valor de produtos, **saldo em estoque**
  do produto, **faltando** e `temEstoque` (também de `queryPedidoSituacao`).
- **Pendência**: o que falta para o pedido avançar, derivado dos gatilhos da etapa atual
  (`pendencia`, campo `pendenciaEtapa`).

[REUSO direto] `queryPedidoSituacao(prisma, { numero })` já entrega trilha, itens com
saldo/faltando, pendência e o caso `multiplosMercos`. Nenhuma consulta nova; só ligar o clique
do B2 ao número do pedido. Ver Q-5.4.

#### 5.6.5 Visão geral (B6 , atrasados × no prazo)

Cabeçalho: "B6 , VISÃO GERAL DAS DEMANDAS", canto direito "Brasil inteiro · N pedidos ativos"
(muda para "UF X · ..." quando o mapa filtra).

Quatro cards + uma rosca:
- **VALOR TOTAL EM PEDIDOS ATIVOS** , M-5.1 (ou valor cheio dos pedidos, **[A REFINAR]**: o
  protótipo mostra 2.148.900,00 = valor pendente; confirmar se é pendente ou cheio).
- **QUANTIDADE DE PEDIDOS ATIVOS** , M-5.2.
- **VALOR MÉDIO DOS PEDIDOS** , M-5.5 (ticket médio, verde).
- **QUANDO MAIS CARO** , maior pedido do universo, com valor + cliente + modelo (protótipo: R$
  124.800,00 · Arena Fitness Fortaleza · Cross Station Funcional). **[NOVO]** métrica "top 1
  pedido por valor".
- **Rosca de status** (padrão 7.4), **três baldes disjuntos** para não jogar "sem prazo" dentro
  de "no prazo": "Atrasados X% · n" (`data_prevista != null AND data_prevista < hoje`), "No
  prazo Y% · m" (`data_prevista != null AND data_prevista >= hoje`) e "Sem prazo Z% · k"
  (`data_prevista IS NULL`, nunca atrasado por RN-5.3). Centro mostra o % de atrasados. Base:
  pedidos ativos; os três baldes somam 100%. No protótipo: 97,6% atrasados · 41; no prazo 2,4%
  · 1; sem prazo 0 (o mock não tem pedido sem prazo). Se optar por rosca binária, "No prazo"
  **tem que** declarar na legenda que inclui os "sem prazo".

[REUSO parcial] `queryIndicadoresDemandas` dá `totalPendentes` / `valorAEntregar` /
`atrasadas` para a rosca e os cards de contagem. [NOVO] "quando mais caro" e "valor médio".
Consolidar em Q-5.5 (ou reaproveitar a Q-5.1 do resumo, que já calcula quase tudo).

#### 5.6.6 Mapa de demandas por estado (B4 , heatmap clicável)

Cabeçalho: "B4 , MAPA DE DEMANDAS POR ESTADO", canto direito "N estados com pendências ·
clique para filtrar".

- Mapa do Brasil (SVG por UF), cor por intensidade da demanda (heatmap): estado com mais
  demanda em vermelho forte, sem demanda em cinza/neutro. Escala relativa ao máximo do
  conjunto.
- Métrica de intensidade **[A REFINAR]**: valor pendente por UF (default) ou quantidade de
  pedidos por UF. O protótipo colore por intensidade; confirmar a métrica com o cliente.
- Tooltip por estado: UF, nº de pedidos, valor pendente.
- **Clicável**: clicar num estado filtra os blocos demand-side **B2/B6/B8/B9** por aquela UF
  (RF-5.12; lista canônica em 5.9); **B7 não muda** (saldo do grupo, não escopável por UF,
  RN-5.8) e B5 (drill) também não; clicar de novo limpa. Estado selecionado com contorno
  destacado.
- **"Sem UF"** não entra no mapa (não há estado); vira uma linha/legenda à parte, ou é omitido
  com nota. Nunca somado a um estado.

[REUSO direto] `queryDemandasPorUf(prisma, filtros)` já devolve `{ linhas: [{ uf, quantidade,
valorTotal }], valorGeral }`. Só ligar a renderização SVG e o clique. Componente `G-03 Mapa de
demandas por estado` já existe no catálogo (domínio G). Ver Q-5.6.

#### 5.6.7 Itens vendidos em pedidos ativos (B8) [A REFINAR]

Cabeçalho: "B8 , ITENS VENDIDOS EM PEDIDOS ATIVOS", toggle central "TODOS OS PERÍODOS", canto
direito "X unidades vendidas · Y modelos · <período> · top N de Y · selecionado: <modelo> ·
pedidos ativos".

Duas partes:
1. **Indicadores do modelo** (cards, padrão 7.1): título "<modelo> · <período>" ou "Todos os
   modelos · Todos os períodos"; botão "LIMPAR SELEÇÃO". Três cards:
   - ITENS ENTREGUES , M-5.10 `entregues`, com "X% do total · N pedidos".
   - ITENS A SEREM ENTREGUES , M-5.10 `aEntregarPrazo` (a entregar **menos** atrasados), com
     "X% do total · no prazo".
   - ITENS ATRASADOS , M-5.10 `atrasados`, com "X% do total · prazo vencido".

   Os três baldes são **disjuntos** e o percentual de cada um é sobre o denominador fixo
   `entregues + aEntregar` (ver M-5.10); somam 100%.
2. **Gráfico "QUANTIDADE VENDIDA"** (barras verticais), um por modelo, valor = unidades no
   recorte, ordenado desc, top N (protótipo: top 28 de 37). Barra do modelo **selecionado**
   destacada (contorno). Clicar numa barra seleciona o modelo e recorta os três cards acima
   (RF-5.11).

Toggle de período: "Todos os períodos" vs. a pílula do topo (**[A REFINAR]**: confirmar se o
toggle é independente da pílula global ou apenas a espelha; nome sugere um "abrir tudo" local).

[REUSO parcial] `queryDemandaPorProduto` já entrega `linhas: [{ produtoId, produtoNome,
familiaNome, quantidade (a atender), valorProdutos, valorCusto }]` ordenado por quantidade
desc , serve para o gráfico e o "a entregar". [A REFINAR] o split em três baldes disjuntos
(entregues × a entregar no prazo × atrasados) por modelo é desenho a revisar com o cliente:
precisa somar `quantidadeAtendida`, aplicar o recorte de pedido atrasado e derivar
`aEntregarPrazo = aEntregar − atrasados`. Ver Q-5.7 e M-5.10.

#### 5.6.8 Concentração de atrasos por produto (B9 , ranking + Top 3)

Cabeçalho: "CONCENTRAÇÃO DE ATRASOS POR PRODUTO", canto direito "N itens atrasados · R$
<valorTotalAtrasado>".

Duas colunas:
1. **Cards agregados** (esquerda):
   - TOTAL DE ITENS ATRASADOS , M-5.11 `totalItensAtrasados` + "K modelos com atraso"
     (protótipo: 103 · 8 modelos).
   - VALOR TOTAL ATRASADO , M-5.11 `valorTotalAtrasado` + "valor pendente vencido" (protótipo:
     R$ 2.135.300,00).
   - PRODUTO COM MAIS ATRASO , `produtoComMaisAtraso` + "N itens · R$ ..." (protótipo: Leg Press
     45° Titanium · 24 itens · R$ 646.100,00).
   - TOP 3 CONCENTRA , `top3Concentra%` + "dos itens atrasados" (protótipo: 60,2%).
2. **Ranking** (direita): lista ordenada por valor atrasado desc, cada linha com posição, nome
   do produto, "R$ <valor> · X% dos atrasos", barra de progresso (largura = % do maior) e "N
   ITENS" à direita (protótipo: "1. Leg Press 45° Titanium , R$ 646.100,00 · 23,3% dos atrasos ,
   24 ITENS").

Regras:
- Universo: só linhas de item em **pedidos atrasados** (`dataPrevista < hoje`) do bucket ABERTA,
  na janela da demanda + empresa/UF.
- Barra de cada produto: gradiente vermelho, largura relativa ao produto do topo.
- "% dos atrasos" é sobre **valor** (não sobre itens), a menos que o cliente peça o contrário
  (**[A REFINAR]**: o card diz "% dos atrasos" e a legenda do TOP 3 diz "dos itens atrasados";
  padronizar a base do %).

[NOVO] Consulta dedicada (Q-5.8): agrega por produto o que está atrasado. Reaproveita
`aAtenderDoItem` e o predicado de atraso (pedido com `dataPrevista < hoje`).

---

### 5.7 Regras de negócio e edge cases

**RN-5.1 , Universo é sempre `bucket_demanda = 'ABERTA'`.** Nenhum bloco lê pedido fora desse
bucket. FECHADA/null nunca entram. A classificação é a materializada pelo builder (seção 5.2);
o módulo não reclassifica.

**RN-5.2 , Janela da demanda não é cortada pelo corte de leitura.** Usar
`janelaDemandaAberta` (piso 2000), **nunca** `janelaClampada`, em toda consulta de demanda. A
janela vem só da pílula. Sem período = "Tudo" (do primeiro pedido). Campo de posicionamento:
`data_orcamento`. Pedido sem `data_orcamento` fica de fora. (Seção 6.1 da Parte I.)

**RN-5.3 , Definição de "atrasado".** Um pedido/linha está atrasado quando
`fato_pedido.data_prevista != null` **e** `data_prevista < hoje` (data de Brasília, início do
dia). Sem `data_prevista` = "sem prazo", nunca atrasado. "Hoje" é o `hoje: Date` passado às
consultas (não `now()` inline), para testabilidade , como as consultas atuais já fazem.

**RN-5.4 , Venda vs. custo, sempre rotulado.** O resumo do protótipo está a **preço de
venda**. O painel legado usa **custo** em partes. Cada card declara a base e a UI rotula. Não
misturar num mesmo número. A paridade com o Relatório de Entregas Parciais é sobre o **custo**
(`aAtenderCusto`); a paridade dos cards de venda é sobre `aAtenderVenda`. (Seção 6.5 Parte I.)

**RN-5.5 , "A atender" com piso zero e fallback de quantidade cheia.** Toda soma de "falta
entregar" passa por `aAtenderDoItem`: `aAtender = max(0, jobOk ? quantidadeAAtender :
quantidade)`. Quando o job de atendimento não rodou (`atendimentoSincronizado().ok = false`),
cai na quantidade cheia **uniformemente** e a UI avisa "valores provisórios". O piso zero
impede que um pedido entregue a mais (Odoo devolve negativo) abata a falta de outro.

**RN-5.6 , Paridade card == relatório.** No mesmo período + mesma empresa (+ mesma UF), o
"valor pendente a custo" do resumo tem que bater com o `aAtenderCusto` do Relatório de
Entregas Parciais e com o card "Demandas a entregar" da diretoria. Divergência no mesmo escopo
é bug. Fonte única: `aAtenderDoItem`.

**RN-5.7 , Agrupamento por pedido no B2.** As linhas unitárias da lista são agrupadas
visualmente por pedido (mesmo cliente + mesmo pedido). A explosão "unidade i de n" usa
`n = round(aAtender(linha))`. Se `aAtender` não for inteiro (raro, unidade fracionada), tratar
como 1 linha com a quantidade exibida, não fabricar unidades fracionadas.

**RN-5.8 , Saldo de estoque: só positivo, só físico e NÃO escopável por empresa/UF.** No
cálculo de cobertura (M-5.6/M-5.7) e no B7, o saldo por produto soma **apenas** `quantidade > 0`
de locais do escopo **físico da casa** (`whereLocalDoEscopo(..., "fisico")`). Não contar
demonstração nem terceiros. Regra já provada em `queryEstoqueDisponivel` (senão a tela diverge
do painel A-12 e do KPI de estoque). **Além disso (assunção A-5.6):** `fato_estoque_saldo`
**não carrega `empresaId`** , o saldo é do grupo inteiro. Portanto **cobertura % e valor
descoberto só são íntegros no nível GRUPO**: com filtro de empresa ou UF ativo, a demanda
encolhe mas o saldo não, inflando a cobertura. Nesses casos, **travar cobertura % e valor
descoberto ao escopo global** (calcular no grupo) **ou** exibir aviso explícito de que o saldo
não é escopável por empresa/UF. O B7 herda a mesma ressalva no lado do saldo. **Validar** que
`fato_estoque_saldo` não tem coluna de empresa (schema/`SELECT`) antes de implementar; se
passar a ter, a ressalva cai.

**RN-5.9 , Coluna "reserva" indefinida até o cliente fechar.** Enquanto DEP-5.6 estiver aberta,
a coluna não computa regra de negócio; renderiza estado neutro. Não inventar semântica (ex.:
não assumir `localReservaId != null = reservado` sem o aval do cliente).

**RN-5.10 , Dado do protótipo é sintético.** No protótipo, B7 mostra demanda 0 / % 0 em todos
os modelos e B8 mostra "entregues 0"; isso é mock, não é a regra. Em produção, `demanda(p)` e
`quantidadeAtendida` trazem valores reais. Não copiar zeros do protótipo como comportamento
esperado.

**RN-5.11 , "Sem UF" fora do mapa.** Pedidos sem UF do cliente vão para o balde "Sem UF" (como
os KPIs de diretoria já tratam), que **não** entra em nenhum estado do heatmap. É linha/legenda
à parte ou omitido com nota. Nunca somado a um estado.

**RN-5.12 , Filtros combinam (pílula + empresa + UF do mapa + aba + busca).** Todos os
recortes são compostos: a pílula de período define a janela da demanda; o filtro de empresa
recorta por `empresa_id`; o clique no mapa adiciona `uf` **apenas aos blocos demand-side
listados na seção 5.9 (B2/B6/B8/B9), nunca ao B7/B4/B5**; a aba do B2 (abertos/atrasados/todos)
e a busca recortam a lista. Um recorte não anula o outro. A lista de blocos afetados pela UF é
única, definida na seção 5.9 (alinhada com RF-5.12 e 5.6.6).

**RN-5.13 , Divisões seguras.** Ticket médio, %, cobertura, concentração: toda divisão guarda
denominador zero → 0 (universo vazio não pode lançar exceção nem exibir NaN).

**RN-5.14 , Kits/BOM não são desmembrados aqui.** A demanda deste módulo é do **item vendido**
(a máquina), não dos componentes. O desmembramento por lista de material
(`FatoListaMaterialItem`) é análise de compra do módulo Estoque; o Demandas conta a unidade do
produto vendido.

**Edge cases a cobrir em teste:**
- Pedido em aberta sem `data_prevista` (aparece, nunca atrasado).
- Pedido sem `data_orcamento` (não aparece).
- Produto com saldo negativo isolado (não vira "disponível"; não conta cobertura).
- Job de atendimento off (tudo cai na quantidade cheia + aviso; números batem entre si mesmo
  provisórios).
- Cliente sem UF (balde "Sem UF"; fora do mapa).
- Modelo com demanda mas sem saldo (100% descoberto; card valor descoberto sobe).
- Modelo totalmente entregue (sai do ranking B8/B9; `HAVING Σ aAtender > 0`).
- Filtro de empresa/UF ativo com cobertura/valor descoberto (RN-5.8): o saldo continua o do
  grupo (não é escopável), então esses dois cards ficam travados ao grupo ou exibem aviso; não
  deixar a cobertura passar de 100% nem "inflar" pelo estoque do grupo cobrindo um só CNPJ/UF.

---

### 5.8 Consultas (queries)

Todas em `PrismaClient`, recebem `hoje: Date` quando dependem de atraso, e `filtros`
compartilhando o shape `FiltrosDemandas` (`ufs?`, `periodoDe?`, `periodoAte?`, `empresaId?`).
Janela sempre por `janelaDemandaAberta(...)`. Arquivos-alvo: `src/lib/diretoria/queries/`
(pedidos.ts, entregas-parciais.ts) e `src/lib/reports/queries/comercial.ts`.

> **Impacto de container (seção 2.1 do CLAUDE.md):** `src/lib/reports/queries/**` é importado
> pela tool MCP → rebuildar `mcp`. Mudança no restante de `src/**` → rebuildar `app`.

**Q-5.1 , Resumo consolidado (8 cards). [NOVO, estende `queryIndicadoresDemandas`]**
```ts
// src/lib/diretoria/queries/pedidos.ts
export interface ResumoDemandas {
  valorPendente: number;      // M-5.1 (venda)
  pedidosAbertos: number;     // M-5.2
  pedidosAtrasados: number;   // M-5.3
  itensPendentes: number;     // M-5.4 (unidades)
  ticketMedio: number;        // M-5.5
  demandasCobertasPct: number;// M-5.6
  unidadesCobertas: number;   // suporte da legenda
  valorDescoberto: number;    // M-5.7
  unidadesDescobertas: number;
  valorAtrasado: number;      // M-5.8
  atendimentoSincronizadoEm: string | null;
  parcial: boolean;           // job off => true (aviso na UI)
}
export async function queryResumoDemandas(
  prisma: PrismaClient, hoje: Date, filtros: FiltrosDemandas = {},
): Promise<ResumoDemandas>;
```
Pseudo-SQL (duas partes: demanda por linha + saldo por produto, cruzadas em memória, como
`queryEstoqueDisponivel` já faz):
```sql
-- lado DEMANDA (linhas de item dos pedidos abertos, valor a atender):
WITH linha AS (
  SELECT it.pedido_id, it.produto_id,
         GREATEST(0, CASE WHEN :jobOk THEN COALESCE(it.quantidade_a_atender,0)
                          ELSE it.quantidade END) AS a_atender,
         CASE WHEN it.quantidade>0 THEN it.vr_produtos/it.quantidade ELSE 0 END AS preco_unit,
         (f.data_prevista IS NOT NULL AND f.data_prevista < :hoje) AS atrasado
  FROM fato_pedido_item it
  JOIN fato_pedido f ON f.odoo_id = it.pedido_id
  WHERE f.bucket_demanda = 'ABERTA'
    AND f.data_orcamento >= :gte AND f.data_orcamento < :lt
    AND (:empresaId IS NULL OR f.empresa_id = :empresaId)
)
SELECT
  SUM(a_atender*preco_unit)                                   AS valor_pendente,
  COUNT(DISTINCT pedido_id)                                   AS pedidos_abertos,
  COUNT(DISTINCT pedido_id) FILTER (WHERE atrasado)           AS pedidos_atrasados,
  SUM(a_atender)                                              AS itens_pendentes,
  SUM(a_atender*preco_unit) FILTER (WHERE atrasado)           AS valor_atrasado
FROM linha;
-- lado SALDO (fato_estoque_saldo, quantidade>0, escopo fisico) somado por produto e cruzado
-- com SUM(a_atender) por produto para cobertas/descobertas (M-5.6/M-5.7).
```

**Q-5.2 , Lista de pedidos pendentes por unidade (B2). [NOVO, funde
`queryDemandasPendentes` + `queryEntregasParciais`]**
```ts
export interface LinhaPedidoPendente {
  pedidoId: number; numero: string | null; cliente: string | null;
  produtoNome: string | null; unidadeIndice: number; unidadeTotal: number;
  uf: string; prazo: string | null; atrasado: boolean;
  reservaDefinida: boolean | null;   // DEP-5.6: null enquanto sem regra
  valorPendenteUnidade: number;
}
export interface ListaPedidosPendentes {
  linhas: LinhaPedidoPendente[];
  totalPedidos: number; totalLinhasUnitarias: number;
  atendimentoSincronizadoEm: string | null; parcial: boolean;
}
export async function queryPedidosPendentesPorUnidade(
  prisma: PrismaClient, hoje: Date,
  filtros: FiltrosDemandas & { aba?: "abertos"|"atrasados"|"todos"; busca?: string } = {},
): Promise<ListaPedidosPendentes>;
```
Pseudo-SQL: mesma `linha AS (...)` de Q-5.1 (grão-item, com `a_atender`), depois **explodir em
memória** cada linha em `round(a_atender)` unidades (RN-5.7), aplicar aba (filtro `atrasado`) e
busca (substring em cliente/modelo/uf/status), ordenar por valor desc mantendo agrupamento por
pedido. UF via `ufMapDe` (já existe em pedidos.ts). Cor da etapa e status financeiro reusam
`queryEntregasParciais` se o cliente quiser essas colunas.

**Q-5.3 , Máquinas em estoque × demanda (B7). [REUSO `queryEstoqueDisponivel`]**
```ts
// src/lib/reports/queries/comercial.ts  (já existe)
export async function queryEstoqueDisponivel(prisma, filtros): Promise<{
  linhas: { produtoId, produtoNome, saldo, demanda, demandaValorVenda,
            demandaValorCusto, disponivel }[];
  total: number; negativos: number; atendimentoSincronizadoEm: string|null; parcial: boolean;
}>;
```
Já entrega saldo/demanda/disponível por produto (pseudo-SQL real: `WITH linha AS (SELECT
it.produto_id, GREATEST(0, CASE WHEN :jobOk THEN quantidade_a_atender ELSE quantidade END)...)`
sobre `bucket_demanda='ABERTA'` + `data_orcamento IN janela`, cruzado com `fato_estoque_saldo`
filtrado por `quantidade>0` e escopo físico). **[NOVO]** só derivar `percEmDemanda` (M-5.9) e o
subtítulo família·marca na camada de apresentação (ou adicionar campo ao retorno). Ordenação
"menor disponível primeiro" já existe.

**Q-5.4 , Drill do pedido (B5). [REUSO `queryPedidoSituacao`]**
```ts
// src/lib/reports/queries/comercial.ts  (já existe)
export async function queryPedidoSituacao(prisma, { numero }): Promise<{
  encontrado: boolean; /* cabeçalho, etapa, dias parado */
  trilha: { etapa, tempoEtapaDias }[];
  itens: { produtoId, produtoNome, quantidade, valorProdutos, saldoEstoque,
           faltando, temEstoque }[];
  pendencia: string | null;
  multiplosMercos: { numeroMercos: string; pedidos: string[] } | null;
}>;
```
Sem consulta nova; ligar o `pedidoId`/`numero` selecionado no B2 a esta função.

**Q-5.5 , Visão geral (B6). [REUSO `queryIndicadoresDemandas` + campo novo]**
```ts
export async function queryIndicadoresDemandas(prisma, hoje, filtros): Promise<{
  totalPendentes: number; valorAEntregar: number; atrasadas: number;
}>;  // já existe
// [NOVO] "quando mais caro": top 1 pedido por valor pendente
export interface PedidoMaisCaro { numero: string|null; cliente: string|null;
  produtoNome: string|null; valor: number; }
```
A rosca atrasados × no prazo usa `atrasadas` vs `totalPendentes − atrasadas`. Reaproveitar a
Q-5.1 (que já calcula pedidos_abertos, pedidos_atrasados, valor_pendente, ticket) evita
consulta duplicada; adicionar só o "mais caro" (`ORDER BY a_atender*preco_unit por pedido DESC
LIMIT 1`).

**Q-5.6 , Mapa por UF (B4). [REUSO `queryDemandasPorUf`]**
```ts
// src/lib/diretoria/queries/pedidos.ts  (já existe)
export async function queryDemandasPorUf(prisma, filtros): Promise<{
  linhas: { uf: string; quantidade: number; valorTotal: number }[];
  valorGeral: number;
}>;
```
Sem consulta nova; alimentar o heatmap e o clique (publicar `uf` no estado do módulo).
`siglaDeUf` normaliza; "Sem UF" fora do mapa (RN-5.11).

**Q-5.7 , Itens vendidos em pedidos ativos (B8). [REUSO `queryDemandaPorProduto` + split, A REFINAR]**
```ts
// src/lib/reports/queries/comercial.ts  (já existe, base)
export async function queryDemandaPorProduto(prisma, filtros): Promise<{
  totalProdutos: number;
  linhas: { produtoId, produtoNome, familiaNome, quantidade /*a atender*/,
            valorProdutos, valorCusto }[];
  atendimentoSincronizadoEm: string|null; parcial: boolean;
}>;
// [A REFINAR] estender por modelo com o split em TRÊS baldes disjuntos:
export interface ItemAtivoPorModelo {
  produtoId: number|null; produtoNome: string|null; familiaNome: string|null;
  aEntregar: number;       // total pendente (= aEntregarPrazo + atrasados)
  aEntregarPrazo: number;  // a entregar no prazo = aEntregar − atrasados (balde disjunto)
  entregues: number; atrasados: number; valorAEntregar: number;
}
```
Pseudo-SQL do split (por produto): `SUM(a_atender) AS a_entregar`,
`SUM(COALESCE(quantidade_atendida,0)) AS entregues`,
`SUM(a_atender) FILTER (WHERE f.data_prevista < :hoje) AS atrasados`, `GROUP BY produto_id
HAVING SUM(a_atender) > 0 ORDER BY a_entregar DESC`. Derivar em memória
`aEntregarPrazo = a_entregar − atrasados` (o balde "no prazo", disjunto de `atrasados`). Os três
baldes exibidos (`entregues`, `aEntregarPrazo`, `atrasados`) são disjuntos e o percentual é
sobre `entregues + a_entregar`. Gráfico usa `quantidade`; cards do modelo selecionado usam o
split. **[A REFINAR]:** este split é desenho a confirmar com o cliente (ver M-5.10 / seção 5.12).

**Q-5.8 , Concentração de atrasos por produto (B9). [NOVO]**
```ts
export interface ConcentracaoAtrasoProduto {
  produtoId: number|null; produtoNome: string|null;
  itensAtrasados: number; valorAtrasado: number; pctDosAtrasos: number;
}
export interface ConcentracaoAtrasos {
  ranking: ConcentracaoAtrasoProduto[];
  totalItensAtrasados: number; modelosComAtraso: number;
  valorTotalAtrasado: number;
  produtoComMaisAtraso: ConcentracaoAtrasoProduto | null;
  top3ConcentraPct: number;
  atendimentoSincronizadoEm: string | null; parcial: boolean;
}
export async function queryConcentracaoAtrasos(
  prisma: PrismaClient, hoje: Date, filtros: FiltrosDemandas = {},
): Promise<ConcentracaoAtrasos>;
```
Pseudo-SQL:
```sql
WITH linha AS (
  SELECT it.produto_id, it.produto_nome,
         GREATEST(0, CASE WHEN :jobOk THEN COALESCE(it.quantidade_a_atender,0)
                          ELSE it.quantidade END) AS a_atender,
         CASE WHEN it.quantidade>0 THEN it.vr_produtos/it.quantidade ELSE 0 END AS preco_unit
  FROM fato_pedido_item it
  JOIN fato_pedido f ON f.odoo_id = it.pedido_id
  WHERE f.bucket_demanda='ABERTA'
    AND f.data_prevista IS NOT NULL AND f.data_prevista < :hoje   -- só atrasados
    AND f.data_orcamento >= :gte AND f.data_orcamento < :lt
    AND (:empresaId IS NULL OR f.empresa_id = :empresaId)
)
SELECT produto_id, produto_nome,
       SUM(a_atender)              AS itens_atrasados,
       SUM(a_atender*preco_unit)  AS valor_atrasado
FROM linha
GROUP BY produto_id, produto_nome
HAVING SUM(a_atender) > 0
ORDER BY valor_atrasado DESC;
-- agregados (total, modelos, produtoComMaisAtraso, top3ConcentraPct) em memória.
```

**Resumo do reuso vs. novo:**
- **Reuso direto** (sem tocar SQL): Q-5.3 (`queryEstoqueDisponivel`), Q-5.4
  (`queryPedidoSituacao`), Q-5.6 (`queryDemandasPorUf`).
- **Reuso + campo/adaptação:** Q-5.1/Q-5.5 (estende `queryIndicadoresDemandas`), Q-5.2 (funde
  `queryDemandasPendentes` + `queryEntregasParciais`, adiciona explosão por unidade), Q-5.7
  (estende `queryDemandaPorProduto` com split).
- **Novo:** Q-5.8 (concentração de atrasos).

---

### 5.9 Filtros e parâmetros

- **Pílula de período (topo, global):** define `periodoDe` / `periodoAte`. Traduzida em
  `janelaDemandaAberta(periodoDe, periodoAte)` (piso 2000). Sem período = "Tudo" (do primeiro
  pedido). **Nunca** clampar no corte de dados aqui (RN-5.2). Seção 6.3 da Parte I.
- **Filtro de empresa / CNPJ (topo, global):** `empresaId` → `buildEmpresaWhere(empresaId)` /
  `f.empresa_id = :empresaId`. `undefined` = grupo inteiro. Seção 6.4 da Parte I.
- **UF (via clique no mapa B4):** `ufs: string[]` (ou uma UF). Normalizado por `siglaDeUf`.
  Clique repetido limpa. "Sem UF" não é selecionável no mapa. **Lista canônica dos blocos
  afetados pela UF (fonte única, referenciada por RF-5.12, 5.6.6 e RN-5.12):**
  - **Afetados:** **B2** (lista), **B6** (visão geral), **B8** (itens vendidos) e **B9**
    (concentração de atrasos) , todos demand-side, escopáveis pela UF do cliente.
  - **Não afetados:** **B7** (o lado do saldo é do grupo, `fato_estoque_saldo` sem UF, RN-5.8;
    filtrar por UF inflaria a coluna disponível), **B4** (o próprio mapa) e **B5** (drill de um
    pedido já selecionado).
- **Aba do B2:** `"abertos" | "atrasados" | "todos"` (default abertos). Recorta só a lista B2.
- **Busca do B2:** string livre, substring case-insensitive em cliente/modelo/UF/status.
- **Busca do B7:** string livre sobre nome/código do modelo.
- **Modelo selecionado (B8):** `produtoId` opcional; recorta os três cards do modelo; "Limpar
  seleção" volta a "Todos os modelos".
- **Pedido selecionado (B5):** `pedidoId` / `numero` do clique no B2.
- **Toggle de período do B8:** `"todos" | "pilula"` **[A REFINAR]**.

Composição: pílula e empresa são globais (afetam todos os blocos); UF, aba, busca e seleções
são locais e **compõem** com os globais (RN-5.12).

---

### 5.10 Estados e validações

Seguir o padrão 7.5 da Parte I. Por bloco:

- **Carregando:** skeleton dos cards/tabelas/gráficos; nunca layout que "pula".
- **Vazio (universo sem pedidos no filtro):** cada bloco mostra estado vazio acionável:
  - Resumo: cards em 0 formatado ("R$ 0,00", "0"), sem NaN.
  - B2: "Nenhum pedido pendente no filtro atual" + sugestão de alargar o período/limpar UF.
  - B7: "Sem modelos com saldo/demanda no filtro".
  - B5: "Clique em um pedido na tabela B2 para ver os detalhes" (estado inicial padrão).
  - B4: mapa todo neutro + "Nenhum estado com pendências".
  - B8/B9: "Sem itens ativos/atrasados no filtro".
- **Erro:** mensagem acionável ("Não foi possível carregar as demandas. Tente novamente."),
  nunca "Erro" seco; botão de retry.
- **Parcial (job de atendimento off):** banner/badge "Valores provisórios , o cálculo de
  entregas ainda não sincronizou; mostrando a quantidade cheia." Vale para todos os blocos que
  usam `aAtender` (todos, menos o lado puro de saldo do B7).
- **Frescor:** "atualizado há Xs" (última sync do cache) no cabeçalho do módulo (RF-5.15,
  seção 6.6 da Parte I).
- **Validações de cálculo:** divisões seguras (RN-5.13); percentuais grampeados em [0, 100];
  cobertura nunca > 100%; contadores inteiros não negativos.
- **Acessibilidade:** rosca e mapa não dependem só de cor (legenda com valor/rótulo); botão
  só-ícone com `aria-label`; alvo de toque ≥ 44px; foco visível; conferir contraste AA em
  dark e light (padrão 7.6).

---

### 5.11 Critérios de aceite

- **CA-5.1** , Todos os oito cards do resumo exibem os valores de M-5.1 a M-5.8 e o ticket
  médio confere `valorPendente / pedidosAbertos` (ex.: 2.148.900 / 42 = 51.164,29).
- **CA-5.2** , A paridade **a custo** (RN-5.6) é **invariante interno, não um card**: no mesmo
  período + empresa, o `aAtenderCusto` calculado bate com o Relatório de Entregas Parciais e com
  o card "Demandas a entregar" da diretoria. O card VALOR PENDENTE do resumo, por sua vez, exibe
  **venda** (`aAtenderVenda`, M-5.1), não o custo , os dois números não precisam ser iguais.
  Ambos verificados contra o cache real (não só teste com mock).
- **CA-5.3** , A janela da demanda **não** muda quando o corte de dados muda; muda quando a
  pílula muda. Teste: alterar `sync.corte_dados` para frente → os números do módulo permanecem;
  mover a pílula → mudam.
- **CA-5.4** , B2 lista uma linha por unidade pendente, agrupada por pedido, com "unidade i de
  n" coerente (Σ linhas unitárias = Σ `round(aAtender)`), e as abas Abertos/Atrasados/Todos +
  busca recortam corretamente.
- **CA-5.5** , "Pedidos atrasados" conta só pedidos com `data_prevista < hoje`; pedido sem
  prazo nunca aparece como atrasado.
- **CA-5.6** , B7 mostra disponível = saldo(positivo, físico) − demanda por modelo, com
  negativos no topo, e o % em demanda calculado (M-5.9); os totais do cabeçalho batem com a
  soma das linhas.
- **CA-5.7** , Clicar numa linha do B2 preenche o B5 com trilha, itens (saldo/faltando) e
  pendência via `queryPedidoSituacao`; sem seleção, B5 mostra o estado vazio.
- **CA-5.8** , B6: rosca atrasados × no prazo × **sem prazo** soma 100%; o balde atrasados bate
  com pedidos_atrasados / pedidos_abertos e o balde "sem prazo" conta os pedidos sem
  `data_prevista` (nunca em "no prazo"); "quando mais caro" aponta o maior pedido do universo.
  (Se a rosca for binária, a legenda de "no prazo" declara que inclui os "sem prazo".)
- **CA-5.9** , B4: heatmap colore por UF, clique filtra B2/B6/B8, clique repetido limpa; "Sem
  UF" não aparece como estado; a soma das UFs + "Sem UF" fecha com o universo.
- **CA-5.10** , B8: gráfico ordenado desc por quantidade, top N, barra selecionada destacada;
  cards do modelo mostram entregues/a entregar/atrasados coerentes (percentuais sobre entregues
  + a entregar).
- **CA-5.11** , B9: ranking ordenado por valor atrasado desc, cards agregados (total itens,
  valor total, produto com mais atraso, Top 3 concentra %) coerentes; o valor total do B9 bate
  com o card "valor atrasado" do resumo (M-5.8 == Σ B9).
- **CA-5.12** , Job de atendimento off: todos os blocos caem na quantidade cheia com aviso
  "valores provisórios", e ainda assim os números batem entre si.
- **CA-5.13** , Universo vazio no filtro: nenhum bloco lança exceção; todos mostram estado
  vazio com 0 formatado.
- **CA-5.14** , `tsc` + `jest` verdes; E2E contra o cache real conferindo que os totais do
  módulo fecham com o painel legado de pedidos no mesmo escopo.
- **CA-5.15** , UI conferida em dark e light, 375px sem scroll horizontal, tabelas/mapa/gráfico
  rolando no próprio contêiner; reuso dos componentes do design system (sem card/tabela/rosca
  novos fora do padrão).

---

### 5.12 Dependências e pontos em aberto

> **Este módulo será revisado pelo cliente antes de fechar.** O dono declarou "vou refazer com
> calma" e o colocou por último na prioridade. Tudo abaixo marcado **[A REFINAR]** precisa de
> uma segunda passada de escopo com ele. Não iniciar execução dos itens `[A REFINAR]` sem esse
> alinhamento; o núcleo já existente (`MUST`) pode avançar antes.

**Dependências de dado/frente:**
- **DEP-5.5 (job de atendimento):** frescor de `quantidade_a_atender` / `quantidade_atendida`.
  Se o job não roda, todo o módulo fica provisório. Precondição operacional de produção.
- **DEP-5.6 (coluna "reserva"):** sem semântica de negócio fechada. Bloqueia RF-5.13. Candidatos
  em 5.3; decisão do cliente.
- **DEP-5.7 (whitelist de etapas , peças/consumidor final, D7/P1):** decisão pendente do dono.
  Muda o conjunto de pedidos considerados demanda. Rastreado em `etapas-demanda-aberta.ts`.
- **DEP-5.8 (linha/tipo de produto):** gap de cadastro resolvido na camada base (B1/B4 da Parte
  I). Não bloqueia a v1 (o módulo usa família·marca), mas habilita recortes futuros.

**Pontos em aberto [A REFINAR] (levar ao cliente):**
1. **Base da valoração por card** (venda vs. custo) , RN-5.4. O protótipo está a venda; o
   legado usa custo em partes. Padronizar e rotular.
2. **Definição de cobertura** (M-5.6): "há saldo hoje" vs. "há reserva vinculada" (liga em
   DEP-5.6).
3. **Denominador de "% em demanda"** (M-5.9): `saldo` vs. `disponível + demanda`.
4. **Métrica do heatmap** (B4): valor pendente por UF vs. quantidade de pedidos.
5. **Semântica da aba "Todos"** (B2): abertos + atrasados sem filtro de aba, ou algo mais amplo.
6. **Toggle "Todos os períodos" do B8**: independente da pílula global ou espelho dela.
7. **Base do "% dos atrasos"** (B9): por valor (default aqui) vs. por itens , unificar o rótulo.
8. **"Valor total em pedidos ativos" do B6** (M-5.1): valor pendente (default, bate o protótipo)
   vs. valor cheio dos pedidos.
9. **Coluna "reserva"** (B2): render final depende de DEP-5.6.

**Premissa de execução:** por ser evolução de uma tela viva, começar por **auditar o que já
existe** em `diretoria/pedidos/page.tsx` e nas queries citadas, mapear o que já cobre cada
bloco, e só então implementar o delta (explosão por unidade no B2, split do B8, concentração
B9, % em demanda no B7, "quando mais caro" no B6). Não reescrever o que já funciona e já tem
paridade provada com o Relatório de Entregas Parciais.
