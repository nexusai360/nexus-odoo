# Laudo do Agente Nex — Rodadas R11, R12, R13, R15, R16

**Data:** 2026-05-27
**Autor:** Claude Code (Opus 4.7)
**Fonte:** `conversation_quality_evaluations` (banco local), 144 turnos com status PARCIAL, ERRADO ou FORA_DO_ESCOPO
**Objetivo:** identificar causas raiz dos erros do agente em produção real, separar o que se resolve com código (tools, fatos, agregação no servidor) do que se resolve com prompt, e propor uma sequência de ondas para alcançar **≥90% de acerto** semântico.

> **Restrição de design:** o agente roda com `gpt-5.4-mini`, latência limitada, contexto curto. Toda otimização que pode sair do LLM e entrar no código (tool, fato, agregação) deve sair. O LLM só decide o que **só ele consegue decidir**.

---

## 1. Sumário executivo

### 1.1 Métricas brutas das rodadas avaliadas

| Rodada | Corretos | Parciais | Errados | Fora escopo | Total | % correto |
|--------|----------|----------|---------|--------------|-------|-----------|
| R11    | 75       | 17       | 0       | 8            | 100   | **75,0%** |
| R12    | 74       | 17       | 0       | 9            | 100   | **74,0%** |
| R13    | 74       | 16       | 0       | 10           | 100   | **74,0%** |
| R15    | 68       | 13       | 4       | 15           | 100   | **68,0%** |
| R16    | 65       | 13       | 13      | 9            | 100   | **65,0%** |

R15 e R16 regrediram — quando a bateria ganhou perguntas mais agressivas (cruzamentos, agregações exigidas), o ERRADO disparou de 0 para 13. **A causa raiz de R16 é uma regressão clara em duas frentes: (a) agente parou de chamar a tool indicada e respondeu com número inventado, (b) agente recebeu tool com dados em mãos e respondeu "não disponível".**

### 1.2 Distribuição dos 144 erros

| Status | Casos | Causa dominante |
|--------|-------|------------------|
| **PARCIAL** | 76 (53%) | Agente desistiu cedo (`resposta_truncada`, `fluxo_tool_incompleto`) — tinha dado em mãos e não agregou |
| **ERRADO** | 17 (12%) | Invenção de número, agregação errada, recusa indevida com dado disponível |
| **FORA_DO_ESCOPO** | 51 (35%) | Maioria legítima (sem tool de meta, margem, faturamento por estado/marca/região, cruzamentos pedido↔nota); minoria recuperável (parceiros novos da semana, top pedidos abertos, etc.) |

### 1.3 Top 5 padrões diagnósticos (entre PARCIAL+ERRADO+FORA)

| Pattern | Casos | Onde concentra | Natureza |
|---------|-------|----------------|----------|
| `limitacao_real_declarada` | 46 | quase só FORA_DO_ESCOPO | em sua maioria, legítimo |
| `fluxo_tool_incompleto` | 21 | quase só PARCIAL | **fixável** (prompt + tools com filtro melhor) |
| `resposta_truncada` | 18 | PARCIAL e ERRADO | **fixável** (campo `_DESTAQUE` ignorado, ou agregação não feita) |
| `dado_inventado` | 14 | quase só ERRADO | **fixável** (guardrail no servidor pra forçar agregação no envelope) |
| `entendeu_mal_termo` | 10 | PARCIAL | parcialmente fixável (busca fuzzy + sinônimos) |

### 1.4 Conclusões e direção do fix

1. **A maior alavanca está no envelope das tools**, não no prompt. O prompt já manda agregar; o agente está ignorando o agregado ou agregando errado. A solução é fazer o servidor entregar o **resultado pronto** (campo `_RESPOSTA` curado), de modo que o LLM só formate o que recebe. Isso resolve `resposta_truncada` (18), `dado_inventado` parcial (8 dos 14) e `fluxo_tool_incompleto` para casos de soma/contagem (7 dos 21).
2. **Auto-validação no servidor antes da resposta final.** Quando heurísticas detectam suspeita (resposta numérica sem número, "não consegui obter" com `_DESTAQUE` presente, "veio truncado" sem flag de truncamento, número de fora dos `toolResults`), o servidor força uma segunda passada do LLM com instrução corretiva. Cap rígido: 1 retry. Resolve ~12 dos 17 ERRADO.
3. **Tools faltando ou incompletas** explicam ~22 FORA_DO_ESCOPO recuperáveis. Cinco tools novas/expansões cobrem o gap: `cadastro_parceiros_recentes` (semana), `comercial_pedidos_top_valor_aberto` (já existe `pedidos_listar_top_valor` mas não está sendo usada para esse caso), `estoque_saldo_produto_por_local` (locais por produto), `fiscal_faturamento_mensal_serie` (série mês a mês), `comercial_pedidos_sem_vendedor`. Não criar tools de meta, margem, liquidez, etc — esses são pedidos legítimos fora do escopo do ERP atual.
4. **Prompt precisa de 6 ajustes cirúrgicos**, não reescrita. Ver §6.2.
5. **Trocar a tool genérica `cadastro_buscar_parceiro` por uma com filtro explícito de papel (fornecedor/cliente/transportadora)** corrige 3 ERRADO de R15-R16 (lista de transportadoras contaminada, lista de fornecedores não filtrada, etc).
6. **Datas relativas** ("amanhã", "essa semana") precisam de utilitário no servidor — hoje o LLM precisa converter para offset de dias e erra (R16 `Parcelas que vencem amanhã` → `ateDias=1` que pegou hoje).

