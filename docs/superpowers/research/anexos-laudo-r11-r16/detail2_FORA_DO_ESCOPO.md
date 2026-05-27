# Casos FORA_DO_ESCOPO

## [R11] Vendedores cadastrados

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Contagem de vendedores cadastrados no ERP"})

**Razões do judge:**
Métrica de vendedores cadastrados não tem tool; registrou lacuna.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R11] Faturamento por região esse mês

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal/comercial", "perguntaResumo": "Faturamento por região no mês corrente"})

**Razões do judge:**
Faturamento por região não tem tool dedicada; lacuna registrada.

**Resposta dada (trunc 800):**
Essa métrica por **região** não está disponível ainda; registrei para a próxima etapa.

---

## [R11] Quantos itens temos com saldo zero?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "estoque", "perguntaResumo": "Quantidade de itens com saldo zero em estoque"})

**Razões do judge:**
Contagem de itens com saldo zero não tem tool dedicada.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R11] Faturamento por estado esse mês

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Faturamento por estado no mês corrente"})

**Razões do judge:**
Faturamento por estado não tem tool dedicada; lacuna registrada.

**Resposta dada (trunc 800):**
Essa métrica por estado não está disponível ainda. Registrei o pedido para a próxima etapa.

---

## [R11] Pedidos sem vendedor atribuído

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos sem vendedor atribuído"})

**Razões do judge:**
Pedidos sem vendedor não tem tool com esse filtro.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R11] Faturamento por marca esse mês

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Faturamento por marca no mês corrente"})

**Razões do judge:**
Faturamento por marca não tem tool dedicada.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda. Registrei pra próxima etapa.

---

## [R11] Quantos parceiros são pessoa física?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "cadastros", "perguntaResumo": "Quantidade de parceiros classificados como pessoa física"})

**Razões do judge:**
Contagem PF vs PJ não tem tool dedicada (mas tem pra PJ - vide #77). Inconsistência.

**Resposta dada (trunc 800):**
Essa métrica não está disponível no momento; registrei para a próxima etapa.

---

## [R11] Tempo médio de fechamento do pedido

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Tempo médio de fechamento do pedido"})

**Razões do judge:**
Tempo médio fechamento pedido: métrica complexa sem tool dedicada.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R12] Parceiros novos cadastrados esta semana

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "cadastros", "perguntaResumo": "Listar ou contar parceiros novos cadastrados nesta semana"})

**Razões do judge:**
Parceiros novos semana: cadastro_buscar_parceiro nao tem filtro data_cadastro.

**Resposta dada (trunc 800):**
Essa métrica ainda não está disponível; registrei o pedido para a próxima etapa.

---

## [R12] Top 5 produtos por margem (preço de venda vs custo)

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial / estoque", "perguntaResumo": "Top 5 produtos por margem (preço de venda vs custo)"})

**Razões do judge:**
Top 5 por margem: precisa cruzar preco_produto + custo (composicao avancada).

**Resposta dada (trunc 800):**
Essa métrica ainda não está disponível no painel operacional. Registrei sua solicitação para a próxima etapa.

---

## [R12] Liquidez imediata

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "financeiro", "perguntaResumo": "Métrica financeira de liquidez imediata (caixa e equivalentes sobre passivo circulante)"})

**Razões do judge:**
Liquidez imediata: indicador financeiro complexo sem tool dedicada.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R12] Quantas contas temos no plano contábil?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "contábil", "perguntaResumo": "Contagem total de contas no plano contábil"})

**Razões do judge:**
Quantas contas plano: agente registrou lacuna; #93 mostrou que da pra contar via contabil_plano_de_contas.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda; registrei pra próxima etapa.

---

## [R12] Pedido faturado parcialmente

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Listar ou medir pedidos faturados parcialmente."})

**Razões do judge:**
Pedido faturado parcialmente: nao tem tool de status fiscal-pedido.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa. Posso ajudar com pedidos, faturamento, títulos e estoque.

---

## [R12] Valor total dos impostos pagos esse mês

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Valor total dos impostos pagos neste mês"})

**Razões do judge:**
Valor impostos pagos mes: precisaria tool fiscal_impostos_pagos especifico.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R12] Faturamento por marca esse mês

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal/comercial", "perguntaResumo": "Faturamento por marca no mês corrente"})

**Razões do judge:**
Faturamento por marca: sem agrupador de marca em fiscal.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda; registrei para a próxima etapa.

---

## [R12] Tempo médio de fechamento do pedido

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Tempo médio de fechamento do pedido"})

**Razões do judge:**
Tempo medio fechamento: metrica complexa.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda; registrei para a próxima etapa.

---

## [R12] Vai bater a meta esse mês?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Avaliação de atingimento de meta mensal de vendas/faturamento"})

**Razões do judge:**
Vai bater a meta: precisa meta cadastrada, nao tem tool.

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R13] Tempo médio de fechamento do pedido

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Tempo médio de fechamento do pedido"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda. Registrei para a próxima etapa.

---

## [R13] Parceiros sem documento cadastrado

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "cadastros", "perguntaResumo": "Listar parceiros sem documento cadastrado"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda; registrei para a próxima etapa.

---

## [R13] Pedidos sem vendedor atribuído

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos sem vendedor atribuído"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R13] Quantos produtos não tem saldo cadastrado?

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "estoque", "perguntaResumo": "Quantidade de produtos sem saldo cadastrado no estoque"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda. Registrei pra próxima etapa.

---

## [R13] Pedido sem nota emitida ainda

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial/fiscal", "perguntaResumo": "Listar ou contar pedidos sem nota fiscal emitida ainda"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R13] Pedidos por estado

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos agrupados por estado/UF dos clientes no período"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R13] Faturamento por estado esse mês

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Faturamento por estado no mês corrente"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa.

---

## [R13] Fornecedor sem cadastro

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "cadastros", "perguntaResumo": "Listar fornecedores sem cadastro ou com cadastro ausente/indefinido"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda, registrei pra próxima etapa. Posso ajudar com dados de cadastro já existentes, como fornecedores por nome, documento ou UF.

---

## [R13] Top 10 pedidos abertos por valor

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Top 10 pedidos abertos por valor no mês corrente"})

**Razões do judge:**
Lacuna registrada honestamente | tools=comercial_pedidos_periodo+registrar_lacuna

**Resposta dada (trunc 800):**
Essa visão de **top 10 pedidos abertos por valor** ainda não está disponível agora. Registrei sua demanda.

---

## [R13] vai fechar meta esse mês?

- patterns: `acerto_objetividade`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Verificar se a empresa vai fechar a meta neste mês"})

**Razões do judge:**
Lacuna registrada honestamente | tools=registrar_lacuna

**Resposta dada (trunc 800):**
Essa métrica não está disponível ainda; registrei pra próxima etapa.

---

## [R15] Pedidos sem vendedor atribuído

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos sem vendedor atribuído"})

**Razões do judge:**
Filtro de pedidos sem vendedor não existe nas tools atuais. Registrou lacuna corretamente e devolveu resposta honesta. Limitação real.

**Resposta dada (trunc 800):**
Não consigo filtrar pedidos sem vendedor atribuído com as funcionalidades atuais. Posso te ajudar com:

---

## [R15] Top 10 pedidos abertos por valor

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Top 10 pedidos abertos por valor"})

**Razões do judge:**
Top pedidos abertos por valor nao existe como tool; o agente registrou lacuna e respondeu com a sugestao oficial. Gap de produto, nao de agente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Pedidos em entrega que estão atrasados

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos em entrega que estão atrasados"})

**Razões do judge:**
Não há tool de pedidos em entrega/SLA logístico. Lacuna registrada, resposta honesta.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Faturamento por mês esse ano

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Faturamento mês a mês do ano corrente"})

