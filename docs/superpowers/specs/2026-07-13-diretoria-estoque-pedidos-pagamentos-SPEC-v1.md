# SPEC v1 , Diretoria: estoque por local, pedidos a atender, pagamentos efetivos

**Data:** 2026-07-13
**Branch:** `feat/diretoria-estoque-pedidos-pagamentos`
**Origem:** pedido de ajuste do colaborador da Matrix Fitness (repassado pelo dono do
projeto), somado à perícia contra o cache real de produção feita nesta sessão.

---

## 1. Por que esta spec existe

Um colaborador da Matrix apontou cinco incômodos na área **Diretoria**. A perícia
contra o dado real confirmou os cinco e encontrou **mais dois bugs** que ninguém
tinha pedido. Todos têm a mesma raiz: **a plataforma trata o estoque e o pedido como
se fossem um número só no cabeçalho**, quando na verdade os dois são compostos (por
local, e por linha parcialmente atendida).

Os números abaixo foram medidos no cache real em 2026-07-13. Eles são a régua de
aceite desta entrega.

---

## 2. Os sete problemas (com o dado que os prova)

### P1 , O valor de estoque soma locais que não são estoque nosso

A árvore de locais (`raw_estoque_local.data->>'nome_completo'`) tem 3 raízes. A tela
soma todas, sem distinção:

| Subárvore | Locais com saldo | Valor a custo | Deveria entrar no "físico"? |
|---|---:|---:|---|
| `Próprio` | 4 | **R$ 29.884.138** | sim |
| `Virtual` | 1 | R$ 10.243.114 | não |
| `Terceiros` (raiz, direto) | 1 | R$ 6.071.867 | não |
| `Terceiros / Demonstração` | 34 | R$ 1.528.200 | não (painel próprio) |
| **Total exibido hoje** | 41 | **R$ 47.727.321** | |

O KPI "Valor em estoque" da Diretoria mostra hoje **60% a mais** do que o estoque
físico real da empresa.

Existem ainda 3 subárvores hoje **sem saldo**, mas que podem receber saldo a qualquer
momento: `Terceiros / Feira`, `Terceiros / Patrimônio`, `Terceiros / Compras`.

**Armadilha:** `Demonstração` é **filha de `Terceiros`**. Uma regra ingênua do tipo
"exclua tudo que tem Terceiros no nome" apagaria a demonstração junto. A classificação
tem que ser **por subárvore, na ordem certa** (demonstração antes de terceiros).

**Armadilha 2:** o nome que está no fato (`fato_estoque_saldo.local_nome`) é o
`display_name` do Odoo, **invertido e com `»`** (ex.: `Jds - Matriz DF » Próprio`,
`... » Demonstração » Terceiros`). O `nome_completo` hierárquico ( `Próprio / Jds -
Matriz DF`) só existe no JSONB de `raw_estoque_local`. **Classificar por string do
`local_nome` é frágil.** A classificação tem que ser feita a partir da **árvore** (por
`local_id`), não do texto desnormalizado.

### P2 , Estoque de demonstração misturado com estoque vendável

R$ 1,53 mi em 34 locais de clientes (condomínios, academias) aparecem hoje dentro do
estoque disponível. Não são vendáveis: são equipamentos em demonstração na casa do
cliente.

### P3 , B-04 "Pedidos pendentes" soma o pedido inteiro, não o que falta entregar

`src/lib/diretoria/queries/pedidos.ts:192` , o valor da linha é
`Number(p.vrProdutos)`, o **cabeçalho** de `fato_pedido`. Nenhuma query de `pedidos.ts`
lê `fato_pedido_item`.

Consequência medida: **R$ 62,77 mi** em pedidos abertos, sem abater uma única unidade
já entregue. Um pedido com 10 itens, 6 entregues e 4 pendentes, aparece pelos 10.

**Causa técnica:** os campos que dão a resposta , `quantidade_a_atender_pedido` e
`quantidade_atendida_pedido` , são **computados não-armazenados** (`store=false`) no
Odoo, e `src/worker/odoo/field-selection.ts:46` filtra `f.store === true`. Eles nunca
entraram no cache.

**Comprovado ao vivo (2026-07-13):** o Odoo **entrega** esses campos por
`read`/`search_read` normalmente. Teste: `search_read` de 500 itens com
`quantidade_a_atender_pedido` respondeu em **2,3 s**. Total de itens com `pedido_id`
no Odoo: **23.335**.

### P4 , O cache tem 1.008 itens de pedido fantasma (bug não pedido)

- Itens com `pedido_id` **no Odoo**: 23.335
- Itens com `pedido_id` **no nosso cache**: 24.343

Diferença: **1.008 linhas** que já não existem no Odoo e continuam no cache. Prova
pontual: o pedido `PV-2051/26` (odoo_id 2348) tem **4 itens** no Odoo (R$ 512.909,54 ,
que bate exatamente com o `vr_produtos` do cabeçalho) e **42 itens** no nosso cache
(R$ 1,19 mi). O item 246552, presente no nosso cache, **não existe mais** no Odoo.

Isso infla `fato_pedido_item` (soma R$ 65,30 mi contra R$ 62,77 mi do cabeçalho) e
contamina **qualquer** cálculo por linha , incluindo o A-12 e a necessidade de compra
que esta spec vai construir. **Corrigir isto é pré-requisito de P3, P5 e P6.**

### P5 , A-12 "Estoque disponível (a comprar)" compromete quantidade cheia

`src/lib/diretoria/queries/estoque.ts:715-743` subtrai do saldo a
`fato_pedido_item.quantidade` , a quantidade **total** da linha do pedido aberto, não
o que falta atender. Um pedido 90% entregue ainda trava 100% do estoque.

É o mesmo defeito de P3, na outra ponta. Some-se a P1 (o saldo do A-12 inclui Virtual
e Terceiros) e o "disponível" de hoje é duplamente errado.

### P6 , Não existe painel de necessidade de compra

O colaborador quer, abaixo do estoque, o quanto falta comprar. Hoje o A-12 dá apenas a
contagem de negativos.

**Bloqueio confirmado:** `fato_estoque_min_max` está **vazia** (0 linhas). O Odoo do
cliente **não tem estoque mínimo / ponto de pedido** preenchido. Logo, necessidade de
compra **não pode** ser `mínimo − saldo`.

**Decisão do dono (2026-07-13):** reusar a **lógica de demanda em aberto já canônica**
(definida com a Mariane, admin comercial do cliente), a mesma que alimenta faturamento
e demanda. Ver §4.

### P7 , Formas de pagamento (C-07) mistura provisório com efetivo

`src/lib/diretoria/queries/vendas.ts:65-104` é o **outlier** do módulo: é a única query
de `vendas.ts` que não filtra venda externa, não filtra `categoriaOperacao='venda'`,
não aplica empresa nem recorte de UF, e recorta por **`dataVencimento`** em vez da data
da venda.

Medido no cache:

| Balde | Parcelas | Valor |
|---|---:|---:|
| Boleto | 1.730 | R$ 25.308.709 |
| **"Não informado"** | **1.217** | **R$ 23.079.660** |
| Cartão / PIX / Transferência / demais | 2.168 | R$ 5.786.902 |

O "Não informado" é o **segundo maior balde** (43% do valor). Origem, medida:

- É `pedido.parcela.forma_pagamento_id` **vazio no Odoo** (campo opcional). Não há
  fallback em `vendas.ts:84` (`?? "Não informado"`).
- **R$ 19,81 mi (759 parcelas) vêm de pedidos de venda ainda ABERTOS** , ou seja,
  ainda não faturados: a forma de pagamento naturalmente ainda não foi definida.
- R$ 3,01 mi vêm de pedidos FECHADOS; R$ 258 mil de `simples_faturamento` (que nem
  deveria estar no painel de vendas).

