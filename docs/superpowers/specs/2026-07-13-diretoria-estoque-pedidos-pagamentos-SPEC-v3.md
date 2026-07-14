# SPEC v3 , Diretoria: estoque por local, pedidos a atender, pagamentos por visão

**Data:** 2026-07-13
**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Versão:** v3 , **esta é a versão que vai para o plano**
**Origem:** pedido do colaborador da Matrix Fitness + perícia contra o cache real e o
Odoo ao vivo + duas reviews adversariais sequenciais.

> **Trajetória.** v1 → review #1 (12 achados, 4 bloqueantes) → v2 → review #2 (12
> achados, 5 bloqueantes) → **v3**. As reviews derrubaram, entre outras coisas: o ciclo
> de sync escolhido (que não existia), a fonte do painel de pagamentos (que era a
> errada), a classificação de locais por lista de IDs (o Odoo já traz a regra pronta) e
> o esquecimento do MCP (que passaria a contradizer a tela). Tudo abaixo está medido
> contra o dado real, não inferido.

---

## 1. O problema, em uma frase

A Diretoria trata **estoque** e **pedido** como um número de cabeçalho, quando ambos são
compostos: o estoque tem **local** (e nem todo local é nosso), e o pedido tem **linhas
parcialmente atendidas** (e nem tudo que foi pedido ainda falta entregar).

---

## 2. Os sete problemas (com o dado que os prova)

Medições no cache real e no Odoo ao vivo, 2026-07-13. Corte de dados vigente:
**2026-03-16** (`sync.corte_dados`).

### P1 , O valor de estoque soma locais que não são estoque nosso

| Classe | Locais c/ saldo | Valor a custo |
|---|---:|---:|
| **Físico** (`Próprio`, depósitos reais) | 4 | **R$ 29.852.652** |
| Fora (`Virtual` R$ 10,24 mi + `Terceiros` R$ 6,07 mi) | 3 | R$ 16.318.304 |
| Demonstração (`Terceiros / Demonstração`) | 35 | R$ 1.562.449 |
| **Total somado hoje** | 42 | **R$ 47.733.406** |

**O KPI da tela não é esse total:** `src/lib/indice-estoque.ts:68` divide pelo índice
(padrão **0,95**). Logo o que a diretoria vê hoje é **~R$ 50,25 mi** e passará a ver
**~R$ 31,42 mi** (R$ 29.852.652 / 0,95).

**Três armadilhas, todas confirmadas no dado:**
1. **`Demonstração` é filha de `Terceiros`.** "Excluir Terceiros" apagaria a demonstração
   junto.
2. **Não classificar por texto.** O `fato_estoque_saldo.local_nome` é o `display_name`
   invertido, com `»` (`Jds - Matriz DF » Próprio`). Além disso **há dois locais com o
   nome idêntico `Próprio / INATIVO`** (ids 14 e 271) , o nome não identifica nada.
3. **Nem tudo que é `Próprio` é estoque vendável:** `Showroom`, `ASTEC` (assistência
   técnica, 6 locais), `INATIVO` (2), `CASA DO ÍCARO` (2) e 5 locais de razão social. Hoje
   todos com saldo zero, mas a regra ingênua os promoveria a estoque no dia em que
   receberem saldo.

**Anomalia registrada:** dois **nós sintéticos** (`tipo='S'`) carregam saldo direto ,
`Terceiros` (R$ 6,07 mi) e `Virtual` (R$ 10,24 mi). É anomalia do Odoo do cliente; nós
apenas classificamos como `fora`.

### P2 , Demonstração misturada com o vendável

R$ 1,56 mi em 35 locais de clientes (condomínios, academias). Não é vendável. Quatro
desses locais têm como "cliente" empresa do próprio grupo (~R$ 317 mil) , continuam como
demonstração, e isto fica registrado para não virar surpresa.

### P3 , B-04 soma o pedido inteiro, não o que falta entregar

