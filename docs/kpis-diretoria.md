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

### Modo sombra: a regra nova de receita roda em paralelo (dono, 2026-07-13)

A partir do PR desta entrega, o worker calcula a receita pelas **duas** regras: a de sempre
(a palavra "venda" no nome da operação) e a nova (a **natureza da operação**, que a perícia
mostrou ser a lógica correta, em `docs/pericia-classificacao-receita-2026-07-13.md`).

**Quem manda no número continua sendo a regra antiga.** A coluna `is_venda_externa`, que a
plataforma inteira lê (dashboard, Relatórios 1.0 e 2.0, KPIs, Nex, MCP), recebe sempre a
decisão da regra antiga. A trava é estrutural: não existe caminho no código em que a regra
nova mude um número exibido. Conferido contra produção: 9.677 de 9.677 notas com decisão
idêntica, faturamento igual ao centavo.

A regra nova só **observa**, em três colunas próprias (`venda_por_natureza`,
`classificacao_divergente`, `natureza_desconhecida`), e o placar entre as duas aparece em
**Configuração > Classificação fiscal**: hoje, **99,90% de acerto e 2 divergências** (duas
notas complementares de preço, R$ 4.527,04, que a regra nova enxerga e a antiga não).

Quando o placar estiver limpo o bastante, a troca pode ser feita com prova. Enquanto isso,
**natureza de operação desconhecida vira alerta na tela**, nunca silêncio.

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

## 5. Valor em estoque , R$ 31.423.844 (902 produtos, 4 depósitos)

**Fórmula:** `soma(quantidade x preco_custo do produto) ÷ índice`, sobre `fato_estoque_saldo`,
cruzando produto a produto com `fato_produto.preco_custo`.

**Só o que ESTÁ em estoque** (`quantidade > 0`). O `fato_estoque_saldo` também guarda linhas
zeradas (produto que já saiu) e **NEGATIVAS** (furo de estoque: saída sem entrada registrada no
Odoo). As negativas **subtraíam** do KPI , eram **R$ 10,5 mi a menos, em 219 linhas**. Estoque
negativo não é estoque: agora fica fora do valor e aparece como gap (`linhasNegativas`).

**O índice** (Configuração > **Diretoria · Vendas**, padrão **0,95**): o valor a custo é
**dividido** por ele, e é esse resultado que vira o KPI. O valor a custo puro continua visível
no rodapé do card, para conferir a conta sem sair da tela.

> **Exceção , card da VISÃO GERAL (decisão do dono, 2026-07-18):** ali o número principal é o
> **valor a CUSTO puro (R$ 29,8 mi)** e o rodapé mostra `índice 0,95 → R$ 31,4 mi`. Ou seja, na
> Visão Geral a hierarquia é invertida em relação à tela de Estoque (que mantém os R$ 31,4 mi
> em destaque). É a mesma conta, só muda qual dos dois números fica grande.

**Só o estoque que é NOSSO e está EM CASA** (regra nova, 2026-07-13). A árvore de locais do
Odoo tem três raízes, e o KPI somava as três:

| Classe | Valor a custo | Entra no KPI? |
|---|---:|---|
| **Próprio** (4 depósitos reais) | **R$ 29.852.652** | sim |
| Virtual | R$ 10.243.115 | não |
| Terceiros | R$ 6.071.867 | não |
| Terceiros › Demonstração (35 clientes) | R$ 1.562.449 | não (painel A-13) |

O KPI cai de **R$ 50.245.690** para **R$ 31.423.844** (R$ 29.852.652 ÷ 0,95). O estoque não
encolheu: a conta passou a considerar só o que é da empresa e está no armazém.

**A regra não é uma lista de nomes.** O próprio Odoo separa um depósito de verdade dos demais
locais da árvore Própria (showroom, assistência técnica, razão social, inativos) pelos campos
`estoque_em_maos`, `calcula_extrato_saldo` e `proprietario_local_id`. Classificar por texto
seria frágil: existem **dois locais com o nome idêntico** ("Próprio / INATIVO"), e o nome que
chega no fato vem invertido ("Jds - Matriz DF » Próprio"). Única exceção de negócio: o
**Showroom**, que vive sob Próprio mas é vitrine, não estoque vendável , vai para demonstração.

