# Relatório R15 , 100 turnos pós-ondas E+F1+F2+F3+F4+F5+G+H

Data: 2026-05-27
Marker: `[AUDIT-POS-2026-05-27T03-33-55]`
Modelo: gpt-5.4-mini (LlmConfig ativo)
Concorrência: 5
Duração: 302s

## Totais

| Status | Quantidade | % |
|---|---:|---:|
| CORRETO | 68 | 68.0% |
| PARCIAL | 13 | 13.0% |
| ERRADO | 4 | 4.0% |
| FORA_DE_ESCOPO | 15 | 15.0% |

**Saúde (CORRETO + FORA_DE_ESCOPO) / total = 83.0%**

## Histórico (comparativo)

| Rodada | Modelo | CORRETO | PARCIAL | ERRADO | FORA |
|---|---|---:|---:|---:|---:|
| R12 | mini | 47% | 39% | 14% | 0% |
| R13 | mini | 58% | 36% | 5% | 1% |
| R14 | mini | 74% | 23% | 0% | 3% |
| **R15** | **mini** | **68%** | **13%** | **4%** | **15%** |

## Precisão factual

| Métrica | Valor |
|---|---:|
| bate | 73 |
| nao_bate | 6 |
| nao_aplicavel | 21 |
| **Precisão (bate / (bate+nao_bate))** | **92.4%** |

## Padrões detectados

| Pattern | Ocorrências |
|---|---:|
| `acerto_objetividade` | 66 |
| `limitacao_real_declarada` | 17 |
| `acerto_modelo` | 8 |
| `acerto_encadeamento` | 5 |
| `dado_inventado` | 5 |
| `resposta_truncada` | 4 |
| `parametro_incompleto` | 3 |
| `fluxo_tool_incompleto` | 2 |
| `tool_errada` | 2 |
| `formato_quebrado` | 2 |
| `placeholder_nao_substituido` | 1 |
| `entendeu_mal_termo` | 1 |
| `recusa_indevida` | 1 |
| `pergunta_ignorada` | 1 |

## Falhas (amostra , top 15)

Total a investigar: 17 turnos. Detalhe em `results-r15/_agg.json`.

### 11dbbf43 , PARCIAL
- batch: batch-0001
- patterns: `parametro_incompleto`
- factual: bate
- razão: Usuário pediu 'a receber' mas a tool foi chamada sem o parâmetro tipo=a_receber, trazendo a_pagar misturado. A resposta filtrou bem só os a_receber e os valores listados batem com o toolResults, mas a chamada foi mais cara que o necessário.
- sugestão: Adicionar regra: 'quando usuário disser "a receber" ou "a pagar", passar tipo correspondente em financeiro_titulos_vencidos'.

### 2f8e9b73 , ERRADO
- batch: batch-0001
- patterns: `placeholder_nao_substituido, dado_inventado`
- factual: nao_bate
- razão: Resposta lista nomes de devedores mas com texto literal 'não consegui obter esse dado' em vez dos valores agregados. Os títulos estão no toolResults; bastava somar por participante. Resultado é texto quebrado que não responde a pergunta.
- sugestão: Adicionar regra: 'para devedores principais, agregar vrSaldo por participanteNome e listar top N com soma; nunca escrever placeholder textual no lugar de valor calculável a partir do toolResults'.

### 378f9da7 , PARCIAL
- batch: batch-0001
- patterns: `entendeu_mal_termo`
- factual: bate
- razão: Usuário perguntou 'devolveu nota' (saída/devolução, NF emitida pelo cliente), mas a IA usou fiscal_notas_recebidas_por_fornecedor (entrada). Reconheceu a limitação no final, mas a tool foi conceitualmente errada para detectar devolução.
- sugestão: Adicionar regra: 'pergunta sobre devolução de nota? Considerar consultar fiscal_notas_emitidas filtrando por natureza/CFOP de devolução, não só notas_recebidas'.