### 1.5 Meta de assertividade

- **Hoje:** 65–75% por rodada.
- **Após Onda 1 (envelope `_RESPOSTA`, auto-validação no servidor, 6 prompt fixes):** projeto **+12 a +15 pp** → **≥85%**.
- **Após Onda 2 (5 tools novas/expansões + remoção de `cadastro_buscar_parceiro` como tool default):** projeto mais **+5 a +8 pp** → **≥90–93%**.
- **Onda 3 (refinos finais + few-shot dinâmico):** **≥95%**.

Ondas 1 e 2 são determinísticas (código). Onda 3 é incremental e contínua.

---

## 2. Análise por padrão de erro

Cada subseção lista: descrição, exemplos representativos, causa raiz, fix proposto e classificação (código / prompt / tool nova / legítimo).

### 2.1 `resposta_truncada` (18 casos) — **FIX por código**

Agente declarou "veio cortado", "veio truncado", "não consegui obter total consolidado" mesmo com agregado disponível no envelope da tool.

**Exemplos:**
- [R11] "Total em aberto a pagar" → tool `financeiro_contas_a_pagar` retornou lista, agente respondeu "retorno veio incompleto" sem usar `totalAPagar`.
- [R12] "Quanto a empresa deve hoje?" → mesma tool, mesma falha.
- [R12] "Total em aberto a receber" → idem com `totalAReceber`.
- [R15] "Quantas notas fiscais emitimos esse mês?" → `fiscal_notas_emitidas` tem agregado, agente disse "não consegui obter o total exato agora".
- [R16] "Conta a pagar em 30 dias" → registrar_lacuna redirecionou para `financeiro_contas_a_pagar`, agente **não chamou** e ainda **inventou** R$ 1.352.659,18.

**Causa raiz:** o prompt manda usar `_agregado`, mas a tool não devolve sempre na mesma estrutura. Casos identificados:
1. `financeiro_contas_a_pagar/receber` retornam `totalAPagar`/`totalAReceber` no topo, mas quando lista é truncada por tamanho de payload o agente confunde "lista truncada" com "total não-confiável".
2. `bi_consulta_avancada` retorna `_DESTAQUE` mas o agente declara truncamento mesmo assim.
3. Algumas tools (`comercial_pedidos_atrasados`, `estoque_produtos_parados`) listam top N **e** trazem total — o agente não distingue.

**Fix (código):**
- **F1.** Criar campo `_RESPOSTA` no envelope de TODA tool, com **texto pronto e curado pelo servidor** para a pergunta canônica daquela tool (ex: `_RESPOSTA: "Total em aberto a pagar: R$ X. Lista mostra top N de M."`). LLM **deve** usar este texto literal quando pergunta cair no canônico.
- **F2.** Adicionar campo booleano `_listaTruncada` (true só quando há mais linhas que o limite explícito da tool). Quando false E a pergunta pede total, agente é **proibido** de dizer "truncado".
- **F3.** Auto-validação: se a resposta do LLM contém regex `/(veio (truncad|cortad|incompleto)|não consegui obter)/i` mas o envelope tem `_DESTAQUE`/`totalA*`/`_agregado.*` → retry forçado com instrução corretiva.

---

### 2.2 `fluxo_tool_incompleto` (21 casos) — **FIX por código + prompt**

Agente chamou `registrar_lacuna` quando a métrica era composição de tools existentes, OU não encadeou a 2ª tool depois de ter o nome do parceiro/produto.

**Exemplos por categoria:**

**(a) Lacuna indevida com tool existente:**
- [R11] "Fornecedor que mais devemos" → registrar_lacuna; deveria agrupar `contas_a_pagar.titulos` por `participanteNome`.
- [R11] "Conta a receber em 30 dias" → registrar_lacuna; `financeiro_contas_a_receber` tem `dataVencimento` filtrável.
- [R11] "Parceiros novos cadastrados esta semana" → registrar_lacuna; cadastro_buscar_parceiro não tem filtro de data (tool gap real, mas LLM acertaria se tivesse o filtro).
- [R11] "Pedido com maior valor em aberto" → registrar_lacuna; tool `comercial_pedidos_listar_top_valor` existe (catálogo §`Comercial`), mas LLM não a conhece.
- [R12] "Comparativo de faturamento por mês esse ano" → registrar_lacuna; deveria iterar `fiscal_faturamento_periodo` 5 vezes (jan-mai/2026).
- [R12] "Quantos clientes ativos?" → registrar_lacuna; `cadastro_contar_parceiros` retorna `totalClientesAtivos`.

**(b) Cadeia interrompida (não chamou a 2ª tool):**
- [R15] "Cadastro completo do cliente Smartfit" → chamou `cadastro_buscar_parceiro` (devolveu 10 filiais), parou. Não chamou tool de detalhes (que **não existe** — gap real).
- [R12] "Quais armazéns têm o produto 102?" → `estoque_saldo_produto` retornou `numLocais=5` mas sem listar; registrar_lacuna.

