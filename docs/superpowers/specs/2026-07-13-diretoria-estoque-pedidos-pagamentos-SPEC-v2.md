# SPEC v2 , Diretoria: estoque por local, pedidos a atender, pagamentos efetivos

**Data:** 2026-07-13
**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Versão:** v2 (v1 + review adversarial #1 aplicada + decisões do dono)
**Origem:** pedido de ajuste do colaborador da Matrix Fitness, somado à perícia contra o
cache real e ao Odoo ao vivo.

> **O que mudou da v1 para a v2:** a review #1 derrubou dois pilares técnicos da v1 e
> corrigiu vários números. Resumo do estrago: (a) o campo computado **congelaria** no
> sync incremental , precisa de ciclo dedicado; (b) o "reconcile" que a v1 queria
> construir **já existe e funciona** , o bug real é uma cláusula `raw_deleted` faltando
> num builder; (c) os números de aceite do estoque estavam errados (local 252) e
> confundiam "valor a custo" com o KPI (que é dividido pelo índice 0,95); (d) o C-07 tem
> o link pedido→nota, mas com 28% de furo; (e) locais dentro de `Próprio` que não são
> vendáveis (Showroom, DEMO, ASTEC). Tudo isso está resolvido abaixo.

---

## 1. Por que esta spec existe

Um colaborador da Matrix apontou cinco incômodos na área **Diretoria**. A perícia
confirmou os cinco e encontrou **mais dois bugs** que ninguém tinha pedido. A raiz é
comum: **a plataforma trata estoque e pedido como um número de cabeçalho**, quando os
dois são compostos (por local; e por linha parcialmente atendida).

Todos os números abaixo foram medidos no cache real e no Odoo ao vivo em 2026-07-13.
Eles são a régua de aceite.

---

## 2. Os sete problemas (com o dado que os prova)

### P1 , O valor de estoque soma locais que não são estoque nosso

Árvore de locais (`raw_estoque_local.data->>'nome_completo'`), medida:

| Subárvore | Locais c/ saldo | Valor a custo | Entra no "físico"? |
|---|---:|---:|---|
| `Próprio` | 4 | **R$ 29.849.890** | sim |
| `Virtual` | 1 | R$ 10.243.115 | não |
| `Terceiros` (raiz, saldo direto) | 1 | R$ 6.071.867 | não |
| `Terceiros / Demonstração` | 35 | R$ 1.562.449 | não (painel próprio) |
| **Total somado hoje** | 41 | **R$ 47.727.322** | |

**O KPI que a diretoria vê não é esse total.** `src/lib/indice-estoque.ts:68` divide o
valor a custo pelo índice (padrão **0,95**). Logo:

- KPI hoje: R$ 47.727.322 / 0,95 = **~R$ 50,24 mi**
- KPI depois: R$ 29.849.890 / 0,95 = **~R$ 31,42 mi**

**Armadilha 1 (ordem da regra):** `Demonstração` é **filha de `Terceiros`**. "Excluir
tudo com Terceiros no nome" apagaria a demonstração junto. Demonstração é testada
**antes** de terceiros.

**Armadilha 2 (não classificar por texto):** o `fato_estoque_saldo.local_nome` é o
`display_name` do Odoo, **invertido e com `»`** (`Jds - Matriz DF » Próprio`). O
`nome_completo` hierárquico só existe no JSONB do raw. Classificar por string do fato é
frágil , há inclusive **dois locais chamados `Próprio / INATIVO`** (ids 14 e 271), o que
prova o ponto. **A classificação é por `local_id`, resolvida a partir da árvore.**

**Armadilha 3 (nem tudo que é `Próprio` é vendável):** dentro da árvore Própria existem
`Showroom` (35), `JDS DEMO SÃO PAULO` (414), `CASA DO ÍCARO BSB` (243) e `SE` (242),
6 locais `ASTEC …` (assistência técnica: 29-34) e 2 `INATIVO` (14, 271). **Hoje todos
com saldo zero** , não afetam o número atual , mas a regra ingênua os mandaria para o
estoque vendável no dia em que receberem saldo.

**Anomalia registrada:** dois **nós sintéticos** de árvore (`tipo='S'`) carregam saldo
direto: `Terceiros` (R$ 6,07 mi) e `Virtual` (R$ 10,24 mi). Saldo pendurado em nó de
árvore é anomalia do Odoo do cliente; nós apenas o classificamos como `fora`.

### P2 , Estoque de demonstração misturado com o vendável

R$ 1,56 mi em 35 locais de clientes (condomínios, academias). Não é vendável.

Observação: 4 desses locais têm como "cliente" a **própria empresa ou empresa do
grupo** (ids 252, 391, 407, 362 , ~R$ 317 mil). Continuam classificados como
**demonstração** (é equipamento posicionado para demonstração), e isso fica registrado
aqui para não virar surpresa.

### P3 , B-04 soma o pedido inteiro, não o que falta entregar

`src/lib/diretoria/queries/pedidos.ts:192` usa `Number(p.vrProdutos)` , o **cabeçalho**
de `fato_pedido`. Nenhuma query de `pedidos.ts` lê `fato_pedido_item`.

**Tamanho real do erro (medido nos 338 pedidos ABERTA pós-corte):**

- Unidades pedidas: **10.793** · unidades **a atender: 5.694**
- **47% da demanda já foi atendida** e continua sendo contada como pendente.
- 2.353 de 5.516 itens (42,7%) têm atendimento parcial; 143 de 401 pedidos abertos têm
  ao menos um item parcialmente atendido.

**Causa técnica:** `quantidade_a_atender_pedido` e `quantidade_atendida_pedido` são
**computados não-armazenados** (`store=false`) no Odoo, e
`src/worker/odoo/field-selection.ts:46` filtra `f.store === true`. Nunca entraram no
cache.

### P4 , 1.007 itens de pedido fantasma nos fatos (bug não pedido)

**A causa não é falta de reconcile.** O reconcile **funciona**: o cache tem 234.877
itens, dos quais 1.516 já estão marcados `raw_deleted=true`, fechando exatamente com os
233.361 do Odoo.

O bug está em **`src/worker/fatos/fato-pedido-item.ts:39-41`**, que lê o raw **sem
filtrar `raw_deleted`**. Resultado: **1.007 linhas mortas** entram em
`fato_pedido_item`, inflando-o de R$ 62,77 mi (cabeçalho) para R$ 65,30 mi.

Prova: `PV-2051/26` tem **4 itens vivos** no Odoo (R$ 512.909,54 = exatamente o
cabeçalho) e **38 itens deletados** (R$ 1.195.533,23) que o fato ainda soma.

**É um fix de uma cláusula (`AND i.raw_deleted = false`), não de um subsistema.**

**Risco sistêmico (achado da review):** só 6 dos ~50 builders em `src/worker/fatos/`
mencionam `raw_deleted`. Volume exposto: `raw_estoque_saldo` 4.233 deletados de 9.239
(46%), `raw_pedido_parcela` 1.334 de 5.138 (26%), `raw_sped_documento` 414. Medido:
`fato_pedido` e `fato_pedido_parcela` **hoje não vazam** (0 fantasmas), mas a mesma
classe de bug está aberta. **Esta spec inclui uma auditoria dos builders** (§5.8).

### P5 , A-12 compromete a quantidade cheia

`src/lib/diretoria/queries/estoque.ts:715-743` subtrai do saldo a
`fato_pedido_item.quantidade` (quantidade **total** da linha), não o que falta atender.
Somado a P1 (o saldo do A-12 inclui Virtual e Terceiros) e a P4 (itens fantasma), o
"disponível" de hoje está errado por três motivos ao mesmo tempo.

### P6 , Não existe painel de necessidade de compra

`fato_estoque_min_max` está **vazia** (0 linhas): o Odoo do cliente **não tem estoque
mínimo / ponto de pedido**. Logo, necessidade **não pode** ser `mínimo − saldo`. Ela
será `demanda a atender − saldo físico` (§5.6).

### P7 , Formas de pagamento (C-07) mistura provisório com efetivo

`src/lib/diretoria/queries/vendas.ts:65-104` é o **outlier** do módulo: única query de
`vendas.ts` que não filtra venda externa, não filtra `categoriaOperacao='venda'`, não
aplica empresa nem UF, e recorta por **`dataVencimento`** em vez da data da venda.

| Balde | Parcelas | Valor |
|---|---:|---:|
| Boleto | 1.730 | R$ 25.308.709 |
| **"Não informado"** | **1.217** | **R$ 23.079.660** |
| Demais (cartão, PIX, transferência…) | 2.168 | R$ 5.786.902 |

**Resposta à pergunta do colaborador ("o sistema aponta contas provisórias ou
efetivas?"): as duas, misturadas.** Composição medida do "Não informado":

- **R$ 19,81 mi (759 parcelas)** de pedidos de venda ainda **ABERTOS** , não faturados,
  forma de pagamento naturalmente ainda não definida;
- R$ 3,01 mi de pedidos FECHADOS (resíduo real de cadastro);
- R$ 258 mil de `simples_faturamento` (que nem deveria estar num painel de vendas).

E o campo que separaria provisório de efetivo, `parcela_faturada`, vem **`false` em
100% das 5.115 parcelas** , o Odoo do cliente não o usa. A separação tem que sair da
**nota emitida**.

---

## 3. Decisões do dono (2026-07-13) , não rediscutir

1. **Locais:** `Próprio` = físico; `Terceiros / Demonstração` = painel próprio; resto
   (`Virtual`, `Terceiros`, `Feira`, `Patrimônio`, `Compras`) fora do valor de estoque.
2. **Exceções dentro de `Próprio`:** `Showroom` (35) e `JDS DEMO SÃO PAULO` (414) →
   **demonstração**. `ASTEC` (29-34), `INATIVO` (14, 271) e `CASA DO ÍCARO` (242, 243) →
   **fora** do físico vendável.
3. **B-04 e KPI de demanda:** ambos passam a ser **a custo**, sobre a **quantidade a
   atender**. O KPI "a entregar" deixa de ser a preço de venda, para ficar coerente com
   a tabela. Custo = `fato_produto.preco_custo` (o custo da linha do pedido vem zerado
   no Odoo: R$ 147 mil em R$ 62 mi , medido).
4. **Pedido com etapa aberta mas 100% atendido** (54 pedidos, R$ 10,4 mi de cabeçalho):
   **continua na demanda, com valor R$ 0,00**. A regra da Mariane (por etapa) fica
   intacta; o valor zerado expõe o pedido cuja esteira parou.
5. **Necessidade de compra:** **estoque nacional** (bolo único , a operação transfere
   entre filiais), **com drill-down obrigatório por depósito físico**.
6. **Não filtrar produto por tipo SPED.** O dono confirmou: **a empresa não fabrica
   nada, importa e revende**. O tipo `'04'` ("produto acabado") de 136 produtos é
   inconsistência de cadastro do Odoo, não realidade operacional. O painel mostra tudo
   que falta comprar.
7. **Formas de pagamento:** só **vendas efetivas (faturadas)**.

---

## 4. A regra de demanda em aberto que vamos reusar (canônica, não muda)

Fonte: `docs/superpowers/specs/pericia-fluxos-2026-07/03-classificacao-demanda-e-faturamento.md`
e `09-PERGUNTA-MARIANE-VENDA-FUTURA.md`. Implementação:
`src/lib/fiscal/regras/classifica-etapa-demanda.ts` + `classifica-operacao.ts` →
`fato_pedido.bucket_demanda`.

Um pedido é **demanda aberta** quando: a operação é venda externa (CFOP `venda` /
`exportacao`, não intragrupo; simples faturamento 5922/6922 **não** é demanda , a
demanda é a remessa x117); a etapa atual não é terminal de venda nem cancelamento; com
a **exceção da Mariane**: `Nota emitida e não entregue` conta como **ABERTA** mesmo com
nota emitida.

**Esta spec não altera essa regra.** Ela só passa a usar, dentro dos pedidos já
classificados como ABERTA, a **quantidade que falta atender** em vez da cheia.

**Achado a registrar (não corrigir agora):** 2 pedidos em etapa **`Cancelado`**
(R$ 60.575) estão classificados como `ABERTA` , a etapa não tem
`finaliza_pedido_cancelando` marcada no Odoo. Vai para o `docs/RADAR.md`, não é escopo
desta entrega.

---

## 5. O que será construído

### 5.1 Fundação , classificação de local (por árvore, não por texto)

Novo fato **`fato_estoque_local`**, construído de `raw_estoque_local`:
`odooId`, `nome`, `nomeCompleto`, `tipo` (`S`/`A`), `nivel`, `localSuperiorId`,
`parentPath` e a coluna derivada **`classificacao`**.

Regra pura e testável em `src/lib/estoque/classificacao-local.ts`:

```
1. exceção explícita por odoo_id (tabela abaixo)  -> vence tudo
2. nome_completo começa com "Terceiros / Demonstração" -> "demonstracao"
3. raiz (1º segmento de nome_completo) == "Próprio"    -> "fisico"
4. qualquer outro caso                                  -> "fora"
```

Exceções por id (decisão #2):

| ids | local | classificação |
|---|---|---|
| 35, 414 | Showroom, JDS DEMO SÃO PAULO | `demonstracao` |
| 29, 30, 31, 32, 33, 34 | ASTEC BA/CE/DF/MG/SE/SP (assistência técnica) | `fora` |
| 14, 271 | INATIVO (nome duplicado , por isso a exceção é por **id**) | `fora` |
| 242, 243 | CASA DO ÍCARO SE / BSB | `fora` |

**Fail-closed:** local sem cadastro no raw, ou com `nome_completo` vazio, é
`fora` , nunca inflar o físico com o que não se sabe classificar. (Medido hoje: 0
locais órfãos e 0 `nome_completo` nulos, mas a regra é explícita.)

As queries de estoque passam a **juntar por `local_id`** com esse fato. **Proibido**
classificar por string de `local_nome`.

### 5.2 Estoque , KPIs e painéis por classificação

- KPI "Valor em estoque" (A-01/A-09) e os painéis A-02, A-03, A-04, A-05, A-11:
  **só `classificacao = 'fisico'`**.
- Novo painel **"Estoque em demonstração"**: valor, unidades, nº de locais e a lista por
  cliente/local.
- A-02 ("Estoque por local") passa a exibir a classificação de cada local.

**Aceite:** KPI de estoque = **~R$ 31,42 mi** (R$ 29.849.890 / 0,95); demonstração =
**R$ 1.562.449** em **35 locais**; Virtual e Terceiros ausentes de ambos.

### 5.3 Seriais (A-06) , serial, local e saldo

Hoje o A-06 lê `fato_serial`: **3.828 "em estoque", 0 com local** (o builder só preenche
local de quem já saiu). A tela mostra 2 colunas (serial, produto) e nenhum saldo.

Fonte certa, já no cache e sem nenhum consumidor:
**`raw_estoque_saldo_rastreabilidade_hoje`** (4.804 linhas) , tem `lote_serie_id` +
`local_id` + `produto_id` + `saldo`.

Novo fato **`fato_serial_saldo`**: serial, produto, local, **classificação do local**,
saldo, valor. O A-06 passa a listar **só saldo > 0**, com colunas
**Serial · Produto · Local · Classificação · Saldo**, filtrável por classificação
(físico por padrão).

**`fato_serial` (o antigo) vira legado**: continua sendo construído (nada mais depende
dele além do KPI "seriais em estoque" e do A-09), mas **a verdade de "serial em estoque"
passa a ser o `fato_serial_saldo`**. O KPI de seriais e o A-09 passam a ler a fonte
nova, para a plataforma não mostrar dois números diferentes. Registrar no RADAR a
remoção futura do `fato_serial`.

**Aceite (medido):** 1.219 seriais em `Jds - Matriz DF`, 749 em `Jds - Filial SE`, 527
em `Jds - Filial SP` (= 2.495 físicos); 1.225 em `Virtual` e 364 em `Terceiros` ficam
fora do padrão físico.

### 5.4 Ingestão , atendimento do item de pedido (o ponto mais delicado)

**Por que `extraFields` sozinho NÃO resolve (achado bloqueante da review #1):**
o sync incremental filtra `write_date > since` (`src/worker/sync/incremental.ts:60-64`),
mas **o `write_date` do item do pedido não muda quando a entrega acontece** , quem nasce
é outro registro. Provado ao vivo: item de pedido 254221 com `write_date` de
**2026-06-23**, atendido por uma NF criada em **2026-06-30** (7 dias depois). O campo
computado entraria no cache uma vez e **congelaria no valor pré-entrega** , o mesmo bug,
só que mais difícil de enxergar.

**Solução: ciclo dedicado de atendimento.**

1. **`extraFields` no `MODEL_CATALOG`**: permite declarar campos computados por modelo,
   consumido por `getModelFields` (que hoje descarta todo `store=false`). Para
   `sped.documento.item`: `quantidade_a_atender_pedido`, `quantidade_atendida_pedido`.
2. **Ciclo próprio, fora do incremental**: um job que faz `search_read` dos itens com
   `pedido_id != false` **ignorando `write_date`**, e atualiza só essas colunas.
   **Custo medido: 83,4 s para os 23.365 itens** (3,57 ms/linha). Roda no **ciclo
   diário** (junto do snapshot/reconcile), **não** no incremental de 3 min.
   Justificativa de frequência: a demanda a atender é indicador de diretoria, não de
   operação minuto a minuto; e o custo/benefício de 83 s a cada 3 min não se paga.
3. **Fato:** `fato_pedido_item` ganha `quantidadeAAtender` e `quantidadeAtendida`.
4. **Fix do fantasma (P4):** `AND i.raw_deleted = false` em
   `src/worker/fatos/fato-pedido-item.ts:39`.

**Não** vamos tentar derivar o atendimento em SQL a partir de `pedido_item_id` ou da
tabela `sped.documento.item.pedido.atendido`: a review testou e **não reproduz** , essa
tabela tem 19 linhas no Odoo inteiro contra 3.010 itens com atendimento > 0, e há item
com `item_atendido_pedido_ids = []` e `quantidade_atendida_pedido = 4`. O campo do Odoo
é a única verdade acessível.

### 5.5 B-04 , pedidos pendentes pelo que falta atender

```
valor_a_atender(pedido) = Σ nas linhas vivas do pedido:
      quantidade_a_atender(linha) × preco_custo(produto)
```

- Custo de `fato_produto.preco_custo`. Cobertura medida: **só 27 itens (0,6%) e 25
  unidades (0,4%) da demanda estão sem custo** , o risco de subestimar é desprezível,
  mas o painel deve expor a contagem de itens sem custo (como o KPI de estoque já faz).
- **11 produtos (19 itens) não existem em `fato_produto`** , entram com custo 0. Também
  devem ser contados e expostos, nunca sumir em silêncio.
- Pedido com `a_atender = 0` (etapa aberta, tudo entregue): **permanece listado com
  R$ 0,00** (decisão #4).
- O **KPI B-01 "a entregar" passa a ser a custo** também (decisão #3), para tabela e
  indicador falarem a mesma língua.

**Impacto medido (338 pedidos ABERTA + corte):**

| Base | Valor |
|---|---:|
| Cabeçalho a preço de venda (hoje) | R$ 63.035.755 |
| A custo, quantidade cheia | R$ 34.555.772 |
| **A custo, a atender (o que vai ao ar)** | **R$ 21.347.486** |

### 5.6 Necessidade de compra , painel novo

Consolidado **nacional** (decisão #5), por produto:

```
demanda_a_atender(produto) = Σ quantidade_a_atender das linhas VIVAS de pedidos
                             com bucket_demanda = 'ABERTA'
                             e data_orcamento >= corte de dados
saldo_fisico(produto)      = Σ quantidade dos saldos em locais classificacao='fisico'
necessidade(produto)       = max(0, demanda_a_atender − saldo_fisico)
custo_estimado(produto)    = necessidade × preco_custo
```

Colunas: Produto · Demanda a atender · Saldo físico · **Falta comprar** · Custo estimado.
Ordenado pela maior falta.

**Drill-down por depósito (obrigatório, decisão #5):** cada linha abre a quebra do
**saldo físico por depósito** (Jds Matriz DF, Jds Filial SE, Jds Filial SP, Jib DF),
para o time ver onde a mercadoria está e decidir entre **transferir** ou **comprar**. A
necessidade em si continua nacional , é a decisão de compra do grupo.

**Aceite:** com a fórmula da v1 (quantidade cheia, saldo total) o painel daria 1.914
unidades / 225 produtos / R$ 9,85 mi. Com a fórmula correta (a atender × saldo físico) o
número será **outro** e será medido e registrado na verificação , é justamente a soma dos
três bugs corrigidos.

**Fora de escopo:** lead time, estoque em trânsito (ordens de compra abertas, que
existem em `fato_compra.recebida = false`) e estoque mínimo. Fica documentado como
segunda onda.

O A-12 ("Estoque disponível") é corrigido pela **mesma base** (saldo físico + quantidade
a atender + itens vivos) e passa a ser a visão "disponível"; a necessidade é a visão do
"déficit". **Os dois têm que fechar entre si** , é critério de aceite.

### 5.7 Formas de pagamento (C-07) , só venda efetiva

**O link existe:** `sped.documento` tem `pedido_id` (3.020 das 13.246 notas).

**Definição de "venda efetiva":** o pedido tem **ao menos uma nota de venda externa
autorizada** (mesmo predicado `isVendaExterna` do faturamento,
`src/lib/fiscal/regras/nota-venda-externa.ts`). Isto substitui o `parcela_faturada`,
inútil no cache.

Decisões que a review #1 exigiu e ficam fixadas aqui:

- **Data de referência:** a data de emissão da **primeira** nota de venda externa
  autorizada do pedido (o momento em que a venda se concretizou). O painel recorta por
  essa data, não pelo vencimento da parcela , assim fica comparável com o faturamento
  exibido ao lado.
- **Pedido parcialmente faturado:** **todas** as parcelas dele entram. A forma de
  pagamento é atributo do **pedido**, não da nota; e a cobrança do pedido é única.
- **Limite de cobertura, declarado:** das 1.227 notas de venda externa autorizadas,
  **886 têm `pedido_id` (72%)**. Venda faturada **sem pedido vinculado não tem parcela
  no cache** e, portanto, **nunca apareceu neste painel** , nem antes, nem depois. Isto
  **não é regressão**, é limite da fonte. A tela deve dizer, em texto curto, que o painel
  cobre as vendas originadas de pedido.

A query passa a: filtrar `categoriaOperacao = 'venda'`; exigir venda efetiva; recortar
pela data da venda; e respeitar **empresa** e **UF** como as demais queries de vendas.

O balde **"Não informado" permanece visível**: passa a significar "venda faturada cuja
forma de pagamento não foi preenchida no Odoo" , resíduo real e acionável. A tela traz
um texto curto explicando isso.

**Aceite:** os R$ 19,81 mi de pedidos abertos e os R$ 258 mil de simples faturamento
saem do painel. O "Não informado" resultante será medido e registrado (esperado: da
ordem dos R$ 3 mi dos pedidos fechados).

### 5.8 Auditoria de `raw_deleted` nos builders (dívida achada, escopo mínimo)

Além do fix de `fato-pedido-item.ts`, **auditar todos os builders de
`src/worker/fatos/`** e verificar quais leem raw sem filtrar `raw_deleted`. Para cada um:
medir quantas linhas mortas ele ingere hoje; corrigir os que vazam; registrar os demais.
Medido até agora: `fato_pedido` e `fato_pedido_parcela` não vazam; `fato_pedido_item`
vaza 1.007.

Isto é escopo desta entrega **porque a necessidade de compra e o B-04 dependem de fatos
limpos** , não é refactor oportunista.

---

## 6. Impacto nos números (o que a diretoria vai ver mudar)

| Indicador | Hoje | Depois |
|---|---:|---:|
| KPI Valor em estoque | ~R$ 50,24 mi | **~R$ 31,42 mi** |
| Estoque em demonstração | (não existe) | **R$ 1,56 mi** |
| Pedidos pendentes / KPI a entregar | R$ 63,04 mi (venda, cheio) | **R$ 21,35 mi** (custo, a atender) |
| Seriais listados | 3.828, sem local, sem saldo | **2.495 físicos**, com local e saldo |
| "Não informado" (pagamentos) | R$ 23,08 mi | resíduo de venda faturada |
| Necessidade de compra | (não existe) | painel novo, com drill-down por depósito |

**Estes números vão cair, e isso é a correção.** O estoque não encolheu: a conta passou
a considerar só o que é da empresa e está em casa. A demanda não sumiu: passou a contar
só o que falta entregar, a custo.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| **Campo computado congelar** (bloqueante da review) | Ciclo dedicado de re-fetch (§5.4-2), fora do incremental. Teste de regressão que prova que o valor atualiza após uma entrega |
| Ciclo de 83 s pesar no worker | Roda no ciclo diário, não no de 3 min. Medir no ciclo real antes de subir. O worker já teve OOM (ver RADAR) , medir memória |
| Fix de `raw_deleted` mudar números de outros fatos | Auditar builder a builder, medindo antes/depois (§5.8). Nenhum fix cego |
| Locais mudarem no Odoo | Classificação lê a árvore a cada rebuild; exceções são por **id**, não por nome (nomes se repetem , há dois `INATIVO`) |
| Cliente estranhar a queda dos números | `docs/kpis-diretoria.md` atualizado no mesmo commit (regra do projeto). Comunicar o "porquê" junto com o "quanto" |
| Novas consultas ignorarem a classificação | A classificação vive num módulo único + no fato; queries fazem join, nunca string matching |

---

## 8. Fora de escopo

- Lead time, estoque em trânsito e estoque mínimo na necessidade de compra (2ª onda).
- Necessidade de compra **por empresa/filial** (a decisão #5 é nacional + drill-down de
  saldo por depósito). O saldo no cache não tem empresa, só local.
- Reativar os filtros globais família/marca/local (código morto: `derivar-estoque.ts`,
  `construtor-estoque.tsx`) , RADAR.
- Unificar a valorização entre Diretoria (`qtd × preco_custo ÷ índice`) e Relatórios
  (`vr_saldo` do Odoo) , RADAR.
- Etapa `Cancelado` classificada como ABERTA (2 pedidos, R$ 60.575) , RADAR.
- Drift da SPEC v3 da perícia (venda futura) , RADAR.

---

## 9. Critérios de aceite

1. **Estoque:** KPI = **~R$ 31,42 mi** (só `fisico`); painel de demonstração =
   **R$ 1.562.449 / 35 locais**; Virtual e Terceiros ausentes de ambos.
2. **Seriais:** A-06 lista **só saldo > 0**, com **local** preenchido; **2.495** seriais
   físicos (1.219 + 749 + 527); KPI de seriais lê a mesma fonte da tabela.
3. **Fatos limpos:** `fato_pedido_item` não contém nenhuma linha `raw_deleted` (hoje
   1.007). Critério: contagem do fato = itens **vivos com `quantidade > 0`** no Odoo
   (**não** o total de itens , o fato só ingere `quantidade > 0`).
4. **Atendimento atualiza:** teste que prova que, após uma entrega, o
   `quantidade_a_atender` do item muda no cache (o bug do `write_date` não volta).
5. **B-04:** valor = a atender × custo (**R$ 21,35 mi** no baseline); pedido
   parcialmente entregue mostra só o saldo (validar em `PV-2051/26` e nos 143 pedidos
   com atendimento parcial); pedido 100% atendido aparece com R$ 0,00.
6. **Necessidade de compra** fecha com o A-12 corrigido; drill-down por depósito
   funcionando.
7. **C-07:** só venda efetiva, recorte pela data da venda, empresa e UF respeitadas;
   "Não informado" explicado na tela; número novo medido e registrado.
8. **`docs/kpis-diretoria.md` atualizado no mesmo commit** de cada mudança de KPI.
9. **E2E contra o cache real** antes de declarar pronto (regra de raiz do projeto):
   subir o serviço, popular os fatos, conferir cada número desta seção.