### 3fcebc83 , PARCIAL
- batch: batch-0001
- patterns: `parametro_incompleto`
- factual: bate
- razão: Pedido era 'em rascunho'. A etapa literal 'P - Em digitação' (1 pedido, R$ 98,95) é a resposta exata, e foi mencionada. Mas a IA também ofereceu agregado mais amplo (533 pedidos não finalizados) misturando conceitos. Confunde mais do que ajuda — 'rascunho' não é 'todo não finalizado'.
- sugestão: Adicionar regra: 'rascunho/draft = etapas com nome explícito de digitação/rascunho/provisório; não somar todas as não-finalizadas como rascunho'.

### 47161eeb , PARCIAL
- batch: batch-0001
- patterns: `parametro_incompleto`
- factual: bate
- razão: Tool não foi filtrada por armazém apesar de o usuário pedir 'no armazém'. Resultado fica genérico (6 cadastros, saldo 0). Resposta honesta mas perdeu o filtro pedido.
- sugestão: Adicionar regra: 'pergunta cita armazém? Se único armazém ou contexto óbvio, listar saldos por armazém; senão, perguntar qual armazém'.

### 4d550a64 , PARCIAL
- batch: 0002
- patterns: `limitacao_real_declarada`
- factual: bate
- razão: Tool cadastro_buscar_parceiro retornou 14 nomes; resposta lista os nomes corretamente e declara honestamente que o status de ativo nao veio. Ainda assim a pergunta era 'ativas' e a tool generica nao traz esse filtro.
- sugestão: Mapear 'transportadoras ativas' para tool dedicada (cadastro_listar_por_categoria + filtro ativo) ou registrar lacuna em vez de busca textual.

### 5c11af6a , PARCIAL
- batch: 0002
- patterns: `fluxo_tool_incompleto`
- factual: bate
- razão: Tool retornou 10 filiais do Smartfit; resposta apenas lista, sem encadear cadastro_detalhar_parceiro para entregar o 'cadastro completo' pedido (endereco, contato, condicao de pagto etc.). Ficou em listagem rasa.
- sugestão: Adicionar regra: 'Pergunta sobre cadastro completo de cliente? Apos cadastro_buscar_parceiro, se houver match unico ou top1 dominante, encadear cadastro_detalhar_parceiro para trazer dados completos'.

### 5e80ee7b , PARCIAL
- batch: 0002
- patterns: `resposta_truncada, dado_inventado`
- factual: nao_bate
- razão: Resposta cita 'Smartfit R$ 533.102,00' como maior devedor. O nome Smartfit nao aparece nas primeiras paginas do toolResults visivel (predomina Edificio Porto Farol), e a propria IA admite que 'a listagem veio truncada'. Numero nao confirmavel contra a amostra disponivel.
- sugestão: Adicionar regra: 'Quando contas a receber retorna lista grande, usar financeiro_titulos_vencidos ou financeiro_top_devedores ao inves de inferir top devedor de amostra'.

### 6171cf27 , ERRADO
- batch: 0002
- patterns: `dado_inventado, tool_errada`
- factual: nao_bate
- razão: Pergunta era 'lista de fornecedores ativos'. Tool chamada (cadastro_buscar_parceiro com termo='.') nao retorna agregado de totais, retorna apenas linhas. Resposta declara '754 fornecedores ativos e 0 inativos' (numeros que so vem de cadastro_contar_parceiros, nao chamada aqui). Alem disso a tool nao filtra por fornecedor: a amostra mostra Matrizes/Filiais sem garantia de serem fornecedores.
- sugestão: Adicionar regra: 'Pergunta lista de fornecedores? Usar tool cadastro_listar_parceiros com filtro ehFornecedor=true, e nao buscar por termo generico'.

### 7ae133c9 , PARCIAL
- batch: 0002
- patterns: `resposta_truncada`
- factual: nao_aplicavel
- razão: fiscal_notas_emitidas retornou linhas com sucesso, mas a IA respondeu 'nao consegui obter o total exato agora' e parou. Resposta truncada e desistencia sem entregar o total que estaria no _agregado/_DESTAQUE da tool.
- sugestão: Adicionar regra: 'Quando tool retornar com estado=ok e _DESTAQUE/_agregado preenchido, NUNCA dizer nao consegui; usar contagemLinhas ou totalNotas como total autoritativo'.