**Causa raiz:** o prompt tem a tabela "Combinação de tools" (linha 174-189 de `identity-base.ts`) mas **só 5 das 14 perguntas dos testes batem com algum padrão dessa tabela**. Agente desiste por padrão.

**Fix:**
- **F4. (código)** Servidor agrega no envelope o que hoje é "composição": campo `topPorParticipante` em `financeiro_contas_a_pagar`/`a_receber` (top 10 fornecedores/clientes já agrupados). Resolve 5 dos 21.
- **F5. (código)** Adicionar tool `fiscal_faturamento_mensal_serie({ano})` que itera internamente — resolve mês a mês.
- **F6. (código)** `comercial_pedidos_listar_top_valor` já existe; **prompt** precisa mencionar mais alto (hoje só aparece no catálogo). Adicionar 2 exemplos.
- **F7. (prompt)** Adicionar regra explícita: **"antes de chamar `registrar_lacuna`, releia a tabela de Combinação. Se a pergunta pede 'maior/top/fornecedor que mais/cliente que mais', chame a tool de listagem, NÃO declare lacuna."** Onda D já tinha isso, mas em tom suave; reforçar.
- **F8. (código + prompt)** Para casos de cadeia: nova tool `cadastro_detalhar_parceiro({participanteId})` que devolve em uma chamada nome, doc, endereço, condição de pagamento. Resolve o "cadastro completo" do Smartfit.

---

### 2.3 `dado_inventado` (14 casos, 12 em ERRADO) — **FIX por código (crítico)**

Agente inventou número, ranking ou cita resultado de tool que não chamou.

**Exemplos críticos:**
- [R16] "Quantos pedidos abertos temos?" → respondeu **519**; soma real das etapas não finalizadas era **526**.
- [R16] "Quantas notas recebemos do fornecedor SMARTFIT?" → respondeu **170 notas, 70 cadastros**; toolResults tinha **30 linhas somando 68 notas**.
- [R16] "Vendedores cadastrados" → registrar_lacuna disse pra usar `comercial_pedidos_por_vendedor`; agente **não chamou**, mas ainda assim respondeu "19 vendedores" com lista de 10 nomes.
- [R16] "Conta a pagar em 30 dias" → tool `financeiro_contas_a_pagar` **não foi chamada**, mas resposta cita "R$ 1.352.659,18 em 22 títulos".
- [R16] "Devedores principais" → omitiu CONDOMINIO ALTOS DO UMARIZAL (estava no toolResults com R$ 320k, seria o 3º maior), inventou ranking parcial.
- [R16] "Top 10 produtos mais vendidos e qual o saldo atual" → fez 10 chamadas `estoque_saldo_produto` com termos numéricos "99", "28", "391", etc.; nenhuma retornou produto único; mesmo assim respondeu saldos específicos.

**Causa raiz:**
1. Modelo gpt-5.4-mini, sob pressão de muitas tools no contexto, alucina números plausíveis.
2. Quando `registrar_lacuna` devolve `redirecionar`, o LLM lê o texto "use `tool_X`" e produz uma resposta como se tivesse chamado, sem chamar.
3. Quando lista tem >50 linhas e agente já chamou tool, segunda iteração para somar não é disparada — LLM "fecha" pela lista visível.

**Fix (código, alta prioridade):**
- **F9.** Servidor faz **validação estrutural pós-resposta**: extrai números da resposta final do LLM (regex `\bR?\$?\s*[\d.,]+\b`, `\b\d+ (pedidos|notas|cadastros|fornecedores|clientes)\b`), e verifica se cada um aparece em algum `_RESPOSTA`, `_DESTAQUE.*`, `_agregado.*`, ou em alguma linha de `toolResults`. Se não aparecer → **retry forçado** com instrução: "você citou números que não estão nos resultados. Releia e responda só com números que estejam nos toolResults." Cap: 1 retry.
- **F10.** `registrar_lacuna` quando devolve `redirecionar.tool`, em vez de só devolver texto pra LLM, o **servidor recusa a resposta final do turno até que o LLM efetivamente tenha chamado a tool redirecionada** (gate estrutural). Hoje o `redirecionar` é texto; vira contrato.
- **F11.** `estoque_saldo_produto` quando recebe `termo` puramente numérico com ≤4 dígitos, **não faz match aproximado** — devolve campo `ambiguidade.requiredExactMatch: true` orientando agente a pedir código completo ao usuário (regra estrutural, não conversacional). Resolve o R16 "Top 10 produtos mais vendidos".

---

### 2.4 `entendeu_mal_termo` (10 casos) — **FIX misto**

Agente confundiu termo, buscou em escopo errado ou aceitou match impreciso.

