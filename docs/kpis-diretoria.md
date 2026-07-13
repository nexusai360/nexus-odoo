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

## 1. Faturamento , R$ 7.247.814,80 (julho/2026, 142 notas)

**Fonte:** `fato_nota_fiscal`, somando `vr_nf` das notas com `is_venda_externa = true`, no
período escolhido (por `data_emissao`).

`is_venda_externa` é materializada pelo worker na mesma transação que reconstrói a nota, e a
regra é a **OPERAÇÃO FISCAL** da própria nota (`operacao_nome`), que é o que o Odoo usa. Uma
nota só é faturamento quando:

| Condição | Por quê |
|---|---|
| operação contém **"venda"**, OU é a **remessa de entrega futura** (CFOP 5117/6117) | é o critério do Odoo, não o CFOP do item |
| operação **não** contém "interna" | "venda interna" é transferência entre empresas do grupo |
| operação **não** contém "imobilizado" | venda de ativo é baixa de bem, não receita |
| operação **não** é o simples faturamento futuro (CFOP 5922/6922) | a cobrança antecipada não é receita do mês (ver abaixo) |
| `finalidade_nfe <> '4'` | 4 = devolução/retorno |
| modelo **55 ou 65** | NF-e e NFC-e (03, 23 e CT-e ficam fora) |
| `entrada_saida = '1'` e `situacao_nfe = 'autorizada'` | saída, autorizada pela SEFAZ |
| destinatário **fora do grupo** | o que circula dentro de casa não é receita |

Antes (regra por natureza/CFOP) o número inflava ~74%: nem a natureza nem o CFOP separam
"venda" de "venda interna", porque as duas usam CFOP de venda.

### Venda futura , a receita é a REMESSA, nunca o simples faturamento (dono, 2026-07-13)

A venda futura tem duas notas: a de **simples faturamento** (CFOP 5922/6922), que cobra o
cliente antes de entregar, e a **remessa** (CFOP 5117/6117), que entrega a mercadoria. A
receita entra **só na remessa**. A cobrança antecipada não conta no mês em que sai.