Fonte: `fato_estoque_local.classificacao` (`src/lib/estoque/classificacao-local.ts`).

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

### Seriais em estoque , 2.511, agora com o local e o saldo

A tabela A-06 lia `fato_serial` (o cadastro de lote/série): listava todo serial já registrado
e **não sabia onde ele estava**. Dos 3.828 que dava como "em estoque", **100% tinham local
nulo** , essa fonte só preenche o local de quem **já saiu**. Era uma lista de números, sem
saldo e sem lugar.

A fonte certa já estava no cache e ninguém lia: **`raw_estoque_saldo_rastreabilidade_hoje`**,
que casa serial + local + saldo. Dela nasce **`fato_serial_saldo`**, com a classificação do
local junto. A tabela agora mostra **Serial · Produto · Local · Saldo**, só do estoque próprio:

| Depósito | Seriais |
|---|---:|
| Jds - Matriz DF | 1.235 |
| Jds - Filial SE | 749 |
| Jds - Filial SP | 527 |

Os 1.589 em Virtual/Terceiros e os 104 em demonstração ficam fora do padrão. O **Jib DF** tem
saldo mas nenhum serial , é correto, nem todo produto é serializado.

---

## 5b. Necessidade de compra , 215 produtos, 1.842 unidades, R$ 9.700.544

**Fórmula:** por produto, `max(0, demanda_a_atender − saldo_físico)`, com o custo estimado em
`falta × preco_custo`.

A demanda é a **demanda em aberta** canônica (§6), mas contando o que **falta entregar**, não
o que foi pedido. O saldo é só o dos **depósitos próprios**: mercadoria em poder de terceiros
não atende pedido nenhum.

A conta é **nacional** (a operação transfere entre filiais), e cada linha abre o **saldo por
depósito** , quem decide a compra precisa saber se a mercadoria já existe em outra filial (e é
caso de transferir) ou se não existe em lugar nenhum.

**Não há estoque mínimo na conta**: o Odoo do cliente não tem esse parâmetro preenchido
(`fato_estoque_min_max` está vazia). Lead time e mercadoria em trânsito ficaram para depois.

O painel A-12 ("Estoque disponível") usa a mesma base e **fecha exatamente** com este.

---

## 6. Demandas a entregar , 337 pedidos, R$ 21.207.730 (a custo, do que falta entregar)

**Fonte:** `fato_pedido` com `bucket_demanda = 'ABERTA'` e `data_orcamento >= início das
análises`.

**O valor é o que FALTA ENTREGAR, a custo** (regra nova, 2026-07-13). Antes era a soma de
`vr_produtos` (o cabeçalho do pedido inteiro, a preço de venda): um pedido com 10 itens, 6 já
entregues, continuava valendo os 10. Medido no cache: **das 10.721 unidades pedidas, 5.097 já
tinham sido entregues (48%)** e seguiam sendo contadas como pendentes.

| Base | Valor |
|---|---:|
| Cabeçalho, a preço de venda (como era) | R$ 62,6 mi |
| A custo, quantidade cheia | R$ 34,4 mi |
| **A custo, o que falta entregar (o KPI)** | **R$ 21.207.730** |

O "quanto falta entregar" vem de `quantidade_a_atender_pedido`, um campo **computado** do Odoo
(não existe em coluna). Dois efeitos que custaram caro e estão cobertos por teste:

1. o sync só copia campo armazenado, então o dado nunca entrava no cache. Agora há
   `extraFields` no catálogo para declarar computados explicitamente;
2. o ciclo incremental **não conseguiria mantê-lo fresco**: ele filtra por `write_date`, e o
   `write_date` do item **não muda** quando a entrega acontece (quem nasce é a nota). O valor
   entraria uma vez e **congelaria**. Por isso existe um job diário próprio
   (`src/worker/sync/atendimento.ts`) que relê os itens ignorando o `write_date`.

**Enquanto o job não roda, TODOS os pedidos caem na quantidade cheia e a tela avisa.** Nunca se
mistura as duas bases no mesmo total: metade de cada produziria um número que não é nem a
demanda cheia nem a real. O corte é por marcador de build (`fato_build_state`).