**Exemplos:**
- [R11], [R16] "Tem [1000362265] ainda?" → tool retornou produto [1000097424] (Mola Espiral); LLM tratou como se fosse o pedido.
- [R11] "Conta de impostos a recolher" → buscou "impostos a recolher" literal e disse não achar; conta `2.1.1.3.09 IMPOSTOS A RECOLHER` existe.
- [R12] "Conta de receita de vendas" → idem.
- [R12] "Quantos pedidos foram fechados esse mês?" → `comercial_pedidos_periodo` retornou 477, agente disse "não consegui separar fechados".
- [R11] "Top 5 produtos mais movimentados no mês" → tool chamada, retornou vazio, agente declarou "não encontrei movimentação"; toolResults provavelmente trouxe dado e LLM ignorou.
- [R15] "O cara da Casa Ferolla devolveu nota?" → usou `fiscal_notas_recebidas_por_fornecedor` (entrada), pergunta era sobre devolução (saída). Reconheceu no fim.

**Causa raiz:**
1. **Match fuzzy do `estoque_saldo_produto`** aceita códigos parecidos — bug real (servidor permite proximidade que devia rejeitar para códigos exatos com colchetes).
2. **`contabil_plano_de_contas` faz busca por LIKE termo% em vez de full-text** — não acha "IMPOSTOS A RECOLHER" buscando "impostos a recolher".
3. LLM não sabe que `comercial_pedidos_por_etapa` separa cancelado/concluído/em digitação.

**Fix:**
- **F12. (código)** `estoque_saldo_produto`: se `termo` é estritamente numérico e parece código (≥4 dígitos), **exigir match exato**. Se não bater, devolver `ambiguidade.exactMatchRequested: true` com a string buscada.
- **F13. (código)** `contabil_plano_de_contas`: trocar `LIKE` simples por `tsvector` (já existe `pg_trgm` no projeto) com normalização de acentos e plurais.
- **F14. (prompt)** Adicionar exemplo no catálogo de `comercial_pedidos_por_etapa`: "use pra separar fechados/cancelados/em digitação".
- **F15. (legítimo)** "Devolveu nota" exige tool de NFe de devolução, hoje não temos — fora do escopo legítimo até criar tool específica.

---

### 2.5 `recusa_indevida` (4 casos em ERRADO) — **FIX por código**

Tool retornou dados completos, agente respondeu "não disponível".

**Exemplos:**
- [R15] "Soma de contas a pagar por fornecedor" → `financeiro_contas_a_pagar` ok, resposta "não disponível".
- [R16] "Estou querendo saber quanto tem de halter em estoque" → `estoque_saldo_produto({termo:"halter"})` retornou 50 produtos, saldo 1.265 un, R$ 184.706,29; resposta "não consegui obter".
- [R16] "Quanto temos em contas a receber em aberto?" → `financeiro_contas_a_receber` ok, resposta "não consegui obter".
- [R16] "Soma de contas a pagar por fornecedor" → mesmo padrão de R15.

**Causa raiz:** quando o resultado é "agregado" (50 linhas com termo amplo), o LLM aplica heurística errada de "ambiguidade" — trata 50 produtos diferentes como se fosse uma busca exata sem match. Em ERRADO porque o agregado total era válido e satisfazia a pergunta ("quanto tem de halter" = soma).

**Fix:**
- **F16. (código)** Adicionar regra na auto-validação (F3+F9): se resposta começa com `/^Você tem razão|^Não consegui|^Essa informação não está disponível/i` mas o envelope tem `_RESPOSTA` curada OU `_DESTAQUE`/`_agregado` preenchidos → retry com instrução: "use o agregado mostrado".
- **F17. (prompt)** Regra explícita: **"Quando a pergunta é quantitativa ('quanto tem de X', 'soma de Y') e a tool devolveu `_agregado` com `soma`, NUNCA responda 'não consegui'. Use a soma direta."**

---

### 2.6 `pergunta_ignorada` (6 casos) — **FIX por código + prompt**

Agente lista coisas mas não responde a pergunta principal.

**Exemplos:**
- [R15] "Soma de contas a pagar por fornecedor" → listou nomes com "não consegui obter esse dado" em cada um.
- [R15] "Devedores principais" → mesma estrutura (lista com "não consegui").
- [R16] "Devedores principais" → ranking inventado parcial + "não consegui obter" em outros.
- [R16] "Quem tá devendo mais?" → respondeu com 3 devedores, mas divergiu valores.

**Causa raiz:** padrão "listar nomes com placeholder 'não consegui obter esse dado'" — efeito colateral de prompt que diz "se não tem dado, diga não consegui obter"; LLM aplicou por linha em vez de por agregado, ficando com texto quebrado.

**Fix:**
- **F18. (prompt)** Mudar a regra "Se não houver resultado: 'Não encontrei registros para esse critério'" → versão expandida: **"Esta frase substitui a resposta inteira, não substitui valores dentro de uma lista. Se você está numa lista, ou o valor existe e você cita, ou você omite a linha."**
- **F19. (código)** Auto-validação: se resposta contém frase "não consegui obter" como bullet em lista (regex `^[-\*]\s.*não consegui obter`), retry.

---

### 2.7 `parametro_incompleto` (4 casos) — **FIX por código**

Tool chamada sem o parâmetro que a pergunta exigia.