**Descoberta que fecha a pergunta do colaborador ("o sistema está apontando contas
provisórias ou efetivas?"): está apontando as duas, misturadas.** E o campo que
serviria para separá-las, `parcela_faturada`, vem **`false` em 100% das 5.115
parcelas** do cache , o Odoo do cliente não o utiliza. A separação tem que ser feita
pela **nota emitida**, não por esse flag.

---

## 3. Decisões do dono (2026-07-13) , não rediscutir

1. **Locais:** `Próprio` = estoque físico. `Terceiros / Demonstração` = painel próprio.
   Todo o resto (`Virtual`, `Terceiros` direto, `Feira`, `Patrimônio`, `Compras`) fica
   **fora** do valor de estoque.
2. **B-04:** valor a atender = `quantidade a atender × custo`. Como o custo na linha do
   pedido vem **zerado** no Odoo (medido: R$ 147 mil em R$ 62 mi de pedidos), o custo
   sai de **`fato_produto.preco_custo`** , a mesma fonte do valor de estoque, para que
   as telas fechem entre si.
3. **Formas de pagamento:** só **vendas efetivas (faturadas)**. O "Não informado" que
   sobrar é resíduo real de cadastro.
4. **Necessidade de compra:** reusa a **demanda em aberto canônica**, já implementada.

---

## 4. A regra de demanda em aberto que vamos reusar (já canônica)

Fonte: `docs/superpowers/specs/pericia-fluxos-2026-07/03-classificacao-demanda-e-faturamento.md`
e `09-PERGUNTA-MARIANE-VENDA-FUTURA.md`. Implementação:
`src/lib/fiscal/regras/classifica-etapa-demanda.ts` + `classifica-operacao.ts`,
materializada em `fato_pedido.bucket_demanda`.

Um pedido está em **demanda aberta** quando:
- a operação é venda externa (CFOP de categoria `venda`/`exportacao`, não intragrupo);
  simples faturamento (5922/6922) **não** é demanda , a demanda é a remessa x117;
- a etapa atual não é terminal de venda (sem `finaliza_faturamento` /
  `finaliza_pedido_confirmando`) e não é cancelamento;
- **exceção da Mariane:** a etapa `Nota emitida e não entregue` conta como **ABERTA**
  mesmo tendo nota (a mercadoria não saiu).

**Esta spec não altera essa regra.** Ela apenas passa a usar, dentro dos pedidos já
classificados como ABERTA, a **quantidade que falta atender** em vez da quantidade
cheia.

---

## 5. O que será construído

### 5.1 Fundação , classificação de local por árvore

Novo fato **`fato_estoque_local`** (construído de `raw_estoque_local`), com:
`odooId`, `nome`, `nomeCompleto`, `tipo`, `nivel`, `localSuperiorId` e a coluna
derivada **`classificacao`**.

Regra pura, testável, em `src/lib/estoque/classificacao-local.ts`:

```
raiz = primeiro segmento de nome_completo (split por " / ")
se nome_completo começa com "Terceiros / Demonstração" -> "demonstracao"
senão se raiz == "Próprio"                              -> "fisico"
senão                                                    -> "fora"   (Virtual, Terceiros, Feira, Patrimônio, Compras)
```

A ordem importa: **demonstração é testada antes de terceiros**.

Locais desconhecidos / sem cadastro no raw: classificação **`fora`** (fail-closed , não
inflar o físico com o que não sabemos classificar). Hoje isso é 0 linhas (medido), mas
a regra precisa ser explícita.

As queries de estoque passam a **juntar por `local_id`** com esse fato. Não se
classifica por texto do `local_nome`.

### 5.2 Estoque , KPIs e painéis por classificação

- KPI "Valor em estoque" (A-01/A-09) e os painéis A-02, A-03, A-04, A-05, A-11:
  **só `classificacao = 'fisico'`**.
- Novo KPI/painel **"Estoque em demonstração"**: valor, unidades, nº de locais e a
  lista por cliente/local (`classificacao = 'demonstracao'`).
- O painel "Estoque por local" (A-02) passa a exibir a classificação de cada local, e
  não mistura mais os baldes.

Régua de aceite: valor em estoque **R$ 29.884.138** (±), demonstração **R$ 1.528.200**
(±). Virtual e Terceiros somem do KPI.

### 5.3 Seriais (A-06) , serial, local e saldo

Hoje o A-06 lê `fato_serial`, onde **100% dos seriais em estoque têm `local_nome`
nulo** (medido: 3.827 em estoque, 0 com local). O builder só preenche o local de quem
**já saiu**.

A fonte certa já está no cache e ninguém usa: **`raw_estoque_saldo_rastreabilidade_hoje`**
(4.804 linhas), que tem `lote_serie_id` + `local_id` + `produto_id` + `saldo`.

Novo fato **`fato_serial_saldo`**: serial, produto, local, classificação do local,
saldo, valor. O painel A-06 passa a listar **apenas seriais com saldo > 0**, com as
colunas **Serial · Produto · Local · Classificação · Saldo**, filtrável por
classificação (físico por padrão).

Régua de aceite (medido): 1.220 seriais em `Jds - Matriz DF » Próprio`, 749 em
`Jds - Filial SE`, 527 em `Jds - Filial SP`; 1.225 em `Virtual` e 364 em `Terceiros`
(que passam a ficar fora do padrão físico).

### 5.4 Ingestão , campos de atendimento do item de pedido

1. **Sync:** permitir campos computados **explicitamente declarados** por modelo. Novo
   campo `extraFields` na entrada do `MODEL_CATALOG`, consumido por
   `getModelFields`, que hoje descarta tudo que é `store=false`.
   Para `sped.documento.item`: `quantidade_a_atender_pedido`,
   `quantidade_atendida_pedido`.
   Risco medido e aceito: `search_read` com campo computado custa ~2,3 s / 500 linhas.
2. **Fato:** `fato_pedido_item` ganha `quantidadeAAtender` e `quantidadeAtendida`.
3. **Reconcile (P4):** os itens de pedido que não existem mais no Odoo precisam sair do
   cache (ou serem marcados como removidos e excluídos dos fatos). Hoje são 1.008.

### 5.5 B-04 , pedidos pendentes pelo que falta atender

Valor da linha do B-04 passa a ser:

```
valor_a_atender(pedido) = Σ sobre as linhas do pedido de:
    quantidade_a_atender(linha) × preco_custo(produto)
```

com `preco_custo` de `fato_produto` (o custo da linha do pedido vem zerado no Odoo).

O B-04 mantém as colunas atuais (Número, Cliente, UF, Etapa, Situação, Previsão) e a
coluna **Valor** passa a ser o valor **a atender, a custo**. O KPI de demandas (B-01)
passa a expor, ao lado do valor de venda a entregar, o **custo a atender**.

### 5.6 Necessidade de compra , painel novo

Abaixo do estoque, por produto:

```
demanda_a_atender(produto) = Σ quantidade_a_atender das linhas dos pedidos
                             com bucket_demanda = 'ABERTA'
                             e data_orcamento >= corte de dados
saldo_fisico(produto)       = Σ quantidade dos saldos em locais 'fisico'
necessidade(produto)        = max(0, demanda_a_atender − saldo_fisico)
```

Colunas: Produto · Demanda a atender · Saldo físico · **Falta comprar** · Custo
estimado da compra (`falta × preco_custo`). Ordenado pela maior falta.

O painel A-12 existente ("Estoque disponível (a comprar)") é **corrigido pela mesma
base** (passa a usar saldo físico e quantidade a atender) e passa a ser a visão
"disponível"; a "necessidade de compra" é a visão do déficit. Os dois têm que fechar
entre si.

**Fora de escopo:** lead time de fornecedor, estoque em trânsito (ordens de compra
abertas) e estoque mínimo. O A-12 e a necessidade olham só demanda × saldo. Se o
cliente quiser descontar compras a caminho, é uma segunda onda (o dado existe em
`fato_compra.recebida = false`).

### 5.7 Formas de pagamento (C-07) , só venda efetiva

`queryFormasPagamento` passa a:
1. considerar **apenas parcelas de pedidos de venda** (`categoriaOperacao = 'venda'`),
   eliminando compra, transferência e simples faturamento;
2. considerar **apenas vendas efetivas**: o pedido tem **nota de venda externa emitida
   e autorizada** (o mesmo predicado `isVendaExterna` que o faturamento usa,
   `src/lib/fiscal/regras/nota-venda-externa.ts`) , esta é a definição de "conta
   efetiva" que substitui o `parcela_faturada`, inútil no cache;
3. recortar pelo **período da venda** (data da nota), não pelo vencimento da parcela ,
   assim o painel fica comparável com o faturamento exibido ao lado;
4. respeitar **empresa** e o **recorte de UF** do usuário, como as demais queries de
   vendas.

O balde **"Não informado" permanece visível** (não some, não é escondido): ele passa a
significar exatamente "venda faturada cuja forma de pagamento não foi preenchida no
Odoo" , um resíduo real de cadastro, acionável pelo time. A tela deve trazer um texto
curto explicando isso.

**Meta de aceite:** o "Não informado" cai dos R$ 23,08 mi atuais para o resíduo das
vendas já faturadas (esperado: ordem de R$ 3 mi ou menos , os R$ 19,81 mi de pedidos
abertos saem do painel). O número exato será medido na verificação e registrado.

---

## 6. Impacto nos números (o que o dono vai ver mudar)

| Indicador | Hoje | Depois |
|---|---:|---:|
| Valor em estoque | R$ 47,73 mi | **R$ 29,88 mi** |
| Estoque em demonstração | (não existe) | **R$ 1,53 mi** |
| Pedidos pendentes (B-04) | R$ 62,77 mi (venda, cheio) | valor **a atender, a custo** |
| Seriais listados | 3.827, sem local | seriais **com saldo e local** |
| Formas de pagamento "Não informado" | R$ 23,08 mi | resíduo de venda faturada |
| Necessidade de compra | (não existe) | painel novo |

**Estes números vão cair, e isso é a correção.** Comunicar ao cliente: o estoque não
encolheu, a conta é que passou a considerar só o que é dele e está em casa.

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Sync de campo computado ficar lento e travar o worker | Medido: 2,3 s/500 linhas. Só `sped.documento.item`. Medir o ciclo completo antes de subir; se passar do aceitável, restringir aos itens com `pedido_id != false` |
| Remover itens fantasma apagar item bom | Reconcile por diferença contra o Odoo, com contagem antes/depois e log. Nunca apagar sem confrontar o Odoo |
| Nome/árvore de local mudar no Odoo | Classificação lê a árvore a cada rebuild do fato; não há string hard-coded fora do módulo puro |
| Cliente estranhar a queda do valor de estoque | Documentar em `docs/kpis-diretoria.md` no mesmo commit (regra do projeto) |
| Alguém criar consulta nova sem respeitar a classificação | A classificação vive num módulo único e no fato; as queries fazem join, não string matching |

---

## 8. Fora de escopo

- Lead time, estoque em trânsito e estoque mínimo na necessidade de compra.
- Reativar os filtros globais família/marca/local (código morto: `derivar-estoque.ts`,
  `construtor-estoque.tsx`). Fica registrado no RADAR.
- Unificar o critério de valorização entre Diretoria (`quantidade × preco_custo ÷
  índice`) e Relatórios (`vr_saldo` do Odoo). Registrar no RADAR.
- Correção do drift de documentação da SPEC v3 da perícia (venda futura).

---

## 9. Critérios de aceite

1. KPI de estoque = **R$ 29,88 mi** (só `Próprio`), demonstração em painel próprio com
   **R$ 1,53 mi**; Virtual e Terceiros ausentes de ambos.
2. A-06 lista **só seriais com saldo > 0**, com **local** preenchido e classificação.
3. `fato_pedido_item` tem `quantidade_a_atender` preenchida e **contagem de itens igual
   à do Odoo** (23.335 hoje) , os 1.008 fantasmas eliminados.
4. B-04 mostra valor **a atender × custo**; um pedido parcialmente entregue mostra só o
   saldo (validar em `PV-2051/26` e nos demais pedidos fracionados).
5. Painel de necessidade de compra fecha com o A-12 corrigido.
6. C-07 considera só venda de fato faturada, recortada pela data da venda, com empresa
   e UF respeitadas; "Não informado" explicado na tela.
7. `docs/kpis-diretoria.md` atualizado no mesmo commit de cada mudança de KPI.
8. E2E contra o cache real: números conferidos e registrados antes de declarar pronto.
