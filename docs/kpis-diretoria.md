# KPIs da Diretoria , base de cálculo de cada número

> Perícia de **2026-07-12**, feita contra o banco de **PRODUÇÃO** a pedido do dono. Cada
> número desta página foi conferido em SQL, não deduzido do código.
>
> Este é o documento de consulta: **se alguém perguntar "de onde vem esse número?", a resposta
> está aqui.** Ao mudar uma regra de KPI, atualize esta página no mesmo commit.

---

## Regra que vale para TODOS os números

**A data de início das análises** (Configuração > "Analisar dados a partir de", padrão
**16/03/2026**) é o **piso de tudo o que se lê**. Nenhum KPI enxerga documento anterior a ela.
É um FILTRO: nada é apagado, e mover a data para trás traz o histórico de volta na hora.

Dois recortes se aplicam quando ativos: o **período** escolhido na barra (afeta faturamento,
ticket médio e o mapa) e a **empresa** do grupo. Estoque, contas e demandas **não** têm recorte
por empresa no cache , quando o filtro de empresa está ligado, o card avisa "grupo inteiro".

---

## 1. Faturamento , R$ 7.242.504,80 (julho/2026, 136 notas)

**Fonte:** `fato_nota_fiscal`, somando `vr_nf` das notas com `is_venda_externa = true`, no
período escolhido (por `data_emissao`).

`is_venda_externa` é materializada pelo worker na mesma transação que reconstrói a nota, e a
regra é a **OPERAÇÃO FISCAL** da própria nota (`operacao_nome`), que é o que o Odoo usa. Uma
nota só é faturamento quando:

| Condição | Por quê |
|---|---|
| operação contém **"venda"** | é o critério do Odoo, não o CFOP |
| operação **não** contém "interna" | "venda interna" é transferência entre empresas do grupo |
| operação **não** contém "imobilizado" | venda de ativo é baixa de bem, não receita |
| `finalidade_nfe <> '4'` | 4 = devolução/retorno |
| modelo **55 ou 65** | NF-e e NFC-e (03, 23 e CT-e ficam fora) |
| `entrada_saida = '1'` e `situacao_nfe = 'autorizada'` | saída, autorizada pela SEFAZ |
| destinatário **fora do grupo** | o que circula dentro de casa não é receita |

Antes (regra por natureza/CFOP) o número inflava ~74%: nem a natureza nem o CFOP separam
"venda" de "venda interna", porque as duas usam CFOP de venda.

---

## 2. Ticket médio , R$ 54.049 (134 pedidos)

**Fórmula:** `Faturamento do período ÷ número de PEDIDOS de venda do período`.

- Numerador: o mesmo faturamento do card anterior (R$ 7.242.505 em julho).
- Denominador: `fato_pedido` com `categoria_operacao = 'venda'`, contando por `data_orcamento`
  no período (**134** pedidos em julho).

Conferido em produção: 7.242.505 / 134 = **R$ 54.049**.

> **Atenção à leitura**: o numerador conta **notas emitidas** e o denominador conta **pedidos
> abertos** no mesmo período. Não é "valor médio por nota", é o faturamento do mês dividido
> pelos pedidos que nasceram no mês. Serve para acompanhar tendência, não como valor exato de
> um pedido médio.

---

## 3. A receber , R$ 17.786.659 (e R$ 31.268.253 em carteira a faturar)

Este era o número mais errado da tela: mostrava **R$ 49,2 milhões**.

**Fonte:** `fato_financeiro_titulo`, `tipo = 'a_receber'`, `vr_saldo > 0` (em aberto: exclui
quitado e baixado), `data_documento >= data de início das análises`, **excluindo títulos de
empresas do próprio grupo** (conta entre irmãs não é dinheiro a receber de cliente).

**O que estava inflando:** o Odoo da Tauga gera o financeiro de **dois jeitos** , pelo
**PEDIDO** ("financeiro pelo pedido") ou pela **NOTA** (duplicata) , e o cache não guardava a
origem do título. Resultado: pedidos que **nunca emitiram nota** entravam como dinheiro a
receber. Composição real, em produção:

| Bucket | Títulos | Valor |
|---|---|---|
| **A receber** , duplicata de NF (faturado) | 366 | R$ 11.475.135 |
| **A receber** , título de pedido **já faturado** | 1.000 | R$ 6.311.524 |
| **Carteira a faturar** , pedido **sem nenhuma nota** | 1.580 | **R$ 31.268.253** |
| Excluído , dupla contagem (pedido com título E duplicata) | 1 | R$ 145.602 |

- **"A receber" = R$ 17.786.659** (os dois primeiros): mercadoria faturada, dinheiro que a
  empresa tem direito de cobrar.
- **"Carteira a faturar" = R$ 31.268.253**: receita contratada, parada em etapas
  pré-faturamento (gera boleto, fracionar, input financeiro). **Não é conta a receber.**
- A **dupla contagem** morre porque, quando o pedido tem os dois títulos abertos, a duplicata
  da NF manda e o título do pedido sai.