**Exemplos:**
- [R15] "Parcelas vencidas a receber" → `financeiro_titulos_vencidos({})` sem `tipo='a_receber'`, trouxe a_pagar misturado.
- [R15] "Quanto temos de mola espiral em aço no armazém?" → `estoque_saldo_produto` sem filtro de armazém apesar de "no armazém".
- [R15] "Pedidos em rascunho" → `comercial_pedidos_por_etapa({})` sem filtro de etapa = "P - Em digitação", trouxe agregado.
- [R16] "ICMS do mês" → `fiscal_apuracao` sem `periodo`, retornou abril.

**Causa raiz:** prompt menciona defaults mas não tem regra obrigatória de extrair parâmetros explícitos da pergunta antes de chamar tool.

**Fix:**
- **F20. (prompt)** Adicionar checklist obrigatório antes de cada chamada de tool: "(a) qual o domínio? (b) qual o filtro pedido? (c) qual período pedido? (d) algum identificador entre colchetes? Se a pergunta tem 'do mês', 'amanhã', 'a receber', 'em rascunho', isso vira parâmetro — não chame sem."
- **F21. (código)** `financeiro_titulos_vencidos`: default deveria ser `tipo='a_receber'` quando pergunta menciona "a receber", `tipo='a_pagar'` quando "a pagar". Hoje o default é "ambos" (vide R15). Mudar default para `null` (obrigatório) e devolver erro se não vier — força o LLM a especificar.

---

### 2.8 `formato_quebrado` (8 casos) — **FIX por prompt**

Resposta terminou em "Posso te ajudar com:" sem listar; bullets quebrados; mistura de conceitos.

**Exemplos:**
- [R16] "Tempo médio de fechamento do pedido" → resposta terminou em "Posso te ajudar com:" sem listar.
- [R16] "Pedidos sem vendedor atribuído" → idem.
- [R15] "Liquidez imediata" → idem ("Posso te dar os componentes pra você avaliar:").
- [R16] "Faturamento por estado esse mês" → idem.

**Causa raiz:** o template `respostaSugerida` da tool `registrar_lacuna` termina com placeholder de sugestões; LLM cortou antes de gerar a lista.

**Fix:**
- **F22. (código)** `registrar_lacuna` retorna `respostaSugerida` **já preenchida** com `sugestoesRelacionadas` inline (texto único), sem placeholder. Quando LLM faz copy-paste literal, sai completo.

---

### 2.9 `erro_data` (2 casos) — **FIX por código**

Pergunta com data relativa, agente errou conversão.

**Exemplos:**
- [R16] "Parcelas que vencem amanhã" → chamou `comercial_parcelas_a_vencer({ateDias: 1})` que pegou parcelas até hoje (27/05). Pra amanhã (28/05) precisaria `ateDias=1` E filtro `>= amanhã`.
- [R16] "ICMS do mês" → trouxe abril.

**Fix:**
- **F23. (código)** Helper de período no servidor: a tool aceita `periodoNome: "hoje" | "amanha" | "essa_semana" | "mes_corrente" | "mes_anterior" | "ano_corrente"` e converte internamente com timezone correto. Hoje cada tool tem semântica diferente para `periodoDe/periodoAte` vs `ateDias`. Normalizar.
- **F24. (prompt)** Quando pergunta diz "amanhã", usar `periodoNome: "amanha"`. Quando diz "do mês", `periodoNome: "mes_corrente"`.

---

### 2.10 `pediu_clarificacao_desnecessaria` (3 casos) — **FIX por prompt**

Agente pediu clarificação quando tinha contexto suficiente.

**Exemplos:**
- [R16] "valeu, e do mês passado?" → pergunta de follow-up; agente pediu "estoque, faturamento, pedidos, financeiro" sem aproveitar o indicador do turno anterior.
- [R16] "show, e do mês anterior?" → idem.
- [R12] "saldo do produto" → pergunta vaga sem código; pediu clarificação. Aceitável mas listado.

**Causa raiz:** o agente não usa contexto da conversa anterior (turnos prévios) na decisão.

**Fix:**
- **F25. (prompt)** Adicionar regra: **"Quando a pergunta é follow-up curto ('e do mês passado?', 'e essa semana?'), assuma o mesmo indicador e mesma dimensão do turno anterior; use a mesma tool com o período ajustado."** Combinado com F23 (helper de período) fica simples.

---

### 2.11 `tool_errada` (3 casos) — **FIX misto**

Agente escolheu tool conceitualmente errada para a pergunta.

**Exemplos:**
- [R15] "Vendedores cadastrados" → usou `comercial_pedidos_por_vendedor` (só pega vendedores **com pedidos**, não cadastrados).
- [R16] "Lista de transportadoras ativas" → registrar_lacuna; tool genérica `cadastro_buscar_parceiro({termo:"transportadora"})` traria, mas com matches contaminados.
- [R15] "Lista de fornecedores ativos" → usou `cadastro_buscar_parceiro({termo:"."})` — não filtra por papel.

**Fix:**
- **F26. (código)** `cadastro_buscar_parceiro` ganha parâmetro `papel: "cliente" | "fornecedor" | "transportadora" | "todos"`. Servidor filtra. Default = "todos".
- **F27. (código)** Nova tool `comercial_vendedores_cadastrados` que devolve a lista mestra de vendedores (raw `res.users` filtrada por grupo `sales_team`).