**56 pedidos aparecem com R$ 0,00**: já foi tudo entregue, mas a etapa não avançou no Odoo.
Ficam listados de propósito , o zero é justamente o que denuncia a esteira parada.

O valor cheio a preço de venda continua disponível na consulta (`valorAAtenderVenda`), para
quem precisar da leitura de receita futura.

**"ABERTA"** é decidido pelos **gatilhos da própria etapa** do pedido no Odoo (não pelo nome
dela): a etapa não pode ter `finaliza_faturamento`, `finaliza_pedido_confirmando` nem
`finaliza_pedido_cancelando`. Ou seja: pedido de venda a cliente externo que **ainda não foi
faturado, concluído nem cancelado**.

**"Atrasadas"**: dos abertos, os que têm `data_prevista` **anterior a hoje**. É a data
prometida de entrega já vencida, com o pedido ainda aberto.

---

## 7. Formas de pagamento , três visões (2026-07-13)

**Fonte: o TÍTULO FINANCEIRO** (`fato_financeiro_titulo`), não a parcela do pedido.

O painel lia `fato_pedido_parcela`, onde a forma de pagamento é um campo **opcional** e vinha
vazia em 24% dos casos , daí um balde **"Não informado" de R$ 23,08 mi**, o segundo maior do
gráfico. **Não era um problema de negócio: era a fonte errada.** No título financeiro (o
documento de cobrança de verdade) a forma está preenchida em **5.536 de 5.537 títulos
(99,98%)**, e o "Não informado" vira **1 título de R$ 31.157,90**.

O painel também deixou de somar três coisas diferentes num número só:

| Visão | O que é | Títulos | Valor |
|---|---|---:|---:|
| **Pago** | nota emitida, título quitado | 1.149 | **R$ 31.401.301** |
| **A receber** | nota emitida, parcela a vencer | 634 | **R$ 28.254.349** |
| **Carteira em aberto** | pedido fechado, **nota ainda não saiu** | 3.654 | **R$ 52.390.497** |

A **carteira em aberto não é faturamento**: a receita só é reconhecida na nota. É venda
contratada esperando a entrega (86% dela já programada em boleto). Casa com o KPI "Carteira a
faturar" (§3).

**Contas provisórias:** o Odoo tem um campo para isso, e são **14 títulos de 5.537**. O sistema
**não** está inflando com provisório, e a tela avisa quando há algum na visão selecionada.

Recorte pela **data do documento** e valor pelo **`vr_documento`** , é a única combinação que
reproduz os números conferidos contra o cache. A consulta passou a respeitar **empresa e UF**
(antes não respeitava: usuário restrito a um estado via o grupo inteiro).

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

---

## As TRES bases que pareciam a mesma coisa (2026-07-14)

O dono olhou a tela de Vendas e viu, ao mesmo tempo: faturamento **R$ 7,58 mi**, "Modalidades
de operação" somando **R$ 12,7 mi** e "Formas de pagamento" com outros valores. Concluiu, com
razão, que o sistema se contradizia.

**Nenhum número estava errado.** Eram três perguntas diferentes com rótulo que sugeria a mesma:

| Card | O que soma | Fonte | Julho/2026 |
|---|---|---|---|
| **Faturamento** | **notas** de venda emitidas | `fato_nota_fiscal` (`is_venda_externa`) | R$ 7.578.128,64 |
| **C-05 Modalidades** | **pedidos** abertos no período | `fato_pedido` (por `data_orcamento`) | **R$ 12.743.333,15** |
| **C-07 Formas de pagamento** | **títulos** financeiros a receber | `fato_financeiro_titulo` | 3 visões (pago / a receber / carteira) |

"Vendido" (o pedido que o cliente fechou) e "faturado" (a nota que saiu) são coisas diferentes,
e a diferença entre eles é justamente o que ainda não foi entregue. Os dois cards agora **dizem
no próprio card** o que somam e o que não somam.

**Regra para quem criar card novo:** se o número não vem de `fato_nota_fiscal`, o card tem que
dizer de onde vem. Card que mostra dinheiro sem dizer a base é card que vai ser lido como
faturamento.