Para isso, `fato_financeiro_titulo` passou a materializar `pedido_id`, `nota_fiscal_id` e
`pedido_faturado` (este último = o pedido de origem já tem NF de venda autorizada).

Na tela: em **Pedidos**, os dois são cards separados. Na **Visão geral**, o card mostra o
recebível e cita a carteira no rodapé.

---

## 4. A pagar , R$ 45.224.021

**Fonte:** mesma tabela, `tipo = 'a_pagar'`, `vr_saldo > 0`, `data_documento >= início das
análises`, **sem títulos intragrupo**.

**Não tem o problema do "a receber"**: conferido em produção, **100% dos títulos a pagar são
duplicata de NF**. Não existe "a pagar" nascendo de pedido de compra sem nota, então não há
carteira a separar.

Inclui o **provisório** (lançado, não efetivado), que no a_pagar é a maior parte da dívida
(compras da Johnson etc.). O critério antigo (só `situacao = 'aberto'`) subreportava ~94%.

---

## 5. Valor em estoque , R$ 37.211.689 (1.959 produtos)

**Fórmula:** `soma(quantidade x preco_custo do produto)` sobre `fato_estoque_saldo`, cruzando
com `fato_produto.preco_custo`.

- É **foto do agora**, não histórico: a data de início das análises **não se aplica** (não
  existe "saldo de estoque em março").
- Mede a **CUSTO**, não a preço de venda. O `vr_saldo` que vem do Odoo é valorizado por outro
  critério e dava **R$ 45,7 mi** , 23% a mais. Hoje o KPI, o donut, o catálogo, as linhas
  granulares e o giro usam todos o mesmo custo.
- Produto com saldo e **sem custo cadastrado** entra com valor zero e aparece como gap
  (`produtosSemCusto`). Em produção há 52 linhas nessa situação.

---

## 6. Demandas a entregar , 331 (sendo 77 atrasadas)

**Fonte:** `fato_pedido` com `bucket_demanda = 'ABERTA'` e `data_orcamento >= início das
análises`. O valor a entregar é a soma de `vr_produtos`: **R$ 62.329.027**.

**"ABERTA"** é decidido pelos **gatilhos da própria etapa** do pedido no Odoo (não pelo nome
dela): a etapa não pode ter `finaliza_faturamento`, `finaliza_pedido_confirmando` nem
`finaliza_pedido_cancelando`. Ou seja: pedido de venda a cliente externo que **ainda não foi
faturado, concluído nem cancelado**.

**"Atrasadas" = 77**: dos 331 abertos, os que têm `data_prevista` **anterior a hoje**. É a data
prometida de entrega já vencida, com o pedido ainda aberto.

---

## O mapa por estado , e o balde "Sem UF" (R$ 450 mil)

**Cada estado** soma o `vr_nf` das mesmas notas do faturamento (venda externa, no período),
agrupadas pela **UF do CLIENTE**.

**A UF vem do CADASTRO do cliente** (`fato_parceiro.uf`, normalizado de "São Paulo (BR)" para
"SP"), **não da nota**. É por isso que existe "Sem UF" mesmo que o Odoo não emita nota sem
destinatário: o problema não é a nota, é o **cadastro do cliente**.

Composição dos R$ 450 mil de julho/2026, em produção:

| Causa | Notas | Valor |
|---|---|---|
| Cadastro do cliente **sem UF** no Odoo | 5 | R$ 423.818 |
| Participante da nota **não existe** em `fato_parceiro` | 3 | R$ 26.631 |

Os dois maiores são pessoas físicas: **GEORGE OLIVEIRA DA SILVA** (R$ 291.719) e **JOÃO ANNES
GUIMARÃES** (R$ 130.499).

**Não é erro de cálculo.** O dinheiro está certo e entra no faturamento total; ele só não sabe
em que estado se pintar. Duas saídas (decisão do dono):

1. **Corrigir o cadastro** desses clientes no Odoo , o mapa se resolve sozinho no próximo sync.
2. **Usar a UF do endereço de entrega da nota** como segunda fonte quando o cadastro não tiver.

---

## Onde cada coisa mora no código

| KPI | Arquivo |
|---|---|
| Faturamento, ticket médio, mapa por UF | `src/lib/diretoria/queries/vendas.ts` |
| Regra de venda (`is_venda_externa`) | `src/lib/fiscal/regras/nota-venda-externa.ts` |
| A receber / carteira, a pagar | `src/lib/reports/queries/financeiro.ts` |
| Origem do título (pedido x nota) | `src/worker/fatos/fato-financeiro-titulo.ts` |
| Valor em estoque | `src/lib/diretoria/queries/estoque.ts` |
| Demandas e atrasadas | `src/lib/diretoria/queries/pedidos.ts` |
| Bucket da demanda (ABERTA) | `src/lib/fiscal/regras/classifica-etapa-demanda.ts` |
| Empresas do grupo (intragrupo) | `src/lib/fiscal/grupo/` |
| Data de início das análises | `src/lib/corte-dados.ts` |