`src/lib/diretoria/queries/pedidos.ts:192` usa `vrProdutos` , o **cabeçalho**. Nenhuma
query de `pedidos.ts` lê `fato_pedido_item`.

**Tamanho real do erro** (338 pedidos ABERTA pós-corte , população única usada em toda
esta spec):

- Unidades pedidas **10.793** · unidades **a atender 5.694** → **47% da demanda já foi
  entregue** e continua sendo contada como pendente.
- 2.353 de 5.516 itens (42,7%) com atendimento parcial.

**Causa técnica:** `quantidade_a_atender_pedido` e `quantidade_atendida_pedido` são
**computados não-armazenados** (`store=false`); `src/worker/odoo/field-selection.ts:46`
filtra `store === true`. Nunca entraram no cache.

### P4 , 1.007 itens de pedido mortos dentro do fato

O reconcile **funciona** (234.877 linhas no raw, 1.516 marcadas `raw_deleted`, fechando
com as 233.361 do Odoo). O bug está no builder:
**`src/worker/fatos/fato-pedido-item.ts:39-41` lê o raw sem filtrar `raw_deleted`**,
ingerindo **1.007 linhas mortas** e inflando o fato de R$ 62,65 mi para R$ 65,30 mi.

Prova: `PV-2051/26` tem 4 itens vivos (R$ 512.909,54 = exatamente o cabeçalho) e 38
mortos (R$ 1.195.533,23) que o fato ainda soma.

**É um fix de uma cláusula: `AND i.raw_deleted = false`.**

### P5 , A-12 compromete a quantidade cheia

`src/lib/diretoria/queries/estoque.ts:715-743` subtrai do saldo a
`fato_pedido_item.quantidade` (total da linha), não o que falta atender. Somado a P1 (o
saldo inclui Virtual/Terceiros) e a P4 (itens mortos), o "disponível" erra por três
motivos ao mesmo tempo.

### P6 , Não existe painel de necessidade de compra

`fato_estoque_min_max` está **vazia**: o Odoo do cliente não tem estoque mínimo / ponto
de pedido. A necessidade será `demanda a atender − saldo físico` (§5.6).

### P7 , O painel de formas de pagamento lê a fonte errada

`src/lib/diretoria/queries/vendas.ts:65-104` lê **`fato_pedido_parcela`** (a parcela do
pedido), onde `forma_pagamento_id` é **opcional e vem vazio em 24% dos casos** , daí o
balde "Não informado" de **R$ 23,08 mi** (o segundo maior do gráfico).

**Existe a fonte certa, e ninguém a usa:** o **título financeiro** (`finan.lancamento` →
`fato_financeiro_titulo`), que é o documento de cobrança real. Nele:

- **forma de pagamento preenchida em 5.536 de 5.537 títulos (99,98%)**;
- há ligação com o **pedido** (`pedido_id`) **e com a nota** (`sped_documento_id` →
  `nota_fiscal_id`), além de `pedido_faturado`;
- há o campo literal **`provisorio`** , que responde diretamente à pergunta do
  colaborador: **apenas 15 títulos de 5.537 são provisórios**. O sistema **não** está
  inflando com conta provisória.

**Ou seja: o "Não informado" de R$ 23 mi não é um problema de negócio, é artefato da
fonte errada.** Na fonte certa ele vira **um único título de R$ 31.157,90**.

Defeitos colaterais da query atual, todos reais: não filtra venda externa, não filtra
`categoriaOperacao='venda'` (entram compra e transferência), não aplica empresa nem UF
(**usuário restrito a UF vê o grupo inteiro**), e recorta por **`dataVencimento`** em vez
da data da venda.

---

## 3. Decisões do dono , não rediscutir

1. **Locais:** físico = depósitos próprios reais; `Terceiros / Demonstração` = painel
   próprio; `Virtual` e o resto de `Terceiros` = fora do valor de estoque.