---

### 2.12 Demais (`placeholder_nao_substituido` 1) — **FIX por código**

Texto literal `não consegui obter esse dado` apareceu como placeholder.

**Fix:** já coberto por F18+F19.

---

## 3. Análise por tool

Tools que mais aparecem em casos de erro PARCIAL/ERRADO/FORA_DO_ESCOPO:

| Tool | Total | Erro dominante | Fix principal |
|------|-------|----------------|----------------|
| `registrar_lacuna` | 69 | usada cedo demais OU resposta cortou bullet | F7, F10, F22 |
| `estoque_saldo_produto` | 19 | match fuzzy aceita códigos próximos; agregação não usada | F12, F1, F3 |
| `financeiro_contas_a_receber` | 12 | total ignorado, dado inventado | F1, F4, F9, F16 |
| `financeiro_contas_a_pagar` | 9 | idem | F1, F4, F9, F16 |
| `financeiro_titulos_vencidos` | 5 | parâmetro `tipo` omitido | F21 |
| `fiscal_notas_recebidas_por_fornecedor` | 3 | contagem inventada vs agregado | F1, F9 |
| `bi_consulta_avancada` | 3 | "veio truncada" mesmo com `_DESTAQUE` | F2, F3 |
| `cadastro_buscar_parceiro` | 2 | sem filtro de papel | F26 |
| outras | <5 cada | | |

**Insight chave:** as 4 tools financeiras (a_receber, a_pagar, titulos_vencidos, fluxo_caixa) concentram **31 casos** (22% dos erros totais), todas remediáveis com **F1** (envelope `_RESPOSTA`) + **F4** (`topPorParticipante` no envelope) + **F9** (validação estrutural).

---

## 4. Categorias de fix consolidadas

### 4.1 Onda 1 — código no servidor MCP (cobre ~50% dos erros)

| ID | Fix | Tools afetadas | Estimativa de cura |
|----|-----|----------------|---------------------|
| F1 | Envelope `_RESPOSTA` curado por tool | todas | 25 casos |
| F2 | Campo `_listaTruncada` booleano explícito | todas com paginação | 8 casos |
| F3 | Auto-validação anti-"veio truncado" | wrapper LLM | 6 casos |
| F4 | `topPorParticipante` no envelope financeiro | 4 tools financeiras | 8 casos |
| F9 | Validação estrutural de números na resposta | wrapper LLM | 12 casos |
| F10 | `registrar_lacuna.redirecionar` vira gate estrutural | wrapper LLM | 3 casos |
| F12 | `estoque_saldo_produto` match exato numérico | 1 tool | 3 casos |
| F13 | `contabil_plano_de_contas` full-text | 1 tool | 2 casos |
| F16 | Auto-validação anti-recusa indevida | wrapper LLM | 4 casos |
| F19 | Auto-validação anti-"não consegui" em bullet | wrapper LLM | 4 casos |
| F21 | `financeiro_titulos_vencidos.tipo` obrigatório | 1 tool | 2 casos |
| F22 | `registrar_lacuna.respostaSugerida` completa | 1 tool | 4 casos |
| F23 | Helper de período `periodoNome` | wrapper de tools | 3 casos |
| F26 | `cadastro_buscar_parceiro.papel` | 1 tool | 3 casos |

**Total Onda 1: ~85 dos 144 casos** (≈59% de cura potencial).

### 4.2 Onda 2 — prompt (cobre ~15% dos erros)

| ID | Fix | Tipo |
|----|-----|------|
| F7 | Anti-lacuna prematura, reforçado | regra |
| F14 | Catálogo: `comercial_pedidos_por_etapa` separa cancelados | exemplo |
| F17 | "Pergunta quantitativa → use `_agregado.soma`" | regra |
| F18 | "Não consegui obter" só substitui resposta inteira | regra |
| F20 | Checklist antes de chamar tool (parâmetros) | checklist |
| F24 | Datas relativas usam `periodoNome` | regra |
| F25 | Follow-up curto reutiliza tool anterior | regra |

**Estimativa Onda 2: ~20 dos 144 casos** (≈14% adicional).

### 4.3 Onda 3 — tools novas/expansões (cobre ~10% dos erros)

| ID | Tool | Caso resolvido |
|----|------|------------------|
| F5 | `fiscal_faturamento_mensal_serie({ano})` | comparativo mês a mês |
| F8 | `cadastro_detalhar_parceiro({participanteId})` | cadastro completo |
| F27 | `comercial_vendedores_cadastrados` | vendedores cadastrados |
| — | `cadastro_parceiros_recentes({periodoDe, periodoAte})` | parceiros novos da semana |
| — | `estoque_locais_por_produto({termo})` | armazéns por produto |
| — | `comercial_pedidos_sem_vendedor` | pedidos sem vendedor |

**Estimativa Onda 3: ~15 dos 144 casos** (≈10% adicional).

### 4.4 Fora de escopo legítimo (NÃO atacar nesta fase)

