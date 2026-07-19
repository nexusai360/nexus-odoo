# PLAN 3 (rateio de valor dos kits) , decisão e diretrizes do dono (2026-07-19)

Registrado da resposta do dono à pergunta de escopo. Base do PLAN 3.

## Decisão de escopo: OPÇÃO 2 COMPLETA (aprovada, com empolgação)

O dono quer, para o rateio de valor dos kits:
1. **Painel na Diretoria** mostrando a **composição do valor dos kits** (estrutura vs painel etc.). "Isso aí é muito legal, muito legal mesmo. Eu gostaria muito de ir por esse caminho."
2. **Função** de rateio/cruzamento.
3. **Uma ou mais tools para o Agente Nex** ("às vezes uma tool só não vai ser suficiente, vai precisar de mais de uma").

## Condição: PERÍCIA COMPLETA antes (ele exigiu explicitamente)

"Você vai precisar fazer uma perícia completa e ver se isso é possível." Só seguir para a construção com a garantia de que dá para cruzar os dados de forma confiável.

## O ponto crítico que o dono levantou (o coração do problema)

**O valor NÃO é fixo. Não há correlação custo↔venda.** Palavras dele:
- "Os kits mudam de valor toda hora, tem as tabelas lá."
- "A montagem dos kits às vezes são vários itens diferentes, com valores diferentes (igual os painéis)."
- "Cada produto vai ter um preço. Às vezes entrou por um valor, teve um preço de custo e um preço de venda diferente. Teve custo X e vendeu por Y. Aí o MESMO produto teve custo 2X e vendeu por 5Y. Ou seja, não tem nenhuma correlação."
- "É por hora, por período. Às vezes o produto tá mais caro, mais barato, de acordo com o preço do dólar."
- "Para determinado cliente eu vendo mais barato, para outro mais caro. Hora faço promoção, hora não."
- "Precisa tudo isso ser visualizado nas tabelas. Colocando essas tabelas de preço, consegue mapear muito bem isso."

Sugestão de caminho do dono: "Se você conseguir pegar o **número de série** e puxar na lista de produtos e ver qual a **tabela** que ele tem lá, você vê **preço de custo, preço de venda** etc. É questão de cruzar dados e montar o algoritmo certo."

## Consequências para o PLAN 3 (a perícia tem que confirmar)

- O rateio precisa considerar **as tabelas de preço** (`fato_preco`): por tabela, por cliente (`participante`), por período (vigência `data_inicial`/`data_final`).
- Considerar o **valor REAL de venda** do kit no pedido/nota (não um preço fixo).
- Avaliar o **número de série** como caminho de cruzamento (série → produto → tabela/valor).
- O painel deve **mostrar as tabelas de preço** (o dono quer ver isso, não só um número final).
- Resolver os **4 kits com múltiplas BOMs** corretamente (afeta rateio e Fase 1).

## Garantia pedida pelo dono

"Se você me garantir que consegue mapear isso muito bem e fazer funcionar, vamos cair pra dentro. Avalia tudo isso com um olhar bem clínico."

→ A perícia completa (3 frentes, em `docs/superpowers/research/2026-07-19-plan3-*` quando consolidada) responde se é viável, com que cobertura, e por qual caminho de dados. Só então o PLAN 3 v1.