2. **Showroom** (id 35) → **demonstração** (única exceção de negócio, §5.1).
3. **B-04 e KPI de demanda:** ambos a **custo**, sobre a **quantidade a atender**.
   Custo = `fato_produto.preco_custo` (o custo da linha do pedido vem zerado no Odoo:
   R$ 147 mil em R$ 62 mi).
4. **Pedido com etapa aberta e 100% atendido** (54 pedidos): **continua listado, com
   valor R$ 0,00**. A regra da Mariane (por etapa) fica intacta; o zero expõe o pedido
   cuja esteira parou.
5. **Necessidade de compra:** **nacional** (a operação transfere entre filiais), **com
   drill-down do saldo por depósito físico**.
6. **Não filtrar produto por tipo SPED.** O dono confirmou: **a empresa não fabrica nada,
   importa e revende**. O tipo `'04'` de 136 produtos é inconsistência de cadastro.
7. **Pagamentos: três visões** (§5.7), sobre o título financeiro.
8. **O Agente Nex acompanha:** as tools do MCP passam a usar "a atender" e a reportar
   custo **e** venda (§5.9).

---

## 4. A regra de demanda em aberto (canônica, NÃO muda)

`src/lib/fiscal/regras/classifica-etapa-demanda.ts` + `classifica-operacao.ts` →
`fato_pedido.bucket_demanda`. Definida com a Mariane (admin comercial do cliente):
venda externa (CFOP `venda`/`exportacao`, não intragrupo; simples faturamento 5922/6922
**não** é demanda , a demanda é a remessa x117), etapa não terminal e não cancelada, com
a **exceção**: `Nota emitida e não entregue` conta como **ABERTA**.

Esta spec **não altera essa regra** , apenas passa a usar, dentro dos pedidos já
classificados como ABERTA, a **quantidade que falta atender**.

**Para o RADAR (não é escopo):** 2 pedidos em etapa `Cancelado` (R$ 60.575) estão como
`ABERTA` , a etapa não tem `finaliza_pedido_cancelando` marcada no Odoo.

---

## 5. O que será construído

### 5.1 Classificação de local , **estrutural**, não por lista de IDs

A review #2 provou que **o Odoo já entrega a regra**. Os campos de `raw_estoque_local`
separam os depósitos reais dos demais **perfeitamente**:

| Local | `estoque_em_maos` | `calcula_extrato_saldo` | `proprietario_local_id` |
|---|---|---|---|
| Jds - Matriz DF (depósito real) | true | true | array |
| ASTEC DF (assistência técnica) | true | **false** | array |
| Showroom | **false** | false | array |
| INATIVO (271) | **false** | false | false |

**Regra (pura, testável, em `src/lib/estoque/classificacao-local.ts`):**

```
1. odoo_id == 35 (Showroom)                              -> "demonstracao"   [exceção de negócio]
2. nome_completo começa com "Terceiros / Demonstração"   -> "demonstracao"
3. raiz == "Próprio"
   E estoque_em_maos
   E calcula_extrato_saldo
   E proprietario_local_id é array (tem dono)            -> "fisico"
4. qualquer outro caso                                   -> "fora"   [fail-closed]
```

Validado contra o cache: **físico 16 locais (4 com saldo, R$ 29.852.652)**,
**demonstração 128 (35 com saldo, R$ 1.562.449)**, **fora 244 (3 com saldo,
R$ 16.318.304)** , exatamente o conjunto desejado, **sem nenhuma lista de IDs**.

> **Por que só o Showroom é exceção:** o `JDS DEMO SÃO PAULO` (414) **está
> `raw_deleted = true`** , foi deletado no Odoo e nem chega ao fato. As demais exceções
> que a v2 hard-codeava (ASTEC, INATIVO, CASA DO ÍCARO, e mais 5 locais de razão social
> que a v2 **tinha esquecido**) caem naturalmente na regra estrutural.