26 casos. Pedidos que **só seriam atendidos criando funcionalidade nova no ERP**, não no MCP:
- Meta de vendas / "vai bater a meta?" (não há cadastro de meta no Odoo da Matrix)
- Margem produto = preço − custo (custo não está consolidado)
- Faturamento por região / por marca / por estado (sem agrupador no ERP)
- Liquidez imediata (indicador composto não cadastrado)
- Pedidos em entrega atrasados (sem SLA logístico)
- Cruzamento pedido↔nota faturada parcial (sem flag de status fiscal-pedido)
- Tempo médio de fechamento de pedido (sem data fim instrumentada)
- Saídas previstas / "quanto vai sair essa semana" (sem cadastro de fluxo previsto)
- "Tem dinheiro pra pagar a folha?" (não temos RH)

**Sequência:** o agente deve responder essas com `registrar_lacuna` que retorne `respostaSugerida` honesta + sugestões de alternativas próximas. Já é o comportamento atual; F22 só limpa o formato.

---

## 5. Plano numérico de cura (estimativa)

| Onda | Casos curados | % do total (de 144) | % de acerto projetado (sobre 500 turnos avaliados) |
|------|----------------|----------------------|------------------------------------------------------|
| **Hoje (baseline)** | — | — | 71,2% (média R11-R16) |
| Onda 1 (código MCP) | ~85 | 59% | **~85%** |
| Onda 2 (prompt) | +20 | +14% | **~89%** |
| Onda 3 (tools novas) | +15 | +10% | **~92%** |
| Onda 4 (tuning + few-shot dinâmico) | +5 a +10 | +3-7% | **≥95%** |

**Critério de saída de cada onda:** rodar nova bateria de 100 turnos (R17, R18, R19...) e medir `%CORRETO`. A bateria de teste em `scripts/quality-audit/test-questions.json` deve incluir variações dos casos cobertos, não as mesmas perguntas literais.

---

## 6. Visão técnica

### 6.1 Mudanças de arquitetura (alto nível)