**Razões do judge:**
Faturamento mes a mes do ano corrente nao tem tool; registrou lacuna e devolveu sugestao oficial. Gap de produto.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] vai fechar meta esse mês?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Verificar se a meta do mês vai fechar"})

**Razões do judge:**
Meta do mês não existe no ERP; registrar_lacuna usado.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Vai bater a meta esse mês?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Projeção de atingimento de meta mensal sem definição de meta ou histórico de meta no ERP"})

**Razões do judge:**
Pergunta sobre projeção/meta sem dado de meta no ERP; usou registrar_lacuna corretamente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Top 5 produtos por margem (preço de venda vs custo)

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial / estoque / preços", "perguntaResumo": "Top 5 produtos por margem entre preço de venda e custo"})

**Razões do judge:**
Margem (preço x custo) não tem tool dedicada; registrar_lacuna usado corretamente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Houve entrada de qual produto na última semana?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - estoque_top_movimentados({"sentido": "entrada", "periodoDe": "2026-05-21", "periodoAte": "2026-05-27"})

**Razões do judge:**
Tool retornou estado vazio (0 entradas na última semana). Resposta honesta refletindo o dado.

**Resposta dada (trunc 800):**
Não encontrei entradas de estoque na última semana.

---

## [R15] Nota fiscal de entrada do fornecedor com CNPJ XX

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  (nenhuma)

**Razões do judge:**
Usuário enviou placeholder 'CNPJ XX' sem valor real; pedir CNPJ completo é correto e necessário (não dá para assumir).

**Resposta dada (trunc 800):**
Preciso do **CNPJ completo** do fornecedor para localizar as notas de entrada.

---

## [R15] Liquidez imediata

- patterns: `limitacao_real_declarada,resposta_truncada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "financeiro", "perguntaResumo": "Quero a liquidez imediata da empresa"})

**Razões do judge:**
Liquidez imediata como indicador composto nao existe (registrou lacuna). Gap legitimo. Porem a resposta final corta apos 'Posso te dar os componentes pra voce avaliar:' sem listar os componentes prometidos (sugestoesRelacionadas).

**Resposta dada (trunc 800):**
Esse indicador financeiro não está calculado no painel. Posso te dar os componentes pra você avaliar:

---

## [R15] Pedidos por estado

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos por estado (quantidade e/ou valor, agrupado por UF)."})

**Razões do judge:**
Pedidos agregados por UF não há tool dedicada. Registrou lacuna e respondeu honestamente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Parceiros do interior de SP

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "cadastros", "perguntaResumo": "Listar parceiros do interior de São Paulo (UF SP, fora da capital)"})

**Razões do judge:**
Não há tool para distinguir capital vs interior. Registrou lacuna corretamente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Quanto vai sair essa semana?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "financeiro", "perguntaResumo": "Quanto vai sair essa semana? (saídas previstas de caixa na semana corrente)"})

**Razões do judge:**
Saídas previstas/projeção de caixa não está no catálogo. Registrou lacuna e respondeu honestamente com sugestões alternativas.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Tem dinheiro pra pagar a folha?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "financeiro/rh", "perguntaResumo": "Verificar se há caixa disponível suficiente para pagar a folha de pagamento"})

**Razões do judge:**
Pergunta cruza caixa com folha de pagamento, não há tool de RH. Registrou lacuna e respondeu honestamente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R15] Valor total dos impostos pagos esse mês

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Valor total dos impostos pagos neste mês"})

**Razões do judge:**
Total de impostos pagos nao existe como tool; registrou lacuna e devolveu a respostaSugerida com alternativas. Gap de produto.

**Resposta dada (trunc 800):**
Não temos o agregado de impostos pagos. Posso te ajudar com: impostos do período, plano de contas de impostos ou notas emitidas esse mês.

---

## [R16] Pedidos em entrega que estão atrasados

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos na etapa 'em entrega' atrasados, com listagem e valor em atraso."})

**Razões do judge:**
'Pedidos em entrega atrasados' nao tem tool dedicada. Agente registrou lacuna e respondeu padrao de gap.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R16] Conta a receber em 30 dias

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "financeiro", "perguntaResumo": "contas a receber previstas para os próximos 30 dias"})

**Razões do judge:**
Projecao futura de contas a receber nao esta nas tools. registrar_lacuna acionado, resposta padrao de gap. Nota: poderia ter chamado financeiro_contas_a_receber filtrando por janela de 30 dias, entao ha sinal fraco de gap_de_orquestracao, mas como nao existe filtro de previsao, mantenho FORA_DE_ESCOPO.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R16] Faturamento por estado esse mês

- patterns: `limitacao_real_declarada,resposta_truncada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "fiscal", "perguntaResumo": "Faturamento por estado neste mês"})