**Novo fato `fato_estoque_local`** (de `raw_estoque_local`, filtrando `raw_deleted`):
`odooId`, `nome`, `nomeCompleto`, `tipo` (`S`/`A`), `nivel`, `localSuperiorId`,
`estoqueEmMaos`, `calculaExtratoSaldo`, `temProprietario` e a coluna derivada
**`classificacao`**. Ciclo: **`snapshot`** (o cadastro de locais muda raramente).

**Proibido** classificar por string de `local_nome`. As queries **juntam por `local_id`**.

### 5.2 Estoque , KPIs e painéis por classificação

- KPI "Valor em estoque" (A-01/A-09) e os painéis A-02, A-03, A-04, A-05, A-11: **só
  `classificacao = 'fisico'`**.
- Novo painel **"Estoque em demonstração"**: valor, unidades, nº de locais e a lista por
  cliente/local.
- A-02 ("Estoque por local") exibe a classificação de cada local.

**Aceite:** KPI = **~R$ 31,42 mi**; demonstração = **R$ 1.562.449 / 35 locais**; Virtual
e Terceiros ausentes de ambos.

### 5.3 Seriais (A-06) , serial, local e saldo

Hoje o A-06 lê `fato_serial`: **3.828 "em estoque", 0 com local** (o builder só preenche
o local de quem já saiu) e a tela mostra 2 colunas, sem saldo.

Fonte certa, já no cache e sem nenhum consumidor:
**`raw_estoque_saldo_rastreabilidade_hoje`** (`lote_serie_id` + `local_id` + `produto_id`
+ `saldo`).

**Novo fato `fato_serial_saldo`**: serial, produto, local, **classificação**, saldo,
valor. Ciclo: **`snapshot`** (segue o `fato_estoque_saldo`, que também é snapshot , assim
os dois têm o mesmo frescor).

O A-06 passa a listar **só saldo > 0**, colunas **Serial · Produto · Local ·
Classificação · Saldo**, filtrável por classificação (físico por padrão).

**`fato_serial` vira legado:** continua sendo construído, mas **a verdade de "serial em
estoque" passa a ser o `fato_serial_saldo`** , o KPI de seriais e o A-09 passam a ler a
fonte nova, para a plataforma não exibir dois números. RADAR: remover `fato_serial`
depois.

**Aceite:** seriais físicos ≈ **2.511** (1.235 Matriz DF + 749 Filial SE + 527 Filial
SP) , **revalidar na verificação**, o número anda com o cache. **Nota a exibir:** o
depósito **Jib DF** é físico e tem 599 unidades de saldo mas **zero seriais** , a A-06
mostrará 3 depósitos onde a A-02 mostra 4, e isso é correto (nem todo produto é
serializado).

### 5.4 Ingestão , atendimento do item de pedido (o ponto mais delicado)

**Por que `extraFields` sozinho NÃO resolve:** o sync incremental filtra
`write_date > since` (`src/worker/sync/incremental.ts:60-64`), mas **o `write_date` do
item do pedido não muda quando a entrega acontece** , quem nasce é outro registro.
Provado: item 254221 com `write_date` de **2026-06-23**, atendido por NF criada em
**2026-06-30**. O campo entraria uma vez e **congelaria**.