### 84a30d9e , PARCIAL
- batch: 0002
- patterns: `resposta_truncada`
- factual: nao_aplicavel
- razão: financeiro_contas_a_pagar retornou lista de titulos; IA desistiu dizendo 'nao consegui obter o total consolidado'. Provavelmente o _agregado/_DESTAQUE da tool tinha o total, e mesmo se nao, somar vrSaldo era trivial.
- sugestão: Adicionar regra: 'Se a tool de contas_a_pagar/receber retornar titulos, sempre somar vrSaldo localmente para apresentar o total, mesmo sem _agregado'.

### a44e16f2 , PARCIAL
- batch: batch-0003
- patterns: `formato_quebrado`
- factual: nao_aplicavel
- razão: Tool retornou lista grande e foi truncada por tamanho, sem campo de total agregado consolidado. Agente declarou honestamente que não conseguiu consolidar. Falha real é da tool não devolver total — não do agente. Resposta fica curta demais e sem nenhuma informação útil para o usuário.
- sugestão: Adicionar regra: 'Quando contas_a_receber vier truncado sem total, listar os N maiores títulos disponíveis na resposta e avisar que o total exato exige consulta direcionada'.

### b898e94e , PARCIAL
- batch: batch-0003
- patterns: `dado_inventado`
- factual: nao_bate
- razão: Erro de leitura do toolResult: agregado_quantidade.soma é 6.325 (total geral, incluindo 270 sem UF), não '6.325 com UF informada'. O correto seria 6.055 com UF e 270 sem UF, total 6.325. A lista por UF está correta.
- sugestão: Adicionar regra: 'Em cadastro_parceiros_por_uf, distinguir entre total absoluto (agregado.soma) e total com UF informada (soma das linhas com uf != null)'.

### df8bd423 , PARCIAL
- batch: batch-0004
- patterns: `tool_errada`
- factual: bate
- razão: Usuário pediu 'vendedores cadastrados'; a IA usou comercial_pedidos_por_vendedor (só lista vendedores com pedidos). Lista 20 mas pode haver vendedores cadastrados sem pedidos não capturados.
- sugestão: Adicionar regra: 'Quando usuário pedir vendedores cadastrados (não pedidos), preferir tool de cadastros se existir; senão, esclarecer que a lista é só de vendedores com pedidos no ERP'.

### e490a8bb , PARCIAL
- batch: batch-0004
- patterns: `limitacao_real_declarada, formato_quebrado`
- factual: bate
- razão: Saldo do 102 (16 un, R$ 258.370,44, 5 locais) bate; mas para a 2ª parte (notas saídas) usou registrar_lacuna e concatenou texto genérico no fim, sem deixar claro que a 1ª parte foi respondida e a 2ª recusada.
- sugestão: Adicionar regra: 'Em perguntas multi-parte com lacuna em uma parte, separar visualmente a parte respondida da parte sem dado, evitando concatenar texto de recusa logo após o dado real'.

## Análise

Regressão de 6 pontos vs R14 (74%). Investigar.

ERRADO em 4% (R14: 0%). Volta de erros factuais , sinaliza que o modelo mini está alucinando mais com o prompt enxuto (Bateria 11 rewrite) ou que as novas tools/sanitizadores expuseram bordas.

Saúde 83.0% agregando gaps reais ao acerto, mas a meta interna de 95% CORRETO bruto não foi atingida.

## Próximos passos sugeridos

- **dado_inventado** (5x): reforçar no prompt que números/nomes devem vir SEMPRE de toolResults; nunca inferir.
- **resposta_truncada** (4x): investigar limite de tokens output ou parada precoce do modelo.
- **parametro_incompleto** (3x): adicionar exemplos no identity-base de extração de parâmetros de pergunta.
- **fluxo_tool_incompleto** (2x): documentar fluxos canônicos de encadeamento.
- **tool_errada** (2x): revisar descrições das tools para desambiguação.