**Razões do judge:**
Faturamento por estado não está agrupado no painel; registrou lacuna correta. Mas resposta cortou em 'Posso te dar visões alternativas:' sem listar as alternativas.

**Resposta dada (trunc 800):**
Esse corte não está agrupado no painel. Posso te dar visões alternativas:

---

## [R16] Quais clientes têm pedido em aberto e título vencido

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial/financeiro", "perguntaResumo": "Listar clientes que tenham pedido em aberto e título vencido ao mesmo tempo."})

**Razões do judge:**
Cruzamento de pedido em aberto + titulo vencido nao existe como tool. Agente usou registrar_lacuna e respondeu honestamente.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R16] Pedidos sem vendedor atribuído

- patterns: `limitacao_real_declarada,resposta_truncada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos sem vendedor atribuído"})

**Razões do judge:**
Registrou lacuna corretamente (não há tool para filtrar pedidos sem vendedor). Mas a resposta cortou em 'Posso te ajudar com:' sem completar a lista de alternativas.

**Resposta dada (trunc 800):**
Não consigo filtrar pedidos sem vendedor atribuído com as ferramentas atuais. Posso te ajudar com:

---

## [R16] Cliente com pedido em aberto e contas a receber em atraso

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial/financeiro", "perguntaResumo": "Listar clientes que tenham pedido em aberto e contas a receber vencidas, cruzando pedidos e títulos por cliente."})

**Razões do judge:**
Cruzamento pedidos em aberto x contas a receber em atraso não tem tool dedicada. Registrou lacuna corretamente e respondeu de forma honesta com oferta de outras vias.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R16] Pedido do cliente Smartfit

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "comercial", "perguntaResumo": "Pedidos do cliente Smartfit"})

**Razões do judge:**
Pedidos comerciais ainda não estão no escopo do MCP. Lacuna registrada e resposta honesta sugerindo alternativas.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R16] Parceiros do Rio de Janeiro

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "cadastros", "perguntaResumo": "Listar parceiros cadastrados do Rio de Janeiro (cidade ou UF)"})

**Razões do judge:**
Filtro de parceiros por UF/cidade não existe como tool dedicada (cadastro_buscar_parceiro é por termo livre). Agente registrou lacuna e devolveu resposta honesta de indisponibilidade. Limitação real.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

## [R16] Produtos do family pé na bola?

- patterns: `limitacao_real_declarada`
- modelo: gpt-5.4-mini
- tools chamadas:
  - registrar_lacuna({"dominio": "estoque", "perguntaResumo": "Listar produtos de uma família específica pelo nome 'pé na bola'."})

**Razões do judge:**
Busca de produtos por nome de família não existe como tool dedicada. Agente registrou lacuna e devolveu resposta honesta. Limitação real do catálogo.

**Resposta dada (trunc 800):**
Essa informação não está disponível no ERP no momento. Posso te ajudar com outros dados de estoque, financeiro, fiscal, comercial, cadastros ou contábil.

---

