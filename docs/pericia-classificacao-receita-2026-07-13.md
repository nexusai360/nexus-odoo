# Laudo , O que é receita, e como o sistema deveria decidir isso

> **Perícia de 2026-07-13**, feita a pedido do dono, contra o **banco de produção** e contra o
> **Odoo ao vivo**. Nenhum número aqui foi deduzido do código: cada um foi conferido nota a
> nota. O objetivo é responder uma pergunta: **dá para parar de depender da palavra "venda" e
> classificar a receita pela lógica fiscal de cada documento?**
>
> **Resposta curta: dá, e a chave não é o CFOP. É a NATUREZA DA OPERAÇÃO.** Ela bate centavo a
> centavo com o que temos hoje (R$ 62.647.155,63 em 905 notas) e ainda recupera receita que
> hoje escapa. O CFOP, sozinho, **perderia R$ 684 mil** de receita real.
>
> **Este documento é um estudo. Nenhuma linha de código de produção foi alterada por ele.**
> A decisão é do dono.

---

## 1. Como a coisa funciona hoje

Uma nota entra no faturamento (`fato_nota_fiscal.is_venda_externa = true`) quando ela é de
saída, autorizada pela SEFAZ, modelo 55 ou 65, não é devolução, o destinatário está fora do
grupo, e o **nome da operação fiscal contém a palavra "venda"** (sem "interna" e sem
"imobilizado"), mais as duas exceções de venda futura que entraram hoje no PR #187.

O problema não é a regra estar errada. É ela ser **um teste de texto sobre um campo que
terceiros digitam**. Já custou caro: as duas operações de venda futura não têm a palavra
"venda" no nome, e por isso R$ 538 mil de receita ficaram fora do faturamento entre março e
julho, sem nenhum alerta. O bug só apareceu porque o dono estranhou o número na tela.

---

## 2. O universo periciado

Notas de **saída, autorizadas, modelo 55/65, não devolução**, emitidas de 16/03/2026 (a data
de início das análises) até 13/07/2026:

| | |
|---|---|
| notas no período | **1.965** |
| valor total | R$ 168,7 milhões |
| notas que hoje são receita | **905** (R$ 62.647.155,63) |
| naturezas de operação distintas | 20 |
| CFOPs distintos | 23 |
| notas com **mais de um CFOP** | **zero** (cada nota tem um CFOP só) |

---

## 3. Primeiro candidato: classificar pelo CFOP. E por que ele falha.

O CFOP é o código fiscal do item ("6108 - Venda de mercadoria adquirida de terceiros",
"5152 - Transferência", "5905 - Remessa para armazém"). É a linguagem oficial. Parece o
critério perfeito. **Não é**, e a perícia mostrou três motivos concretos.

### 3.1 O CFOP mora no ITEM, e o cache perde item

O CFOP não está na nota: está nos itens dela. E o cache de itens **tem buracos**. Das notas
do período, **4 vendas reais, somando R$ 493.353,85, não têm nenhum item no cache**:

| nota | data | cliente | valor |
|---|---|---|---|
| 59510 | 03/07 | NPJ Construções | R$ 246.308,71 |
| 57010 | 11/06 | Márcio Orrico de Magalhães | R$ 117.490,21 |
| 60237 | 10/07 | Mundo Fitness Fortaleza | R$ 78.845,70 |
| 58944 | 30/06 | Platina Patriani | R$ 50.709,23 |

**Os itens existem no Odoo** (conferido ao vivo: todos com CFOP 6108 - Venda). Eles
simplesmente nunca chegaram ao cache. Uma regra baseada em CFOP **não teria como classificar
essas notas**, e elas cairiam fora do faturamento. Isso está detalhado no §6, porque é um
problema por si só, independente desta decisão.

### 3.2 O CFOP pode estar ERRADO no Odoo, e está

A nota **44030**, de R$ 190.986,33, é uma venda inequívoca:

- operação: "AOP1 - Venda Lucro Presumido 5102/6102/6108"
- natureza: "VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS"
- cliente: Condomínio Residencial Chácara Bonfim (fora do grupo)
- **tem pedido de venda: PV-0788/26**
- itens: anilhas, puxadores, equipamento de academia
- NF-e autorizada, chave válida

E o **CFOP dos itens está lançado como "6949 - Outra saída de mercadoria"**. Está errado, foi
digitado errado no Odoo por quem emitiu. Uma regra de CFOP puro **jogaria R$ 190.986,33 de
receita real no lixo**, obedecendo a um erro de digitação de terceiros.

### 3.3 O CFOP não separa venda de venda interna

As 920 notas com CFOP 5102 incluem tanto venda a cliente quanto **venda interna entre as
empresas do grupo** (o mesmo CFOP para as duas coisas). Só 245 delas são receita. Ou seja:
**qualquer desenho, inclusive o por CFOP, continua dependendo do filtro de intragrupo por
CNPJ.** Isso não muda.

