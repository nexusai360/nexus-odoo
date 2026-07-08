# 09 , Pergunta para a Mariane: VENDA FUTURA (faturamento e estoque)

> Objetivo: obter da Mariane uma definição clara sobre como a **venda futura** deve
> ser tratada em (a) faturamento e (b) estoque disponível. O sistema já está
> engatilhado para qualquer das respostas (basta trocar uma configuração).

## Contexto em 3 linhas (para a Mariane situar)
Na venda futura, a empresa emite primeiro a **nota de simples faturamento** (CFOP
5922/6922) para cobrar o cliente, e só depois emite a **nota de remessa** (entrega
futura, CFOP 5117/6117) quando a mercadoria realmente sai. São dois documentos para
uma única venda.

## Pergunta 1 , FATURAMENTO (quando a venda "conta" como faturada)
"Mariane, na venda futura a gente emite a nota de cobrança (simples faturamento) antes
e a nota de entrega (remessa) depois. **Para o faturamento/receita, a venda deve contar
no momento da cobrança (quando emite a nota de simples faturamento) ou só quando a
mercadoria é entregue (quando emite a remessa)?** A regra hoje conta na entrega
(remessa), para não correr o risco de contar a mesma venda duas vezes , está correto
assim para vocês, ou vocês consideram faturado já na cobrança?"

## Pergunta 2 , ESTOQUE (quando a mercadoria deixa de estar "disponível")
"E para o **estoque disponível**: quando a gente emite a nota de simples faturamento de
uma venda futura, mas a mercadoria ainda está fisicamente no armazém (só sai na
remessa), essa mercadoria deve **continuar contando como disponível para vender** para
outro cliente, ou ela já deve ser considerada **reservada/comprometida** (fora do
disponível) desde a cobrança?"

## Por que isso importa (impacto prático, se ela perguntar)
- **Faturamento:** contar na emissão infla/adianta o número do mês da cobrança; contar
  na remessa reflete a entrega real. Precisamos do critério de vocês para o número do
  faturamento ficar fiel ao que a diretoria entende por "vendido".
- **Estoque:** se a mercadoria vendida em venda futura continuar "disponível", corremos
  o risco de vender de novo algo que já tem dono; se marcarmos como reservada, o
  disponível fica mais conservador (mais próximo do que dá para vender de fato).

## O que fazer com a resposta
Registrar aqui a definição da Mariane e, se diferente do padrão atual, trocar as flags
em `src/lib/fiscal/regras/venda-futura-policy.ts`:
- `RECONHECE_FATURAMENTO_NA_EMISSAO`: `false` (padrão = conta na remessa) ou `true` (conta na emissão).
- `RESERVA_ESTOQUE_ATE_REMESSA`: `false` (padrão = segue disponível) ou `true` (reserva desde a cobrança).
Ao ligar o faturamento na emissão, validar a de-para para o x117 da mesma venda não
contar de novo (há um teste que trava isso de propósito como lembrete).

**Resposta da Mariane (preencher):**
- Faturamento conta em: ( ) emissão da cobrança (5922/6922)  ( ) remessa/entrega (x117)
- Estoque da venda futura: ( ) segue disponível  ( ) reservado até a remessa
- Observações:
