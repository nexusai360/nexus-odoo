# 05 , Requisitos de produto/UX + sugestões críticas

Requisitos ditados pelo usuário na conversa, mais o que eu (pensando junto,
criticamente) recomendo. Nada aqui vira código sem passar pela SPEC.

## 1. Renderização de TABELA no Agente Nex (estilo ChatGPT/Claude)
**Requisito:** quando a resposta for demanda, comparativo ou faturamento (dado
tabular/complexo), o Nex deve **montar uma tabela** bem formatada (colunas, linhas,
valores alinhados), não só texto. Precisa ficar bonito e legível, não "bizarro".
**Investigar na execução:** o renderer do chat (provável `react-markdown` +
`remark-gfm`) já suporta tabela markdown? Se sim, o trabalho é (a) garantir o GFM
ligado no componente de mensagem, (b) estilizar a tabela (Tailwind: zebra, header
fixo, alinhamento numérico à direita, scroll-x no mobile), (c) ensinar o prompt a
emitir tabela markdown nesses casos. Se não suportar, adicionar o plugin. **UI é
obrigatoriamente com `ui-ux-pro-max` e feita na sessão principal.**
**Sugestão crítica:** padronizar um "formato de resposta de demanda":
1) uma **tabela** (as N linhas principais), 2) um **parágrafo curto** explicando a
tabela, 3) uma **lista `etapa: quantidade`** com a distribuição, 4) **follow-ups**
sugeridos. Isso já existe em parte no rastreador de formato de resposta
(lista/tabela/texto) , reaproveitar.

## 2. Listagem das demandas em aberto
**Requisito do usuário:** não listar todas; mandar as **20 mais antigas** (mais
tempo paradas), informar o **total**, e uma **lista por etapa** (`etapa: qtd`).
Sugerir aprofundar uma etapa/pedido.
**Minha sugestão crítica (pensando junto, como pedido):**
- "Mais antigas" por **data de criação** pode enganar: um pedido antigo pode ter
  avançado ontem. O melhor sinal de gargalo é **tempo parado na etapa ATUAL**
  (`data_entrada` da etapa atual no histórico). Proponho **ordenar por "dias
  parado na etapa atual" desc** como padrão (é o que mostra o que está travado),
  e oferecer alternativas: por **valor travado (R$)** (prioriza dinheiro parado),
  por **data de criação**, por **data prevista vencida**.
- Sempre devolver: **total de demandas**, **valor total travado**, e a **quebra
  por etapa**. Perguntar se quer filtrar por etapa/empresa/vendedor.
- Oferecer, como follow-up: "quer que eu detalhe o pedido PV-xxxx?" (imersão).

## 3. Imersão no pedido (a grande dor da empresa)
**Requisito:** ao olhar um pedido, dizer por quais etapas passou, onde está, e o
que falta para avançar (pendências), com o número do pedido e detalhes.
**Como entregar (ver 04 §1):** `fato_pedido_historico` dá a trilha e o tempo por
etapa; a config da etapa dá o gatilho pendente ("falta confirmar estoque", "falta
emitir a NF", "falta aprovar o financeiro"). A próxima etapa provável sai das
transições reais mais comuns. Texto sugerido pela IA:
"PV-2037 (Venda Lucro Real, R$ X, cliente Y). Aprovado em 09/06, está há Z dias em
**GERA BOLETO**. Já passou por: Venda direta → Aguardando Autorização → Aprovado →
Input financeiro → GERA BOLETO. Para avançar falta **gerar/confirmar o boleto** e
seguir para a reserva de estoque. Previsto para dd/mm."

## 4. Enriquecer MUITO a demanda (roadmap de valor)
- Alertas de pedidos parados além de um limite (ex.: > 15 dias na etapa).
- Agrupar demanda por vendedor, por empresa, por família/produto (após
  `fato_pedido_item`).
- Ligar com estoque: "esta demanda precisa de 80 T600X; há 60 em estoque; faltam
  20 (comprar)".
- Ligar com financeiro: pedido aprovado mas boleto não pago (inadimplência trava a
  emissão) , cruzar com títulos.

## 5. Estoque disponível e compras (exemplo do usuário)
Responder "estoque disponível = saldo menos o travado em demanda aberta", por
produto, com destaque para **negativos** (precisa comprar) e para os **mais
vendidos** (ex.: T600X, 549 em saldo hoje). Depende de `fato_pedido_item` (04 §5).

## 6. Seriais
"Quais seriais deste produto estão parados em estoque e quais já saíram em nota."
Depende de enriquecer serial + rastreabilidade (04 §4).

## 7. Relatórios da diretoria (não é só o Nex)
Todos os relatórios que puxam faturamento/demanda/estoque devem usar os MESMOS
critérios (venda real, demanda por etapa, estoque disponível). Mesma fonte de
verdade que o Nex (os helpers/tools/queries). Ver inventário em 06.

## 8. Princípio de UX
Imersivo, rápido, fácil. A IA responde com o dado já mastigado pelo código, em
tabela + resumo + próximos passos, sempre honesta sobre limitações (quando o dado
não existe, dizer , nunca inventar número).