### 3.4 O placar do CFOP

| | notas | valor |
|---|---|---|
| CFOP e regra atual **concordam** | 1.947 | , |
| só o **nome** diz venda (CFOP erra) | 1 | R$ 190.986,33 |
| só o **CFOP** diz venda (nome erra) | 1 | R$ 2.697,98 |
| **sem item no cache** (CFOP não decide) | 4 | R$ 493.353,85 |

**Migrar para CFOP puro perderia R$ 684.340,18 de receita real e ganharia R$ 2.697,98.**
É um péssimo negócio.

---

## 4. A lógica que a perícia encontrou: a NATUREZA DA OPERAÇÃO

Cada nota do Odoo tem um campo `natureza_operacao_id`: um **id estável** apontando para uma
tabela de naturezas. É o campo em que o Odoo declara **o que o documento é, em substância**.
Ele vive **na nota** (não no item, então não depende do cache de itens), é **estruturado**
(id, não texto livre digitado a cada emissão), e , decisivo , ele **acerta os dois casos em
que o CFOP e o nome erram**.

### 4.1 O catálogo completo (20 naturezas, todo o período)

**É RECEITA:**

| id | natureza | notas | o que é |
|---|---|---|---|
| 1 | VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS | 1.519 | a venda comum (895 externas + 624 intragrupo) |
| 47 | Venda de mercadoria adq ou recebida de terc. | 47 | idem (hoje 100% intragrupo) |
| 107 | Venda de mercadoria ad ou re de terceiros entregue ao depositário | 1 | venda à ordem |
| 36 | Venda de mercadoria recebida de terceiros , **Entrega futura** | 9 | a **remessa** da venda futura (a receita, pela sua decisão) |
| 31 | **NOTA COMPLEMENTAR** | 1 | complemento de preço de uma venda , **hoje fica de fora** |

**NÃO É RECEITA:**

| id | natureza | notas | valor |
|---|---|---|---|
| 9 | TRANSFERENCIA DE MERCADORIA | 217 | R$ 43,6 mi |
| 23 | REMESSA PARA DEPOSITO/ARMAZEM GERAL | 18 | R$ 8,5 mi |
| 6 | REMESSA PARA DEMONSTRACAO | 65 | R$ 4,8 mi |
| 27 | RETORNO DE MERCADORIA DE DEPOSITO | 30 | R$ 3,1 mi |
| 37 | **Simples faturamento , venda para entrega futura** | 15 | R$ 1,4 mi (fora, por decisão do dono) |
| 85 | REMESSA POR CONTA E ORDEM DE TERCEIROS | 1 | R$ 932 mil |
| 70 | OUTRA SAIDA DE MERCADORIA | 11 | R$ 740 mil |
| 29 | VENDA DE BEM DO ATIVO IMOBILIZADO | 4 | R$ 611 mil (baixa de bem, não receita) |
| 33 | REMESSA PARA EXPOSICAO OU FEIRA | 2 | R$ 446 mil |
| 24, 30, 64, 98, 116 | conserto, crédito de ICMS, bonificação, garantia, componente faltante | 15 | R$ 95 mil |
| (sem natureza) | 10 notas, R$ 2,9 mi | 10 | **todas intragrupo** , o filtro de CNPJ já as remove |

Repare em duas coisas que resolvem problemas antigos de uma vez:

- A venda futura tem **duas naturezas distintas**: a id 36 é a remessa (a receita, pela sua
  decisão) e a id 37 é o simples faturamento (fora). A política de venda futura passa a ser
  **um id, não uma busca por "5117" dentro de um texto**.
- A id 31 (NOTA COMPLEMENTAR) é receita e **hoje escapa** do faturamento.

### 4.2 O teste: bate centavo a centavo?

Regra testada: *saída + autorizada + modelo 55/65 + não devolução + **não intragrupo** +
natureza ∈ {1, 47, 107, 36, 31}*.

| resultado | notas | valor |
|---|---|---|
| concordam: **é receita** | **905** | **R$ 62.647.155,63** |
| concordam: não é receita | 1.059 | R$ 106.080.658,01 |
| só a regra de HOJE diz receita | **0** | **R$ 0,00** |
| só a NATUREZA diz receita | 1 | R$ 2.697,98 |

**Bate exatamente.** A regra por natureza reproduz o faturamento atual **nota a nota, sem
perder uma única** (zero na linha "só a regra de hoje"), e ainda recupera a nota complementar
de R$ 2.697,98 que hoje some.

Ela também classifica corretamente a nota 44030 (a do CFOP errado): a natureza dela é
"VENDA DE MERCADORIA", então a receita de R$ 190.986,33 é preservada , **sem depender do
CFOP e sem depender da palavra "venda" no nome**.

---

## 5. A proposta

Uma nota é receita quando **todas** valem:

1. saída (`entrada_saida = '1'`)
2. autorizada pela SEFAZ (`situacao_nfe = 'autorizada'`)
3. modelo 55 ou 65 (NF-e / NFC-e)
4. não é devolução (`finalidade_nfe <> '4'`)
5. destinatário **fora do grupo** (join por raiz de CNPJ , continua igual, é insubstituível)
6. **a natureza da operação está no catálogo de receita** (hoje: ids 1, 47, 107, 36, 31)

E o ponto que mais importa, o que impede o próximo prejuízo silencioso:

7. **Natureza desconhecida = alerta, nunca silêncio.** Toda natureza de saída autorizada que
   não estiver no catálogo (nem como receita, nem como não-receita) **aparece num painel de
   pendências fiscais** com o valor envolvido, para alguém decidir de que lado ela fica.
   Hoje, uma operação nova simplesmente some do faturamento e ninguém fica sabendo. Foi
   assim que os R$ 538 mil da venda futura evaporaram por quatro meses.

O CFOP não é descartado: ele vira **conferência**, não critério. Quando a natureza diz uma
coisa e o CFOP diz outra (as 2 notas do §3.4), a nota entra num **relatório de divergência
fiscal** , que é exatamente onde a nota 44030, com CFOP errado, deveria aparecer para alguém
corrigir no Odoo.

**Impacto se você aprovar:** o faturamento de 16/03 a 13/07 sai de R$ 62.647.155,63 para
**R$ 62.649.853,61** (+ R$ 2.697,98, a nota complementar). Nada mais muda de lado. Nenhum
número do dashboard se move de forma perceptível , e a plataforma deixa de depender de
palavra digitada por terceiros.

---

## 6. Achado paralelo, e é grave: o cache está PERDENDO itens de nota fiscal

Isto apareceu no meio da perícia e **não tem relação com a decisão acima**. É um bug de
ingestão, e precisa de conserto próprio.

**O fato.** 8 notas do período têm itens no Odoo que **nunca chegaram ao cache** (152 itens
perdidos). Entre elas, 4 vendas reais de R$ 493.353,85. Os itens existem no Odoo, conferidos
ao vivo. No cache, não existem , nem marcados como deletados: **simplesmente não estão lá**.

**A causa.** O worker sincroniza cada modelo pedindo ao Odoo "tudo que mudou desde o último
ciclo" (`write_date > último ciclo`) e, ao terminar, **avança a marca d'água** para o instante
em que o ciclo começou. O problema é a janela de commit: quando alguém salva no Odoo uma nota
com 30 itens, esses itens recebem `write_date` no início da transação, mas **só ficam
visíveis quando a transação fecha**, segundos depois. Se o worker faz a leitura nesse
intervalo, ele **não vê** os itens , e no ciclo seguinte a marca d'água **já passou** do
`write_date` deles. Eles **nunca mais são buscados**. O buraco é permanente.

E nada no sistema o repara: a reconciliação diária só verifica o que **sumiu do Odoo** (para
marcar como deletado). Ela **nunca procura o que falta no cache**. É um caminho de mão única.

**As vítimas são justamente as notas grandes**, com muitos itens (17, 21, 24, 30, 37 itens),
porque são as de transação mais longa , maior a janela, maior a chance de cair nela.

**Duas correções, ambas simples:**

1. **Margem de segurança na marca d'água.** Buscar `write_date > (último ciclo , 15 min)` em
   vez de `> último ciclo`. Reprocessa alguns registros (o upsert é idempotente, não duplica
   nada) e fecha a janela de commit. É o conserto da causa.
2. **Reconciliação nos dois sentidos.** A rotina diária passa a comparar os ids do Odoo com
   os do cache **e a buscar o que está faltando**, não só a marcar o que sumiu. É a rede de
   segurança que teria pescado essas 8 notas sozinha.

Enquanto isso não for feito, **os itens de nota fiscal do cache não são confiáveis para
valor** (margem por produto, faturamento por família, curva ABC). O **cabeçalho** da nota
(que é de onde sai o faturamento) **não é afetado** , o `vr_nf` vem da própria nota, e nenhum
número do dashboard de diretoria está errado por causa disso.

---

## 7. O que eu recomendo

1. **Adotar a classificação por natureza de operação** (§5). Bate centavo a centavo com hoje,
   elimina a dependência da palavra "venda", recupera R$ 2.697,98 que escapam, e sobrevive a
   uma operação nova cadastrada com qualquer nome.
2. **Ligar o alerta de natureza desconhecida.** É o item que impede o próximo prejuízo
   silencioso. Sem ele, trocar a regra é trocar de fragilidade.
3. **Consertar a perda de itens do sync** (§6), que é independente e vale por si.
4. **Manter o CFOP como conferência**, num relatório de divergência , é ele que aponta o erro
   de cadastro da nota 44030 para o pessoal do Odoo corrigir.

Ordem sugerida: (3) primeiro, porque é bug de dado e não muda regra de negócio; depois (1) e
(2) juntos, que são a mesma entrega.

**Nada disso será implementado sem a sua decisão.**