Nenhuma das duas operações tem a palavra "venda" no nome ("Simples Faturamento para Entrega
Futura 5922/6922", "Remessa de Mercadoria Originada de Encomenda 5117/6117"), então até o
PR #187 **as duas caíam fora** e a receita da venda futura não era contada em ponta nenhuma:
R$ 538 mil desde 16/03/2026 (mar R$ 28.261, abr R$ 134.796, mai R$ 244.473, jun R$ 127.225,
jul R$ 3.500). A regra passou a reconhecer a remessa e a excluir o simples faturamento de
forma explícita, pelo CFOP que a Tauga escreve no nome da operação.

Quem manda nessa escolha é a flag `VENDA_FUTURA.RECONHECE_FATURAMENTO_NA_EMISSAO`
(`src/lib/fiscal/regras/venda-futura-policy.ts`). Virá-la para `true` inverte as duas pernas
de uma vez (a 5922 passa a ser a receita e a remessa sai), sem risco de contar duas vezes.

---

## 2. Ticket médio , R$ 49.985 (145 pedidos)

**Fórmula:** `Faturamento do período ÷ número de PEDIDOS de venda do período`.

- Numerador: o mesmo faturamento do card anterior (R$ 7.247.815 em julho).
- Denominador: `fato_pedido` com `categoria_operacao = 'venda'`, contando por `data_orcamento`
  no período (**145** pedidos em julho, conferidos em 13/07).

Conferido em produção: 7.247.815 / 145 = **R$ 49.985**.

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

### Janela de cobrança (decisão do dono, 2026-07-12)

"A receber" e "a pagar" **não são a dívida inteira do mundo**: são o que já **deveria ter sido
pago** mais o que **vence dentro do período** que a tela está olhando.

| Situação do título | Entra? |
|---|---|
| Venceu e continua em aberto (de qualquer mês anterior) | **Sim, sempre.** Uma conta de maio que ninguém pagou segue aparecendo em junho, julho... até ser paga |
| Vence DENTRO do período selecionado | **Sim** (ainda não venceu, mas é do período) |
| Vence DEPOIS do fim do período (agosto, setembro...) | **Não.** Não se cobra hoje o que só vence daqui a três meses |

Na prática é um teto: `data_vencimento <= fim do período`. O piso continua sendo a data de
início das análises, pela data do **documento**.

> **Corrigido em 2026-07-13 , "Tudo" não é "sem período".** A regra antiga dizia "sem período,
> o teto é hoje (só o vencido)", e o preset **"Tudo"** resolve o fim do período como **hoje**.
> Resultado: "Tudo" virava "só o vencido" e mostrava **MENOS** que "este mês" , um período
> maior somando menos, o que é impossível. Medido em produção:
>
> | período | a receber | a pagar |
> |---|---|---|
> | este mês (teto 31/07) | R$ 18,1 mi | R$ 17,5 mi |
> | este ano (teto 31/12) | R$ 56,8 mi | R$ 45,2 mi |
> | **"Tudo" (antes)** | **R$ 9,6 mi** ⛔ | R$ 15,1 mi ⛔ |
> | **"Tudo" (agora)** | **R$ 68,2 mi** ✅ | R$ 45,2 mi ✅ |
>
> **Sem fim de período NÃO há teto:** é a **carteira inteira em aberto** (vencido + a vencer).
> A tool do agente (`financeiro_contas_a_receber` / `_a_pagar`) passou a aceitar `periodoAte` e
> a **declarar a janela coberta** na resposta (`janelaCobranca`) , sem isso, a mesma pergunta
> dava um número no chat e outro no dashboard.

Isso vale igual para o **a pagar**, e responde ao filtro de período da barra (dia, semana, mês,
ano, personalizado).

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

**Fórmula:** `soma(quantidade x preco_custo do produto) ÷ índice`, sobre `fato_estoque_saldo`,
cruzando produto a produto com `fato_produto.preco_custo`.

**Só o que ESTÁ em estoque** (`quantidade > 0`). O `fato_estoque_saldo` também guarda linhas
zeradas (produto que já saiu) e **NEGATIVAS** (furo de estoque: saída sem entrada registrada no
Odoo). As negativas **subtraíam** do KPI , eram **R$ 10,5 mi a menos, em 219 linhas**. Estoque
negativo não é estoque: agora fica fora do valor e aparece como gap (`linhasNegativas`).

**O índice** (Configuração > **Diretoria · Vendas**, padrão **0,95**): o valor a custo é
**dividido** por ele, e é esse resultado que vira o KPI. O valor a custo puro continua visível
no rodapé do card, para conferir a conta sem sair da tela.

No cache real: **R$ 47.697.919 a custo ÷ 0,95 = R$ 50.208.336** (o KPI).

- É **foto do agora**, não histórico: a data de início das análises **não se aplica** (não
  existe "saldo de estoque em março").
- Mede a **CUSTO**, não a preço de venda. O `vr_saldo` que vem do Odoo é valorizado por outro
  critério e dava **R$ 45,7 mi** , 23% a mais. Hoje o KPI, o donut, o catálogo, as linhas
  granulares e o giro usam todos o mesmo custo.
- Produto com saldo e **sem custo cadastrado** entra com valor zero e aparece como gap
  (`produtosSemCusto`). Em produção há 52 linhas nessa situação.
- **O índice vale também no filtro cruzado** (corrigido em 2026-07-13). A recomputação
  client-side do construtor (família/marca/local) ignorava o índice e devolvia o custo puro:
  para quem não usa o índice padrão, o mesmo card mostrava um número **com** filtro e outro
  **sem**. `derivarIndicadores` passou a receber o índice já resolvido pelo servidor.

### Seriais em estoque , 3.876 (não 8.860)

A lista de seriais (A6) contava **todo serial cadastrado**, inclusive o que **já saiu**,
embora o título ("em estoque") e a idade em dias dependam de `data_saida IS NULL`. Em
produção, **4.984 dos 8.860 seriais já haviam saído**: o total aparecia com mais que o dobro
do real. Corrigido em 2026-07-13 (`querySeriais`), com o mesmo critério que a idade média do
estoque já usava.

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

## O mapa por estado , e o erro de raiz corrigido em 2026-07-12

**Cada estado** soma o `vr_nf` das mesmas notas do faturamento (venda externa, no período),
agrupadas pela **UF do cliente**.

### O erro (achado ao investigar o balde "Sem UF")

No Odoo da Tauga, o destinatário de um documento **não é o `res.partner`** (o cadastro de
contatos). É o **`sped.participante`**, tabela própria da localização fiscal. **Todo**
`participante_id` do sistema (nota fiscal, pedido, título financeiro, DF-e) aponta para lá.

O `fato_parceiro` era construído a partir de `res.partner`, e as duas tabelas têm **numeração
independente**. Cruzar o id de uma com a outra pega **pessoa diferente**:

| id | quem é em `sped.participante` (o destinatário da nota) | quem é em `res.partner` (onde procurávamos) |
|---|---|---|
| 16104 | PALMS VILLE VM CONDOMINIO RESORT | GEORGE OLIVEIRA DA SILVA |
| 16112 | VOG TAPERAPUAN | JOÃO ANNES GUIMARÃES |
| 1 | Consumidor final não identificado | JHT Brasília , Matriz DF |

**Estrago medido em julho/2026: 116 das 136 notas estavam no estado ERRADO** (R$ 6,6 mi de
R$ 7,2 mi). O balde "Sem UF" (R$ 450 mil) era o caso em que o sósia de número não tinha estado
preenchido , **não** eram clientes sem endereço, como parecia.

### A correção

`fato_parceiro` passou a ser construído de **`sped.participante`**: sua chave agora é a MESMA
que os documentos guardam. Isso conserta de uma vez o mapa, o faturamento por cliente e por UF,
a marcação de intragrupo, os Relatórios (1.0 e 2.0) e o Agente Nex , todos usam esse join.

No cache real: **"Sem UF" = 0 notas** (a fonte certa tem cidade/estado de todo mundo) e os
estados passam a ser os verdadeiros.

> O **faturamento total não mudou** (R$ 7.242.504,80 em julho). A regra de intragrupo tinha uma
> terceira defesa, pelo CNPJ que vem no nome do participante na própria nota, e era ela que
> segurava o número. O erro afetava **para onde** o dinheiro era atribuído, não o total. Ainda
> assim havia 1 nota de R$ 200 exposta a colisão de id , agora impossível.

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