**Desenho (corrigido pela review #2, que derrubou o da v2):**

1. **`extraFields` no `MODEL_CATALOG`** , declara campos computados por modelo,
   consumido por `getModelFields` (que hoje descarta todo `store=false`). Para
   `sped.documento.item`: `quantidade_a_atender_pedido`, `quantidade_atendida_pedido`.

2. **Novo scheduler `JOB_ATENDIMENTO`, a cada 24 h, na `maintenanceQueue`.**
   Os schedulers existentes são `incremental` (3-10 min), `snapshot` (**30 min**, não 24
   h , a doc do projeto está errada e a v2 herdou o erro) e `reconcile` (180 min). **Não
   existe ciclo diário**; este job cria um.

3. **O job escreve no RAW, não no fato.** `fato_pedido_item` é **DELETE + INSERT..SELECT
   completo a cada ciclo incremental** (`registry.ts:72`), então **qualquer coluna
   escrita direto no fato seria zerada em minutos**. O job faz `search_read` dos itens
   com `pedido_id != false`, **ignorando `write_date`**, e faz upsert no raw.

4. **Com TODOS os campos, e paginado.** O upsert do raw **substitui o `data` inteiro**
   (`incremental.ts:100-106`); um `search_read` só com os 2 campos computados
   **destruiria o JSONB** e zeraria o `fato_pedido_item` silenciosamente. Portanto:
   `fields = getModelFields(modelo) + extraFields`, com `PAGE_SIZE` e
   `corteDomain('sped.documento.item')` aplicados , como o `syncIncremental` já faz.
   **Memória:** os 24.412 itens pesam **184 MB como texto** e o worker roda com heap de
   2 GB e **já sofreu OOM** (RADAR). Paginação é **obrigatória**, não otimização.

5. **Fato:** `fato_pedido_item` ganha `quantidadeAAtender` e `quantidadeAtendida`
   (lidos do JSONB no `INSERT..SELECT`), e o fix `AND i.raw_deleted = false`.

**Custo medido:** 83,4 s para os 23.365 itens (3,57 ms/linha). Aceitável 1x/dia.
**Justificativa da frequência:** demanda a atender é indicador de diretoria, não de
operação minuto a minuto.

**Não** vamos derivar o atendimento em SQL a partir de `pedido_item_id` nem da tabela
`sped.documento.item.pedido.atendido`: a review testou e **não reproduz** (19 linhas no
Odoo inteiro contra 3.010 itens com atendimento; há item com `item_atendido_pedido_ids =
[]` e `quantidade_atendida_pedido = 4`). O campo computado do Odoo é a única verdade.

### 5.5 B-04 , pedidos pendentes pelo que falta atender

```
valor_a_atender(pedido) = Σ nas linhas VIVAS do pedido:
      quantidade_a_atender(linha) × preco_custo(produto)
```

- Cobertura de custo medida: só **27 itens (0,6%)** e **25 unidades (0,4%)** da demanda
  sem custo; **11 produtos (19 itens)** não existem em `fato_produto`. Ambos **contados e
  expostos na tela** (como o KPI de estoque já faz com `produtosSemCusto`), nunca em
  silêncio.
- Pedido com `a_atender = 0`: **listado com R$ 0,00** (decisão #4).
- **KPI B-01 "a entregar" passa a ser a custo** (decisão #3), para tabela e indicador
  falarem a mesma língua.

**Impacto medido (338 pedidos ABERTA + corte):**

| Base | Valor |
|---|---:|
| Cabeçalho a preço de venda (hoje) | R$ 62,65 mi |
| A custo, quantidade cheia | R$ 34,41 mi |
| **A custo, a atender (vai ao ar)** | **~R$ 21,35 mi** |

### 5.6 Necessidade de compra , painel novo

Nacional (decisão #5), por produto:

```
demanda_a_atender(produto) = Σ quantidade_a_atender das linhas VIVAS de pedidos
                             com bucket_demanda='ABERTA' e data_orcamento >= corte
saldo_fisico(produto)      = Σ quantidade dos saldos em locais classificacao='fisico'
necessidade(produto)       = max(0, demanda_a_atender − saldo_fisico)
custo_estimado(produto)    = necessidade × preco_custo
```

Colunas: Produto · Demanda a atender · Saldo físico · **Falta comprar** · Custo estimado.
Ordenado pela maior falta.

**Drill-down por depósito (decisão #5):** cada linha abre a quebra do **saldo físico por
depósito** (Jds Matriz DF, Jds Filial SE, Jds Filial SP, Jib DF), para o time decidir
entre **transferir** ou **comprar**.

**Decisão explícita sobre `local_reserva_id`** (a review #2 cobrou): o
`fato_pedido_item.local_reserva_id` existe e diz de qual depósito o item sairia, **mas só
está preenchido em 31% dos itens em aberto**, e os locais mais usados nele (Jht SP, Jht
DF) **têm saldo zero**. Usá-lo produziria um drill-down que não fecha. **Decisão:
ignorá-lo.** A demanda é tratada como nacional; o drill-down é **do saldo**, não da
demanda. Isto está escrito na tela, para o usuário não supor o contrário.

**Fora de escopo (2ª onda):** lead time, estoque em trânsito (existe em
`fato_compra.recebida = false`), estoque mínimo.

O A-12 ("Estoque disponível") é corrigido pela **mesma base**. **Aceite:** A-12 e
necessidade **fecham entre si dentro de uma mesma leitura** (não entre ciclos , os fatos
têm relógios diferentes: saldo é `snapshot`/30 min, demanda é `incremental`, atendimento
é 24 h).

### 5.7 Pagamentos , três visões sobre o **título financeiro** (redesenho)

**Troca de fonte:** de `fato_pedido_parcela` (forma vazia em 24%) para
**`fato_financeiro_titulo`** (forma preenchida em **99,98%**), que é o documento de
cobrança real e já carrega `pedido_id`, `nota_fiscal_id` e `pedido_faturado`.

**Requisito de schema:** `fato_financeiro_titulo` **não tem** forma de pagamento hoje.
Adicionar **`formaPagamentoNome`** (e **`provisorio`**), extraídos de
`raw_finan_lancamento.data->'forma_pagamento_id'[1]` e `->>'provisorio'`. Migration +
ajuste do builder `src/worker/fatos/fato-financeiro-titulo.ts` + rebuild.
**(Isto elimina o bloqueante da v2, que exigia `pedidoId` em `FatoNotaFiscal` , não é
mais necessário: o título já tem os dois vínculos.)**

**As três visões** (títulos `a_receber`, pós-corte , medidas):

| Visão | Definição | Títulos | Valor |
|---|---|---:|---:|
| **1. Pago** | tem nota emitida **e** `vr_saldo <= 0` | 1.148 | **R$ 31,40 mi** |
| **2. A receber** | tem nota emitida **e** `vr_saldo > 0` (parcela a vencer) | 635 | **R$ 28,25 mi** |
| **3. Carteira em aberto** | **sem nota emitida** (pedido aprovado, NF não saiu) | 3.654 | **R$ 52,39 mi** |

O painel C-07 ganha um **seletor de visão** (padrão: **Pago**, que é "como as vendas que
de fato aconteceram foram pagas") e mostra o donut de formas de pagamento **daquela
visão**. As três somam o total, nada é escondido.

Semântica, escrita na tela em uma linha:
- **Pago** = receita realizada e liquidada.
- **A receber** = venda já faturada, parcela ainda vai vencer (boleto/cartão parcelado).
  Casa com o KPI "A receber" já existente.
- **Carteira em aberto** = pedido fechado com o cliente, cobrança já programada, **nota
  ainda não emitida** , logo ainda não é faturamento. Casa com o KPI "Carteira a faturar"
  já existente.

**"Provisório":** o campo existe e vale a pena expor , **15 títulos de 5.537**. A tela
mostra um aviso discreto quando houver título provisório na visão selecionada. Responde
definitivamente a pergunta do colaborador: **o sistema não está inflando com conta
provisória**.

**"Não informado":** deixa de ser um balde de R$ 23 mi e passa a ser o que realmente é ,
**1 título, R$ 31.157,90**. Permanece visível (é resíduo acionável de cadastro).

A query passa a respeitar **empresa** e **UF** como as demais de vendas (hoje não
respeita , usuário restrito a UF vê o grupo inteiro).

**Nota de escopo:** o C-05 ("Modalidades de operação") e o C-09 (dimensão "Pagamento")
consomem a mesma query. Ambos precisam ser reapontados para a fonte nova ou
explicitamente mantidos , decidir no plano, não deixar órfão.

### 5.8 `raw_deleted` nos builders , auditoria dimensionada corretamente

A v2 dimensionou isto em cima de um `grep` quebrado (que não enxerga
`prisma.rawX.findMany({ where: { rawDeleted: false } })` , camelCase). **Correções:**

- `fato_estoque_saldo` **já filtra** corretamente (`fato-estoque-saldo.ts:85-87`).
- O "risco" de 4.233 linhas mortas em `raw_estoque_saldo` é **fantasma**: nenhum fato lê
  essa tabela (o builder lê `raw_estoque_saldo_**hoje**`, que tem **0** deletadas).

**Escopo real:** auditar os builders **por uso efetivo** (`prisma.rawX.findMany` +
`FROM raw_x` em SQL cru), não por grep de string; medir quantas linhas mortas cada um
ingere; corrigir os que vazam. **Confirmado vazando: `fato_pedido_item` (1.007).**
Confirmado OK: `fato_pedido`, `fato_pedido_parcela`, `fato_estoque_saldo`.

Está no escopo **porque B-04 e necessidade de compra dependem de fatos limpos**.

### 5.9 MCP / Agente Nex , alinhar com a Diretoria (decisão #8)

Sem isto, a plataforma passa a ter **dois números oficiais** para a mesma pergunta: a
tela diria "R$ 21,35 mi (custo, a atender)" e o Nex responderia **"R$ 62,6 mi"** (venda,
cheio).

Tools afetadas, todas lendo a mesma base:
- `mcp/tools/comercial/demanda-em-aberta.ts` (`valorTotal` = `vrProdutos` do cabeçalho)
- `mcp/tools/comercial/demanda-por-produto.ts` (`quantidade` cheia)
- `mcp/tools/comercial/pedido-situacao.ts`
- `src/lib/reports/queries/comercial.ts` (lê `bucket_demanda`)

**Todas passam a usar a quantidade a atender** (correção de bug , hoje o Nex também
infla) e a **reportar os dois valores**: a atender **a custo** e a atender **a preço de
venda**. Assim a tela (custo) e o Nex (ambos) nunca se contradizem.

**Rebuild obrigatório do container `mcp`** após a mudança (regra de raiz do projeto:
`src/lib/reports/queries/**` e `mcp/**` → rebuildar `mcp`).

---

## 6. Impacto (o que a diretoria vai ver mudar)

| Indicador | Hoje | Depois |
|---|---:|---:|
| KPI Valor em estoque | ~R$ 50,25 mi | **~R$ 31,42 mi** |
| Estoque em demonstração | (não existe) | **R$ 1,56 mi** |
| Pedidos pendentes / KPI a entregar | R$ 62,65 mi (venda, cheio) | **~R$ 21,35 mi** (custo, a atender) |
| Seriais listados | 3.828, sem local nem saldo | **~2.511 físicos**, com local e saldo |
| Formas de pagamento | 1 gráfico, R$ 54,5 mi misturados | **3 visões**: Pago R$ 31,40 mi · A receber R$ 28,25 mi · Carteira R$ 52,39 mi |
| "Não informado" (pagamentos) | R$ 23,08 mi | **R$ 31,1 mil** (1 título) |
| Necessidade de compra | (não existe) | painel novo, com drill-down por depósito |
| Agente Nex (demanda) | R$ 62,6 mi (venda, cheio) | alinhado com a tela |

**Os números caem, e isso é a correção.** O estoque não encolheu: a conta passou a
considerar só o que é da empresa e está em casa. A demanda não sumiu: passou a contar só
o que falta entregar. E o dinheiro dos pagamentos não sumiu , foi **separado em três
lentes** que antes estavam somadas num número que não significava nada.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Campo computado **congelar** no cache | Ciclo próprio de 24 h, ignorando `write_date` (§5.4-2). **Teste de regressão que prova que o valor muda após uma entrega** (critério de aceite §9.4) |
| Job novo **destruir o JSONB** do raw | `search_read` com **todos** os campos (§5.4-4). Teste que valida que o `data` do raw continua completo após o job |
| **OOM** do worker (já aconteceu) | Paginação obrigatória (`PAGE_SIZE`), 184 MB de payload. Medir heap no ciclo real antes de subir |
| Fix de `raw_deleted` mexer em outros fatos | Auditoria por uso real, medindo antes/depois builder a builder (§5.8). Nenhum fix cego |
| Locais mudarem no Odoo | Regra **estrutural** (campos do Odoo), não lista de IDs. Só o Showroom é exceção |
| Diretoria e Nex divergirem | §5.9 , os dois na mesma base, com rebuild do container `mcp` |
| Cliente estranhar a queda dos números | `docs/kpis-diretoria.md` atualizado **no mesmo commit** (regra do projeto). Comunicar o porquê junto com o quanto |

---

## 8. Fora de escopo (vai para o RADAR)

- Lead time, estoque em trânsito e estoque mínimo na necessidade de compra (2ª onda).
- Necessidade de compra **por empresa/filial** (o saldo no cache não tem empresa, só
  local) , decisão #5 é nacional + drill-down de saldo.
- Filtros globais família/marca/local (código morto: `derivar-estoque.ts`,
  `construtor-estoque.tsx`).
- Unificar a valorização entre Diretoria (`qtd × preco_custo ÷ índice`) e Relatórios
  (`vr_saldo` do Odoo).
- Etapa `Cancelado` classificada como ABERTA (2 pedidos, R$ 60.575).
- Remoção do `fato_serial` legado.
- Correção da doc do projeto que afirma "snapshot/reconcile 24h" (o código diz 30/180
  min).

---

## 9. Critérios de aceite

1. **Estoque:** KPI = **~R$ 31,42 mi** (só `fisico`); demonstração = **R$ 1.562.449 / 35
   locais**; Virtual e Terceiros ausentes de ambos.
2. **Locais:** a classificação é **estrutural** (nenhuma lista de IDs além do Showroom); o
   módulo puro tem teste para cada uma das 4 regras, incluindo o fail-closed.
3. **Fatos limpos:** `fato_pedido_item` sem nenhuma linha `raw_deleted` (hoje 1.007).
   Critério: contagem = itens **vivos com `quantidade > 0`** (o fato só ingere qtd > 0 ,
   **não** comparar com o total de itens do Odoo).
4. **O atendimento atualiza:** teste que prova que, após uma entrega, o
   `quantidade_a_atender` muda no cache (o bug do `write_date` não volta). E teste que
   prova que o job **não destrói** o JSONB do raw.
5. **B-04:** valor = a atender × custo (**~R$ 21,35 mi**); pedido parcialmente entregue
   mostra só o saldo (validar em `PV-2051/26`); pedido 100% atendido aparece com R$ 0,00;
   itens sem custo contados e exibidos.
6. **Seriais:** A-06 só saldo > 0, com local; KPI de seriais lê a mesma fonte da tabela.
7. **Necessidade de compra** fecha com o A-12 **na mesma leitura**; drill-down por
   depósito funcionando.
8. **Pagamentos:** 3 visões com os valores da §5.7; "Não informado" = **1 título
   (R$ 31,1 mil)**; empresa e UF respeitadas; C-05 e C-09 reapontados (não órfãos).
9. **Nex alinhado:** as 3 tools do MCP usam a atender e reportam custo e venda; container
   `mcp` rebuildado.
10. **`docs/kpis-diretoria.md` atualizado no mesmo commit** de cada mudança de KPI.
11. **E2E contra o cache real** antes de declarar pronto (regra de raiz): subir os
    serviços, rodar os ciclos, conferir cada número desta seção.