```
┌─────────────────────────────────────────────────────────────────────┐
│ run-agent.ts                                                         │
│                                                                       │
│  1. Pre-call: extrai parâmetros canônicos da pergunta                │
│     (helper period-normalizer + identifier-extractor — novo)         │
│                                                                       │
│  2. LLM call 1 (tool decision)                                       │
│                                                                       │
│  3. Tool exec via MCP                                                │
│      └─ MCP server enriquece resposta com:                           │
│            _RESPOSTA  (texto pronto, novo)                            │
│            _DESTAQUE  (mantido)                                       │
│            _agregado  (mantido)                                       │
│            _listaTruncada (booleano, novo)                            │
│            topPorParticipante (financeiro, novo)                      │
│                                                                       │
│  4. LLM call 2 (síntese final)                                       │
│                                                                       │
│  5. Auto-validação (nova camada — antes de devolver ao usuário)      │
│      ├─ Validador estrutural de números (F9)                          │
│      ├─ Validador anti-truncamento (F3)                               │
│      ├─ Validador anti-recusa indevida (F16)                          │
│      └─ Validador anti-placeholder (F19)                              │
│            ↓ se falhou alguma regra                                   │
│      6. LLM call 3 (retry corretivo, cap=1)                          │
│            ↓ aceita o resultado mesmo se ainda problemático          │
│      7. Persistir e devolver                                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Custo extra:** ~+1 LLM call em ~15% dos turnos (apenas os que disparam alguma regra). Em produção isso é aceitável.

### 6.2 Mudanças no prompt (cirúrgicas)

Editar `src/lib/agent/prompt/identity-base.ts`:

- **§ AGREGAÇÃO FORÇADA**: adicionar item F17 ("pergunta quantitativa → use `_agregado.soma`").
- **§ COMBINAÇÃO DE TOOLS**: reforçar tom imperativo (F7), adicionar caso "vendedores cadastrados → use `comercial_vendedores_cadastrados`".
- **§ DEFAULTS**: F18 ("não consegui obter" só substitui resposta inteira).
- **Novo § FOLLOW-UP**: F25 (reutilização de contexto curto).
- **Novo § DATA RELATIVA**: F24 (usar `periodoNome`).
- **§ EXTRAÇÃO DE IDENTIFICADORES**: F20 (checklist obrigatório).
- **§ TOOLS / Comercial**: F14 (separa cancelados).

Estimativa: ~80 linhas tocadas em ~310 linhas, não é reescrita.

### 6.3 Mudanças nas tools (MCP)

| Tool | Mudança |
|------|---------|
| **Todas** | + `_RESPOSTA: string` no envelope + `_listaTruncada: boolean` |
| `financeiro_contas_a_pagar` | + `topPorParticipante: [{nome, soma, n}]` (top 10) |
| `financeiro_contas_a_receber` | + idem |
| `financeiro_titulos_vencidos` | `tipo` obrigatório |
| `estoque_saldo_produto` | match exato quando termo é numérico ≥4 dígitos |
| `contabil_plano_de_contas` | full-text com pg_trgm, normaliza acentos+plural |
| `registrar_lacuna` | `respostaSugerida` completa, sem placeholder; `redirecionar` vira gate |
| `cadastro_buscar_parceiro` | + `papel: cliente \| fornecedor \| transportadora \| todos` |
| **Novas** | `fiscal_faturamento_mensal_serie`, `cadastro_detalhar_parceiro`, `comercial_vendedores_cadastrados`, `cadastro_parceiros_recentes`, `estoque_locais_por_produto`, `comercial_pedidos_sem_vendedor` |

### 6.4 Mudanças no servidor de avaliação (judge)

O briefing do judge (R5/R6) deve ser atualizado **após** Onda 1 entrar em produção para que a nova bateria avalie o sistema com a auto-validação ativa. Isso é Onda 4.

---

## 7. Riscos identificados

1. **Latência do retry corretivo.** +1 LLM call em ~15% dos turnos. Mitigar com cap rígido (=1) e timeout agressivo (3s). Não retentar se primeira call demorou >8s.
2. **`_RESPOSTA` curada pode ficar engessada.** Se o servidor pré-formata muito, o LLM perde a oportunidade de personalizar. Mitigar: `_RESPOSTA` é **sugestão**, não substituto — LLM ainda decide; mas se ele desviar significativamente para pior, validador retém.
3. **Match exato em código numérico pode quebrar buscas legítimas.** Ex: usuário digita "200" achando que é nome curto. Mitigar: limiar = 4 dígitos (códigos da Matrix são 3 ou ≥10 dígitos; raramente exatamente 4).
4. **`topPorParticipante` aumenta payload das tools financeiras.** Mitigar: top 10 limita custo.
5. **F10 (gate estrutural pra `redirecionar`) pode entrar em loop** se a tool redirecionada também devolver `registrar_lacuna`. Mitigar: depth=1 (apenas um redirect aceito).
6. **F25 (follow-up de contexto)** depende do histórico estar acessível no momento da decisão. Hoje `run-agent.ts` já carrega contexto — confirmar; senão, instrumentar.
7. **Auto-validação pode disparar falso positivo em respostas honestas.** Ex: resposta "não consegui obter" pode ser correta se tool realmente devolveu vazio. Validador F16 checa **apenas** quando `_DESTAQUE`/`_agregado`/`_RESPOSTA` está preenchido.

---

## 8. Roteiro de implementação (proposto)

1. **SPEC v1** (próximo passo após este laudo).
2. **Reviews críticas da SPEC (v2, v3).**
3. **PLAN v1 → v2 → v3** com decomposição máxima (uma task por tool/fix).
4. **Execução Onda 1** (servidor MCP):
   - Subfase A: framework de envelope `_RESPOSTA` + `_listaTruncada` (infra).
   - Subfase B: aplicar em tools financeiras (a_pagar, a_receber, titulos_vencidos, fluxo_caixa).
   - Subfase C: aplicar em fiscais (notas, faturamento, apuração).
   - Subfase D: aplicar em estoque (saldo, top, parados).
   - Subfase E: auto-validação no `run-agent` (F3, F9, F16, F19).
   - Subfase F: ajustes em tools específicas (F10, F12, F13, F21, F22, F26).
5. **Execução Onda 2** (prompt): editar `identity-base.ts` com os 7 ajustes (F7, F14, F17, F18, F20, F24, F25).
6. **Execução Onda 3** (tools novas): criar 6 tools listadas em §4.3.
7. **Verificação: rodar R17 (100 turnos novos)**, avaliar com judge atualizado, conferir meta ≥85%.
8. **Onda 4** condicional: se R17 entregar ≥90%, encerrar. Se entregar <90%, repetir laudo focado nos novos casos e aplicar Onda 4.

---

## 9. Próxima decisão de design (entra na SPEC v1)

1. **Auto-validação síncrona vs assíncrona?** Recomendação: **síncrona**, no mesmo turno, antes de persistir a resposta. Custo de latência aceitável.
2. **`_RESPOSTA` é gerada por código TS ou por LLM no servidor?** Recomendação: **TS puro** — é template determinístico por tool. LLM no servidor reintroduz alucinação.
3. **Onde rodar o validador estrutural?** Recomendação: **dentro do `run-agent.ts`**, antes do `persistMessage` final, com fallback se validador crashar (não bloquear resposta).
4. **Bateria de regressão.** Recomendação: criar `R17-regression.json` com **subconjunto curado dos 144 casos** (parametrizados, não literais) para rodar antes de cada commit de prompt/tool.
5. **Telemetria do retry.** Logar `evalRetryCount`, `retryReason` em `ConversationQualityEvaluation` (campos novos) para medir o impacto da auto-validação em produção.

---

## 10. Anexos

- **Detalhe completo dos 17 casos ERRADO:** `detail2_ERRADO.md` (extraído em `/tmp/laudo-r11-r16/`).
- **Detalhe dos 76 PARCIAL:** `detail2_PARCIAL.md` (idem).
- **Detalhe dos 51 FORA_DO_ESCOPO:** `detail2_FORA_DO_ESCOPO.md` (idem).
- **Cases JSONL (input bruto):** `cases_v2.jsonl` (144 objetos completos com pergunta, resposta, toolCalls, toolResults, razoes do judge, patterns).

Esses arquivos podem ser copiados pra `docs/superpowers/research/anexos-laudo-r11-r16/` se quisermos preservar em git; por padrão ficam em `/tmp/` (alta volumetria, ~1.2MB no JSONL).
