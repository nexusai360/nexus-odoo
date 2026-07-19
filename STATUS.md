# STATUS , ponto de retomada

> ## 2026-07-18 , BRANCH `feat/diretoria-entregas-estoque` (NÃO mergeada , aguarda o dono)
>
> Frente pedida na reunião do dono com a logística. Ciclo completo: perícia (4 frentes) →
> plano v1 → 2 reviews adversariais → v3 → execução por ondas com TDD e E2E real. **Modo
> autônomo, sem PR/merge (decisão do dono: só no fim de tudo).** tsc 0, 4273 testes verdes.
>
> **PRONTO E VALIDADO (screenshots dark + E2E contra o cache):**
> - **Relatório de Entregas Parciais** (sub-aba nova em Pedidos & Entregas): 3 KPIs (total do
>   pedido · falta entregar venda · falta entregar custo) + tabela por item (nº, cliente, UF,
>   cidade, produto, família, marca, operação/modalidade, etapa, qtd/valor a atender, status
>   liberado/bloqueado, forma de pagamento). Reconcilia com o card por construção (função
>   `aAtenderDoItem` compartilhada). Toggle "incluir anteriores ao corte".
> - **Card "Valor em estoque" da Visão Geral** invertido: custo puro (R$ 29,8 mi) em destaque.
> - **Sigla da UF** no centro de cada estado do mapa.
> - A receber/A pagar VERIFICADOS (já vêm do título, nada a mudar).
> - **Lote 2, Fase 1 (desmembramento de kits) COMPLETA**: fato da BOM (`fato_lista_material_item`,
>   475 linhas) + a necessidade de compra passa a desmembrar kits nos componentes (abate kit
>   montado, fallback honesto para kit sem BOM). E2E real: das 433 linhas, só 2 seguem como kit.
>   Migration aditiva aplicada no dev (sem reset). **Fase 2 (rateio de valor Matrix/acessórios)
>   segue pendente do dono.**
>
> **PENDENTE DO DONO/COLEGA (não é esquecimento , o cache não tem o dado):**
> 1. **Regra de "bloqueado"**: implementada na versão simples (só nota fiscal vencida). O dono
>    vai verificar e passar o veredito. Flag `BLOQUEIO_SO_NOTA_EMITIDA` isolada.
> 2. **"Nº do pedido do mérito"**: sem campo no cache (candidatos: chamado_cliente_id/cotacao_id).
> 3. **Estoque , demonstração em 2 blocos, DSTOCK e "transferência = próprio"**: o cache não tem
>    os locais descritos (JDSDEMO não existe; DSTOCK ambíguo; sem `usage` para trânsito).
>    De-para real + perguntas em `docs/superpowers/research/2026-07-18-estoque-locais-pendencias.md`.
>
> Plano/progresso: `docs/superpowers/plans/2026-07-18-diretoria-entregas-parciais-estoque-*`.

---

> **Atualizado em 2026-07-14 (madrugada). TUDO O QUE SEGUE ESTA EM PRODUCAO E VALIDADO.**
> Nenhuma branch aberta, nenhum PR pendente, nenhuma worktree viva. Repositorio limpo: so `main`.

## O que entrou em producao nesta sessao (6 PRs)

| PR | O que resolve |
|---|---|
| #187 | **A receita da venda futura sumia das duas pontas.** A regra procura "venda" no nome da operacao fiscal, e nem "Simples Faturamento 5922/6922" nem "Remessa 5117/6117" tem essa palavra: a receita nao entrava nem na cobranca nem na entrega. **R$ 538 mil em silencio desde 16/03.** Decisao do dono: a receita e a REMESSA (x117). |
| #190 | **O cache parava de receber registros e nada os trazia de volta.** O Odoo carimba `write_date` no inicio da transacao e so torna visivel no commit; quem caia nessa janela nunca mais era buscado. E a reconciliacao so olhava o que sumiu do Odoo, nunca o que faltava aqui. Agora: margem de 15 min na marca d'agua + reconciliacao BIDIRECIONAL. |
| #191 | **Classificacao de receita em MODO SOMBRA.** A regra nova (natureza da operacao) roda em paralelo; `is_venda_externa` continua recebendo SEMPRE a regra antiga (a trava). Painel em **Configuracao > Classificacao fiscal**. |
| #192 | **Diretoria: estoque, demanda e pagamentos** (assumida do outro agente). Estoque so do que e nosso (R$ 50,2 mi -> R$ 31,4 mi), demanda so do que falta entregar (R$ 62,6 mi -> R$ 21,2 mi), pagamentos em 3 visoes. Fechei os 2 bugs que ela deixou (donut de fatia unica + aviso de provisorios). |
| #193 | Pagamentos: a tela diz se o total inclui titulo provisorio, e o que e o "Nao informado". |
| #194 | **Filtros de periodo e empresa em TODAS as telas da Diretoria**, calendario refeito (1 mes, por extenso, dropdown do sistema), dropdown de empresa consertado, siglas em caixa alta, e os cards C-05/C-07 param de parecer faturamento. |

## PROXIMA ACAO , o dono vai testar a UI nova

**Pendente de validacao visual dele** (subiu as 05:16 UTC de 14/07): a barra de filtros nas 4
telas, o calendario, o dropdown de empresa e os rotulos novos. Se algo estiver torto, e ajuste
de layout (sessao principal + skill `ui-ux-pro-max`, nunca subagente).

## Decisao que espera o dono (sem prazo)

**Virar a chave da classificacao por NATUREZA da operacao.** Ela roda em sombra desde o PR #191
e o placar esta em **Configuracao > Classificacao fiscal**: hoje **99,95% de acerto, 1
divergencia, 0 naturezas desconhecidas**. Quando ele achar que o placar esta maduro, a troca e
feita com prova. O laudo completo esta em `docs/pericia-classificacao-receita-2026-07-13.md`.

---

## Historico da sessao anterior (2026-07-13)

> **Atualizado em 2026-07-13 (fim da sessão da Diretoria).**

## 🔴 EM ANDAMENTO , PR #189: Diretoria (estoque, pedidos, pagamentos)

**Branch:** `feat/diretoria-estoque-pedidos-pagamentos` ·
**Worktree:** `branches/feat-diretoria-estoque-pedidos-pagamentos` ·
**PR:** https://github.com/nexusai360/nexus-odoo/pull/189

O trabalho está **todo commitado e testado** (tsc limpo, eslint limpo, 4.213 testes
verdes), mas **a tela de pagamentos está quebrada por dois bugs**, e o dono ainda não
validou. **O documento a ler primeiro é
`docs/superpowers/plans/2026-07-13-PROGRESSO.md`** , ele abre com os dois bugs, o
diagnóstico medido e o caminho da correção.

**Resumo dos dois bugs:**

1. **O container do worker roda imagem velha** e, a cada ciclo, reconstrói o
   `fato_financeiro_titulo` com o builder antigo, **zerando `forma_pagamento_nome` e
   `empresa_id`**. Por isso o painel mostra "Não informado , 100%". Corrige com
   `docker compose build app` + `up -d --force-recreate worker` (o worker **não** tem
   `build:` próprio , `CLAUDE.md` §2.1).
2. **O donut não desenha fatia de 100%** (arco de início e fim coincidentes não renderiza).
   Só aparece porque o bug 1 deixou uma única fatia.

**O que a entrega faz** (tudo medido contra o cache real):
KPI de estoque R$ 50,2 mi → **R$ 31,4 mi** (só o que é nosso e está em casa) ·
demonstração em painel próprio (R$ 1,56 mi) · **necessidade de compra** (215 produtos,
R$ 9,7 mi, com saldo por depósito) · B-04 do pedido cheio (R$ 62,6 mi) para o que **falta
entregar, a custo** (R$ 21,2 mi) · seriais com local e saldo (2.511) · pagamentos em 3
visões (Pago / A receber / Carteira) lendo o **título financeiro**, onde a forma de
pagamento existe em 99,98% (contra 76% na parcela do pedido) · 8 tools do Nex alinhadas.

---

## (histórico anterior)

> ## 2026-07-13 (A RECEITA DA VENDA FUTURA SUMIA , corrigido em produção; laudo pendente de decisão)
>
> **O dono relatou o faturamento travado em R$ 7,2 mi.** Não era sync nem cache (a nota que
> ele emitiu às 15:03 estava no dashboard às 15:14). Era a regra: o faturamento identifica
> venda pela palavra **"venda"** no nome da operação fiscal, e as **duas** notas da venda
> futura não têm essa palavra ("Simples Faturamento para Entrega Futura 5922/6922" e
> "Remessa de Mercadoria Originada de Encomenda 5117/6117"). A receita **não entrava nem na
> cobrança nem na entrega**: sumia. **R$ 538 mil em silêncio desde 16/03.**
>
> **Decisão do dono (13/07), final para o assunto:** a receita da venda futura é a **REMESSA
> (5117/6117)**. O simples faturamento (5922/6922) **nunca** conta no mês em que sai.
>
> **Em produção (PR #187, deploy validado):** as 9 remessas entraram e os 5 meses se
> corrigiram sozinhos no ciclo do worker. mar R$ 5.659.933,37 | abr R$ 14.719.313,13 |
> mai R$ 16.196.434,18 | jun R$ 18.603.497,24 | jul R$ 7.467.977,71.
>
> ### PRÓXIMA AÇÃO , decisão do dono sobre o laudo
>
> **`docs/pericia-classificacao-receita-2026-07-13.md`** (branch `docs/pericia-classificacao-receita`).
> Perícia pedida por ele: dá para largar a palavra "venda" e classificar pela lógica fiscal?
> **Dá, e a chave NÃO é o CFOP: é a NATUREZA DA OPERAÇÃO.** Bate **centavo a centavo** com o
> faturamento de hoje (905 notas, R$ 62.647.155,63, **zero perdidas**) e ainda recupera a nota
> complementar (R$ 2.697,98). **CFOP puro perderia R$ 684.340,18** de receita real. Proposta:
> classificar por natureza (ids 1, 47, 107, 36, 31) + **alerta de natureza desconhecida**
> (o item que impede o próximo prejuízo silencioso). **Nada implementado , aguardando o dono.**
>
> **Achado paralelo e grave (§6 do laudo): o cache PERDE itens de nota fiscal.** 8 notas, 152
> itens que existem no Odoo e nunca chegaram ao cache. A marca d'água do sync avança para o
> início do ciclo, mas o Odoo carimba `write_date` no início da transação e só torna visível
> no commit: quem cai nessa janela **nunca mais é buscado**, e a reconciliação diária só olha
> o que sumiu do Odoo, nunca o que falta no cache. Não afeta o faturamento (o `vr_nf` vem do
> cabeçalho), mas contamina margem/curva ABC por item. Conserto: margem de segurança na marca
> d'água + reconciliação nos dois sentidos.

> ## 2026-07-13 (DATA DE INÍCIO DAS ANÁLISES + 3 ERROS DE NÚMERO , tudo em produção)
>
> Perícia da plataforma inteira contra a configuração **"Analisar dados a partir de"**
> (`sync.corte_dados`, hoje 16/03/2026), tratando-a como o que ela é: um **parâmetro
> variável** , muda na tela e a base de cálculo muda junto, sem deploy. Escopo periciado:
> **128 tools do MCP**, 6 relatórios 1.0 + 22 fontes do 2.0, todos os KPIs da Diretoria, o
> calendário e o prompt do Nex. Detalhe em `docs/RADAR.md` (**R-corte-pericia**).
>
> **Os 3 erros de número achados no caminho (todos corrigidos e medidos em produção):**
>
> 1. **O Nex respondia faturamento 65% acima do dashboard** (`R-intragrupo`). Regressão do
>    PR #166: a tool soma toda saída autorizada, mas a marcação de intragrupo vinha de um
>    loader que **exclui a operação "venda interna"** , justamente onde mora a venda entre
>    empresas do grupo. A eliminação caiu para **R$ 0,02**: o agente dizia "receita real
>    R$ 102,1 mi" e a tela dizia R$ 61,9 mi. Hoje, em produção: intragrupo **R$ 39,3 mi**,
>    receita real **R$ 62,8 mi**.
> 2. **"Tudo" mostrava MENOS que "este mês"** em a receber e a pagar (`R-janela-cobranca`,
>    relatado pelo dono). A janela de cobrança tira o teto do FIM do período, e o preset
>    "Tudo" resolve o fim como HOJE , virava "só o vencido". **Sem fim de período não há
>    teto** (carteira inteira em aberto). Validado em prod: mês < ano < tudo.
> 3. **Dois KPIs de estoque**: o card "Valor em estoque" **mudava de valor** ao aplicar filtro
>    cruzado (a recomputação ignorava o índice configurado), e a lista "seriais em estoque"
>    **contava serial que já saiu** (4.984 dos 8.860 , o total era mais que o dobro do real).
>
> **Prompt do Nex:** a data é injetada por turno (certo), mas a **seção que ensina o agente a
> usá-la** morava no texto editável. Em produção o `identity_base` do banco **ainda tem o texto
> antigo** ("apenas dados de 2026 em diante"); só não vale porque `uses_code_defaults = true`.
> Bastava um "Salvar" na tela do prompt para o Nex voltar a mentir. A regra saiu do texto
> editável (`src/lib/agent/prompt/regra-corte.ts`) e agora é **anexada sempre**, por último.
>
> **Infra (madrugada):** worker com teto de 3 GB **medido** (pico real do ciclo: 1,9 GB , o
> dobro do que se supunha); o deploy passou a **reconciliar env/resources/labels do compose**
> (antes só trocava a imagem, então o compose era papel); lock do ciclo com **dono e
> heartbeat** (restart não prende mais a sync por 15 min). Lição cara: **em compose, OMITIR é
> APAGAR** , publicar o compose apagou o label do auto-deploy e o Shepherd parou de atualizar
> prod, em silêncio (restaurado em ~2 min).
>
> **PRs:** #183, #184, #185 , todos mergeados e em produção.
>
> ### Pendências (decisão do dono, adiadas por ele)
> - **R-tempo**: KPI de tempo médio das respostas no topo do Backtest (o tempo por avaliação já
>   existe). Pequeno; depende de decidir o que mostrar (média? p50/p95?).
> - **R-ajustes**: gravar o status ANTES de cada ajuste, para o histórico mostrar a transição
>   em todos (hoje só no mais recente). Pequeno-médio, cosmético, e agora com 2 escritores.
> - **Aviso de hidratação do React** (`/dashboard`, `/integracoes`): **provável falso
>   positivo** (extensão de browser no `<body>`). **Reproduzir em janela anônima ANTES** de
>   tocar em código.
> - **Decisões de produto em aberto** (em `R-corte-pericia`): "dias parado" vem pronto do Odoo
>   e ignora a janela; `bi_consulta_avancada` executa SQL do agente sem injetar o piso;
>   `fato_cotacao` não tem coluna de data (hoje vazio, vira vazamento quando entrar em uso).

---

> **2026-07-12 (PERÍCIA DOS KPIs , tudo em produção).**
>
> **Erro de raiz corrigido:** o destinatário de TODO documento do Odoo da Tauga
> (`participante_id`) aponta para **`sped.participante`**, não para `res.partner` , e o
> `fato_parceiro` vinha de `res.partner`. As duas tabelas têm numeração independente, então o
> join pegava **pessoa diferente**. 116 das 136 notas de julho estavam **no estado errado** no
> mapa (R$ 6,6 mi), e o balde "Sem UF" era o sósia de número sem estado, não cliente sem
> endereço. Agora `fato_parceiro` vem de `sped.participante`: os 12 consumidores do join
> (mapa, faturamento por UF/cliente, intragrupo, relatórios, Agente Nex) ficaram corretos de
> uma vez. "Sem UF" foi a ZERO. (PR #174; hotfix #175 do OOM que isso causou no worker.)
>
> **KPIs (PR #176):**
> - contas a receber/pagar por **janela de cobrança**: vencido em aberto + vencendo até o fim
>   do período; o que vence depois fica de fora;
> - **valor em estoque** conta só o saldo POSITIVO (as 219 linhas negativas subtraíam R$ 10,5
>   mi) e é **dividido por um índice configurável** (Configuração > Diretoria · Vendas,
>   padrão 0,95); o valor a custo puro fica no rodapé do card;
> - **"A receber" x "Carteira a faturar"** separados (eram R$ 49,2 mi somados; o recebível é
>   R$ 17,8 mi e a carteira, R$ 31,3 mi de pedidos sem nota).
>
> **A base de cálculo de TODOS os KPIs está em `docs/kpis-diretoria.md`** , é o documento de
> consulta para "de onde vem esse número?". Ao mudar a regra de um KPI, atualize-o no mesmo
> commit.
>
> **Armadilhas:** `docs/RADAR.md` (R-participante, R-corte, R-mapa-uf).

> ### 2026-07-13 (INFRA DE PRODUÇÃO , as 4 pendências do OOM fechadas)
>
> Detalhe completo em `docs/RADAR.md` R-pendencias-2026-07-12 e no runbook de deploy §4.1.
>
> 1. **Teto de memória do worker: 3 GB** (era 4608M, de chute). Medido em produção com
>    `scripts/_prod-worker-mem.py`: repouso ~0,48 GB, **pico do ciclo pesado ~1,9 GB** , o dobro
>    do que se supunha. Heap V8 fica em 2048M; sobra 1,1 GB de folga sobre o pico.
> 2. **Drift de configuração auditado na stack inteira** (`scripts/_prod-stack-drift.py`):
>    `app` e `mcp` estavam limpos; o achado novo foi o **`db`, que roda com 1536M enquanto o
>    compose ainda dizia 1024M** , um `stack deploy` ingênuo teria rebaixado o Postgres.
> 3. **Raiz do deploy corrigida:** o `deploy-portainer.py` passou a **reconciliar
>    `environment`, `resources` e labels a partir do compose da stack** (que é a fonte da
>    verdade), mantendo o rolling um-a-um. Nada de `docker stack deploy` paralelo.
> 4. **Lock zumbi resolvido:** o lock do ciclo agora tem **dono e heartbeat** (TTL 90s renovado
>    a cada 30s). Restart não prende mais a sync por 15 min.
>
> **Lição cara da noite: em compose, OMITIR é APAGAR.** Publicar o compose disparou um
> `docker stack deploy` que removeu o label `com.nexus.autodeploy=true` de app/mcp/worker
> (**o auto-deploy do Shepherd morreu em silêncio**) e o `UpdateConfig` (o app passou a dar 502
> no update). Restaurado, agora declarado no compose, e as ferramentas passaram a avisar o que
> seria apagado. **Backup da stack antes de publicar é obrigatório.**


---

## 2026-07-12 (anterior) , revisão completa das regras de consulta

> **2026-07-12 (REVISÃO COMPLETA DAS REGRAS DE CONSULTA , PR #169, aguardando merge).**
>
> A data de início das análises (Configuração > "Analisar dados a partir de") agora vale em
> **TODA** leitura de histórico. A auditoria varreu 7 camadas (metrics, diretoria, relatórios
> 1.0 e 2.0, tools do MCP, agente, pontos de entrada) e achou **148 pontos** que não
> respeitavam. Corrigidos, com teste, e provados contra o cache real.
>
> - **A raiz era arquitetural**: `corteAtual()` lê um cache em memória do PROCESSO, e só o app
>   o preenchia. O MCP é outro processo: **nunca lia o AppSetting**, então todas as tools do Nex
>   grampeavam pela data padrão e mudar a data na tela não mudava nada no agente. Agora o
>   pipeline de tools hidrata o corte, e `aquecerCorte()` faz o mesmo nos entrypoints do app.
> - **O corte da ingestão não era fixo** (bug do #168): a constante era o `corteAtual()`
>   avaliado no import, ou seja, a data da tela. O worker nunca repunha janeiro a março.
> - **Os KPIs zeravam a cada sync**: o reset global de `is_venda_externa` rodava fora de
>   transação. Agora a troca é atômica e a tela só se atualiza no FIM do ciclo (troca suave).
> - **"A receber": R$ 49,2 mi -> R$ 17,8 mi.** O KPI somava recebível com **carteira a faturar**
>   (R$ 31,3 mi de pedidos sem nota emitida). Separados, com dupla contagem eliminada.
> - **Estoque a custo** também no catálogo, nas linhas granulares e no giro (45,7 -> 37,2 mi).
> - **Calendário da Configuração** no padrão do sistema, travado em 01/01/2026.
>
> tsc limpo, **4114 testes verdes**, E2E contra `nexus_odoo_l1` provando que mover a data muda
> a plataforma inteira e que **nada é apagado**.
>
> **Plano e continuação:** `docs/superpowers/plans/2026-07-12-data-inicio-analises.md`
> **Armadilhas e decisões pendentes:** `docs/RADAR.md` (seção R-corte).
> **Próximo passo:** merge do #169 + deploy; replicar no ERP Nexus (em andamento, branch local
> `feat/data-inicio-analises`).

---

## 2026-07-12 (anterior) , faturamento por operação + data configurável (EM PRODUÇÃO)

> Três PRs mergeados e deployados em `agentenex.nexusai360.com`:
>
> - **#166** , o faturamento passa a ser definido pela **OPERAÇÃO FISCAL** da nota (natureza
>   e CFOP não separam "venda" de "venda interna"). Cache ganhou `operacao_id`/`operacao_nome`;
>   `is_venda_externa` é materializada na mesma transação que reconstrói a nota (antes ficava
>   NULL entre builders e o faturamento aparecia como R$ 0,00). Agente Nex, relatórios e
>   dashboard passaram a ler a MESMA verdade. **Julho/2026 = R$ 7.242.504,80 em 136 notas**
>   (bate com o Odoo). Filtro por empresa na Visão geral.
> - **#167** , **data de início das análises configurável na tela** (Configuração), calendário
>   com navegação por mês/ano, **centavos** em toda a plataforma, e KPIs corrigidos (pedidos e
>   demandas zeravam a cada ciclo; estoque passou a valer a CUSTO; contas a receber/pagar
>   excluem intragrupo).
> - **#168** , correção de rumo: **a data da tela é FILTRO de análise, não faxina**. Nada é
>   apagado; o cache guarda o histórico e mover a data para trás traz tudo de volta na hora.
>   A ingestão tem corte técnico próprio e fixo.
>
> **Plano e continuação:** `docs/superpowers/plans/2026-07-12-data-inicio-analises.md`
> **Próximo passo:** revisão completa das regras de consulta (garantir que TODA leitura de
> histórico respeita a data de início) + replicar no ERP Nexus.

---

## 2026-06-04 , PONTO DE RETOMADA (branch `feat/agente-nex-bubble-ux`)

Projeto "Monitoramento Bubble + Aprendizado", fatiado em **B1 (feedback na bubble)**,
**B2 (aba Bubble de monitoramento)**, **B3 (aba Aprendizado)**. Metodologia CLAUDE.md §6
seguida à risca (spec v1→v2→v3 com 2 reviews; plan v1→v2→v3 com 2 reviews; execução do
B2 via `subagent-driven-development`; UI inline com `ui-ux-pro-max`). Specs/plans em
`docs/superpowers/{specs,plans}/2026-06-04-b1-*` e `-b2-*`.

### Feito (commitado, tsc 0 / jest verde / no ar em localhost:3000 via `agente up`)
- **B1 COMPLETO:** `FeedbackControl` na bubble (4 votos: correto/parcial/errado/alucinou +
  comentário), `MessageFeedback`+`MessageFeedbackEvent` (histórico), `feedbackCheckpoint`
  (ligado em PRODUCTION no DB de dev), card de admin em `/agente/configuracao` (posição:
  depois de Anexo, antes de Sugestões), timestamp da IA à direita, propagação do
  `dbMessageId` (runAgent→done→UI), 10 testes. Ajuste de tint no hover da paleta.
- **B2 BACKEND COMPLETO:** `EvalStatusBadge` extraído; `Message.kind` (text|audio, migration
  aditiva) + persist de `kind=audio` (meta.isAudio, 5 saltos); actions
  `listBubbleCollaborators`/`listBubbleSessions`/`getBubbleSessionMessages` (super_admin,
  read-only, juiz+voto+sugestões+clicada derivada) , 17 testes.
- **B2 UI PARCIAL:** aba "Bubble" em `/agente/monitoramento/bubble`, 3 colunas
  (`bubble-monitor.tsx` + `bubble-monitor-row.tsx`), reusa `AgentMessage`. "Raciocínio · N
  tools" (era "etapas") na bubble E na aba. Sessão ativa = só a mais recente. Conversa abre
  no fim.

### PENDÊNCIAS , TODAS RESOLVIDAS (2026-06-04 tarde, modo autônomo)
Tudo abaixo entregue, commitado, tsc 0 / suíte 2386 verde / no ar via `agente up`.
1. **RAIZ do dado poluído , FEITO.** Canal estrutural `backtest` (enum aditivo +
   backfill: 4145 conversas `[AUDIT`/`[SMOKE` movidas de in_app→backtest). Scripts
   quality-audit gravam em `backtest`. Aba Bubble (filtra in_app) ficou só com as
   103 reais. `ORIGEM_BACKTEST` no monitoramento. Commit `34cac33`.
2. **Sugestões dentro da bolha , FEITO** (e iterado): bloco colapsável com chevron
   igual ao Raciocínio; clicada distinguida só por contraste (sem tag "usada"); a
   lâmpada (ícone original) só aparece quando alguém clicou. Fonte = "Raciocínio".
3. **3 colunas , FEITO:** painel único, colunas Colaboradores=Sessões homogêneas
   (300px), Conversa menor; cards homogêneos.
4. **Tag de data , FEITO:** flutuante fixa no topo da conversa, material translúcido
   igual à bubble viva, troca ao rolar.
5. **FAB de descer , FEITO** (espelha a bubble viva).
6. **Mensagem vazia , FEITO** (filtrada: sem texto e sem áudio).
7. **Feedback vs feedback-v4 , FEITO:** ícone "Parcial" resgatado do mockup validado
   (meia-lua preenchida, `PartialIcon`), no monitor e na bubble viva. Voto = badge de
   canto; comentário do usuário revela ao clicar (com indicador).
8. **B2 Fatia 4 , deep-link Backtest , FEITO:** `?eval=` abre a linha (linha sintética
   + `initialExpandedId` + scrollIntoView). Commit `104bde1`.
9. **B3 aba "Aprendizado" , FEITO** (v1): cruza Avaliação×Perícia por `assistantMessageId`
   (matriz 4×4 + KPIs + discordâncias priorizadas + padrões de erro + comentários
   negativos, com deep-link pro Backtest). Commit `fdb896e`.
   Spec: `docs/superpowers/specs/2026-06-04-b3-aprendizado-design.md`.

### Métricas Avaliação × Perícia (decisão do usuário)
- **Avaliação** = voto do usuário (`MessageFeedback`). **Perícia** = avaliação da
  plataforma/juiz (`ConversationQualityEvaluation`, status efetivo).
- **% acerto = certos / total de classificações** (parcial NÃO vale meio ponto).
  `FORA_DO_ESCOPO==ALUCINOU`; `FALHA_TECNICA`=erro; `PENDENTE` não conta.
- Ícones: Gauge=Avaliação, Scale=Perícia (substituem as palavras nos cards).

### DEFERIDO (ondas futuras, em RADAR)
- **B3.2 Autocorreção:** gerar correções de código a partir dos sinais. Unbounded,
  precisa design próprio.
- **KPI de tempo médio no Backtest:** tempo por linha no drill-down + gráfico de média.
  Tempo já existe (`LlmUsage.durationMs`; o monitor já mostra por turno via proxy
  `createdAt`). Ver `docs/RADAR.md` (R-tempo).

### Como retomar
- `agente status`/`agente list` (outra worktree: `feat-router-ativacao-r2`).
- Dev: `agente up` (porta 3000). Checkpoint de feedback em PRODUCTION.
- NÃO mergear/PR sem o usuário pedir. Tudo na branch `feat/agente-nex-bubble-ux` (PR #51).

---

## 2026-06-03 , Otimização de custo do Agente Nex + reconciliação do banco (PR #51, MERGEADO)

Branch `feat/agente-nex-bubble-ux`. Frente de redução de custo por pergunta do
agente + correção de um drift de banco pré-existente. Verificado (tsc raiz+mcp,
suíte 2331 verde, smoke E2E real, code review por 2 revisores Opus) e **mergeado
na `main` com CI verde**.

- **Alavanca 1 , prompt caching da OpenAI:** corrigido bug que zerava o cache (a
  data ficava no topo do system prompt, mudava a cada segundo). Agora a data vai
  como item de input antes da pergunta (`montarConversa`), deixando o prefixo
  system estável e cacheável. Provider lê `cached_tokens` (Responses+chat); billing
  precifica input cacheado a 0.1x (menu de consumo deixa de superestimar); coluna
  `tokens_cached_input`; `prompt_cache_key` estável por hash do system.
- **Alavanca 2a , janela de histórico:** 12 mensagens, confirmada em produção (sem
  mudança de código).
- **Alavanca 2b , paginação:** engrenagem `mcp/lib/paginacao.ts` + `_PAGINACAO` no
  envelope; ~37 tools de lista grande com `limit`/`offset` no SQL (10 por vez),
  `orderBy` estável + desempate por id, `count` no mesmo `where`. Fuzzy/agregadas
  como exceção documentada (slice estável). Prompt (12c-bis) ensina a listar 10 e
  pedir "os próximos" via `proximoOffset` (stateless: offset no histórico).
- **Reconciliação de drift schema<->migrations (IMPORTANTE):** várias frentes
  (qualidade, validators, monitoramento, sugestões) editaram o `schema.prisma` via
  `prisma db push` no dev sem gerar migration. Como produção roda `migrate deploy`
  (ver `docker/entrypoint.sh`), essas colunas/índices **não existiam em produção**.
  Criada `20260603150000_reconcilia_schema_drift` (gerada por `migrate diff
  --from-migrations --to-schema`), validada em shadow limpo: após ela,
  `migrate diff` = **"No difference detected"**. O próximo deploy alinha produção.
  Dropa 3 colunas renomeadas em `conversation_quality_evaluations` (auditoria
  interna). **Lição: usar `migrate dev`, não `db push`, para mudanças de schema.**
- **Pós-merge na main:** o redeploy do Portainer roda `migrate deploy` (aplica a
  reconciliação em prod) e o entrypoint sobe a app. Containers locais (`mcp`/worker)
  rebuildam quando o usuário validar na bubble.

## 2026-06-03 , Monitoramento + Qualidade do Agente Nex (branch `feat/router-ativacao-r2`)

Polimento da aba de Monitoramento (Backtest + Router) e **redesenho do cron de
avaliação automática**. Tudo verificado (tsc + suíte 2183 verde). Em PR para a `main`.

- **Drill-down do Router (pendência do handoff RESOLVIDA):** banner "Roteamento
  divergente" agora quebra dentro da caixa. Raiz dupla: `style={panelWidth}` inline
  causava divergência de hidratação + `<td>` herdava `whitespace-nowrap`. Removida a
  medição JS; `whitespace-normal` no td. Linhas da tabela intactas.
- **Resposta da IA não vaza mais** (backtest + router): `whitespace-normal` no td +
  `MarkdownSnapshot` com `overflow-wrap:break-word` e NBSP em moeda/unidade (quebra só
  nos espaços do nome, nunca no meio do valor).
- **Datas no horário de Brasília**, sem vírgula, com segundos e sufixo padrão
  **`(Brasil, UTC-3)`**; razões reescrevem o `[AJUSTE HUMANO]` (gravado em UTC) para BRT.
- **Ajuste humano vira status efetivo** (`humanStatus ?? status`): conta nos KPIs e no
  gráfico de % correto; coluna Status e drill-down mostram "antes→agora". Seletor de
  ajuste é dropdown com **tags coloridas**.
- **Tabela Router:** coluna Pergunta estreita (280px), "Router escolhida" com 5 tags
  numa linha só, `cadastros` em laranja; Pergunta completa + Resposta no drill-down.
- **Cron de avaliação automática REDESENHADO:** a heurística sem LLM
  (`heuristica-agente-nex-v1`) foi **aposentada**. A avaliação automática agora roda
  **host-side via Claude Code headless** (`src/instrumentation.ts` +
  `judge-scheduler.ts` + `claude-judge-runner.ts`), **local-only** (o worker/container
  não enxerga o CLI `claude`), com lock compartilhado com o botão "Avaliar pendentes",
  lendo o intervalo de `AgentSettings` (default 240min), sem disparar no boot.
  **Em docker, atualizar o worker exige `docker compose build app` + recreate worker.**
- **Re-julgamento das 12 classificadas pela heurística** (Claude Code Opus, conferindo
  contra o cache real): **11 CORRETO + 1 PARCIAL**. Única falha real: itens negativos de
  esteira respondidos com os maiores por valor (`docs/RADAR.md` / memória 8504).

> **Ainda pendente do roadmap (inalterado):** o gate de validação ao vivo do router
> (item 1 abaixo). O router segue OFF/shadow por decisão do usuário.

## ✅ ROADMAP DE COBERTURA (R1→O5 + Balde B) , CONCLUÍDO E MERGEADO (2026-05-31)

Roadmap canônico: `docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md`.
Tudo na `main`. Snapshot atual: **~93 tools visíveis, 39 fatos, 125 modelos (raw)**
(antes: 79/20/114).

- **R1** router de catálogo por embedding , mergeado (PR #36).
- **R2** discovery enxuto (3 baldes A/B/C) , mergeado (PR #38).
- **O1** SPED Fiscal / DF-e , mergeado (PR #39).
- **O2** CRM , concluído (achado honesto: CRM transacional inexistente neste Odoo).
- **O3** Pedido (histórico/etapas) , mergeado (PR #40).
- **O4** Financeiro (DRE gerencial / lançamento item) , mergeado (PR #41).
- **O5/Balde B B1** Contábil (referencial real + lançamento estrutural) , PR #42.
- **Balde B B2-B7** (PR #42/#43): fiscal complementar (MDF-e/REINF), cobrança
  bancária (B3, dado real), comercial cotação/comissão (B4), produção (B5),
  estoque avançado/mín-máx (B6), CRM funil + auditoria.regra (B7, 15 regras reais).
  Todas com SPEC v1→v3 + PLAN v1→v3, E2E contra cache real, padrão honesto
  (count==0 → "não operado", auto-ativa).

**Pendências reais (não é "build", é gate/opcional):**
1. **Gate de validação ao vivo R-X ≥ 95,5%** (P4 do roadmap): router/reformulação
   seguem **OFF/shadow** até essa bateria passar. É o "ativação do router"
   (nome da branch) , único item que fecha o roadmap de fato.
2. **ON+1 opcional:** `relatorio.*` (0 no catálogo) e resto de `sped.*` , decisão
   do usuário se vale modelar.
3. **Fora do escopo deste roadmap:** F5 (WhatsApp+Agente), F6 (construtor),
   F4 Onda 2 (escrita), F3 (dashboard de relatórios).

**Infra (fix de raiz 2026-05-31):** `prisma.config.ts` carrega `.env.local`
(`migrate deploy` funciona); e o **worker não tem `build:` próprio → rebuildar via
`app`** (`docker compose build app`), documentado em `CLAUDE.md §2.1`. Era a causa
do worker rodar catálogo velho e modelos novos ficarem sem sync.

---

> ## 🔄 (histórico) BRANCH `feat/router-ativacao-r2`
>
> **R1 mergeado** (PR #36). **R2-ctx entregue/mergeado** (PR #37): roteamento
> contextual 3 camadas (embedding -> reformulação LLM gated no fallback ->
> re-embedding), janela de contexto configurável (10-50 + filtro de papéis),
> bloco "Configuração do Router" na tela de Configuração (credencial de embedding
> migrada do Monitoramento), ApiKeySelect com sufixo mascarado, + bateria de
> ajustes de UI (slider fluido, tier badges, zero sem risquinho, OpenRouter em
> anexo). Reform e router seguem **OFF/shadow** até o gate de validação ao vivo.
>
> **R2 Discovery enxuto ENTREGUE** (mesma branch, metodologia completa SPEC
> v1->v3 + PLAN v1->v3 com 2 reviews adversariais cada). Classificou os 652
> modelos da Tauga em 3 baldes via `search_count` (uid 11 quase-admin):
> **A=90, B=268, C=294, nao_class=0** (partição exata). Lógica pura testada em
> `src/lib/discovery/baldes/` (37 testes) + CLI `npm run discovery:baldes`
> (`scripts/discovery/baldes/run.ts`). Artefatos: `discovery/odoo-schema/baldes.json`
> + `docs/discovery/2026-05-29-baldes.md` (insumo das ondas). Ground-truth do censo
> confere (sped.tabela.preco.regra 11864, sped.consulta.dfe.item 4780 em A; crm em
> B sem_sinal). Achado E2E: o `OdooClient` embrulha faults após retries, então
> `error-kind` separa acesso/inexistente por mensagem (pt-BR/en).
>
> **R2 MERGEADO na main (PR #38).** Branch segue viva: decisão do usuário é fazer
> **o roadmap inteiro nesta MESMA branch `feat/router-ativacao-r2`** (sem novas
> worktrees; só troca de sessão por contexto). PRs por onda, merge gated pelo
> usuário (ele autorizou abrir+mergear acompanhando o CI).
>
> **EM CURSO: O1 , Onda piloto SPED Fiscal (DF-e de entrada). SPEC FECHADA (v3).**
> - SPEC v1->v2->v3: `docs/superpowers/specs/2026-05-29-o1-sped-fiscal-spec.md`.
> - Review #1 (auditou 13 tools fiscais): `reviews/2026-05-29-o1-spec-review-1.md`.
> - Review #2 (aterrada no dado real via JSON-RPC, corrigiu o piloto inteiro):
>   `reviews/2026-05-30-o1-spec-review-2.md`.
>
> **Escopo travado (aterrado no dado real):** fonte `sped.consulta.dfe.item` (6.288
> regs, 1 linha=1 DF-e). Entrega: **1 raw novo** (`sped.consulta.dfe.item` ->
> `raw_sped_consulta_dfe_item`, entra no MODEL_CATALOG e no painel "Estado da
> ingestão" 113->114), **1 fato novo** `FatoDfe` (agrega por `cnpj_cpf`; `vr_nf`
> às vezes 0), **3 tools** (`dfe_importados_periodo`, `dfe_por_fornecedor`,
> `dfe_pendentes_manifestacao`; `manifestacao` char: 621 "conhecido"/5.667 vazio).
> Cortados no review #2: FatoDfeItem (sem produto), duplicatas (redundante c/
> financeiro), referência NCM/CFOP (já existe).
>
> **REQUISITO do usuário (2026-05-30):** todo modelo/fato novo tem que aparecer no
> painel "Ver estado da ingestão" (`/configuracao`) com status ok. Confirmado: o
> painel é data-driven do `MODEL_CATALOG`+`SyncState` (só raw, sem aba de fatos),
> então registrar o modelo no catálogo + sync basta.
>
> **O1 MERGEADO (PR #39).** **O2 (CRM) CONCLUÍDO , achado honesto:** o CRM
> transacional NÃO EXISTE neste Odoo (varredura dos 652 modelos: só `crm.pipeline`
> e `crm.pipeline.etapa`, ambos config com 0 registros, `sem_sinal`; nenhum
> lead/oportunidade/funil/vendedor). A F4 já cobre com honestidade via
> `crm_status_dominio` ("módulo existe, não operado", teste verde). Decisão
> (CLAUDE.md §6/§11, sem trabalho fake): O2 é documentação + verificação, **sem
> schema/raw/fato/tool novos**; "CRM real" fica gated pela ativação do módulo na
> Matrix (P8). Spec: `docs/superpowers/specs/2026-05-30-o2-crm-spec.md` v2 + review.
> **O3 (Pedido) IMPLEMENTADO E VERIFICADO (histórico de etapas).** `FatoPedidoHistorico`
> (de `raw_pedido_documento_historico`, já no catálogo) + builder `fato-pedido-historico.ts`
> (saneia `tempo_etapa` negativo via GREATEST) + 2 tools comerciais
> (`comercial_pedido_historico_etapas`, `comercial_pedido_travados_por_etapa` ,
> processo/fluxo, não financeiro). Catálogo 71->73; BI_SCHEMA_REFERENCE + vocab Router.
> Migration `o3_pedido_historico` (só 1 fato) aplicada via workaround de drift.
> **E2E dado real:** fato 9175 linhas, **0 negativos** (saneado), pedido 821 = 30
> eventos/7 dias/6 etapas (bate com a review), 14 travados >90 dias (mais antigo 130
> dias). Suíte 2109 verde. **Gate pendente:** bateria R-X ao vivo. PR aberto.
>
> ---
>
> ### O3 (Pedido) , SPEC v3 FECHADA (`docs/superpowers/specs/2026-05-30-o3-pedido-spec.md`
> + review com introspecção ao vivo em `reviews/2026-05-30-o3-pedido-review.md`).
> Achado: F4 já cobre pedido (17 tools + `fato_pedido`/`fato_pedido_parcela`); a visão
> do roadmap (cotação/proposta) é Balde B vazio (não operado). **Único gap Balde A real:**
> `pedido.documento.historico` (9.173 reg, log de transição de etapas, raw + catálogo
> JÁ existem, SEM fato). Escopo travado: `FatoPedidoHistorico` (shape real:
> pedidoId, etapaId, etapaTipo, dataEntrada=data_ultima_etapa, dataProxima,
> tempoEtapaDias=GREATEST(tempo_etapa,0) , **204 negativos saneados no builder**,
> usuarioId) + 2 tools (`pedido_historico_etapas`, `pedido_travados_por_etapa` ,
> processo/fluxo, não financeiro).
>
> **PRÓXIMA AÇÃO O3 = EXECUÇÃO** (PLAN v1->v3 opcional dado o shape já travado, depois
> build): migration SÓ do `fato_pedido_historico` (raw já existe, então é 1 tabela de
> fato; workaround de drift se preciso, AVISAR antes); builder `fato-pedido-historico.ts`
> no padrão `fato-dfe.ts` (O1); 2 tools em `mcp/tools/comercial/` no padrão das tools
> DF-e do O1; registry + FATO_FONTE + integration counts + vocab Router + BI_SCHEMA_REFERENCE;
> E2E dado real; rebuild pasta principal; bateria R-X; PR gated. Template completo: o
> O1 (`docs/superpowers/plans/2026-05-30-o1-sped-fiscal-dfe.md` + commits da onda DF-e).
> NÃO iniciar a migration com contexto curto.
>
> **Depois: O4 (Financeiro)** , 25 modelos `finan.*` faltantes (Balde A/B a auditar
> vs os fatos financeiros já existentes), **O5 (Contábil)** , exige input do contador
> da Matrix antes de codar (roadmap). Padrão de achado das ondas até aqui: muito do
> "expansão" já está coberto pela F4 ou aponta para modelos vazios; cada onda começa
> auditando cobertura real vs Balde A antes de construir (evita trabalho fake).
>
> ---
>
> ### O1 IMPLEMENTADO E VERIFICADO (DF-e de entrada). Entregue nesta branch:
> raw `sped.consulta.dfe.item` no MODEL_CATALOG (painel **113->114, status ok,
> 6288 registros**); `FatoDfe` + builder `fato-dfe.ts` (registry + FATO_FONTE);
> 3 tools (`fiscal_dfe_importados_periodo`, `fiscal_dfe_por_fornecedor`,
> `fiscal_dfe_pendentes_manifestacao`, catálogo 71 tools); query layer `dfe.ts`;
> vocabulário Router; `fato_dfe` no BI_SCHEMA_REFERENCE (Caminho 3c). Migration
> aplicada via workaround de drift (PR1-2). **Verificação:** tsc/eslint verdes,
> suíte 2127 testes (37 novos do R2 + os do O1), **E2E contra dado real**: 6288
> linhas, `pendentes_manifestacao=5667` (bate com ground-truth), `por_fornecedor`
> 368 fornecedores, vrNf total R$100M. Code review aplicado (1 fix: agrega por
> dígitos do CNPJ; demais achados refutados contra o dado). PR aberto.
> **Gate pendente:** bateria R-X ao vivo (>= 95,5%) , validação do agente, roda
> contra o código mergeado/no ambiente do usuário.
>
> **PLAN FECHADO (v3):** `docs/superpowers/plans/2026-05-30-o1-sped-fiscal-dfe.md`
> (2 reviews em `reviews/2026-05-30-o1-plan-reviews.md`). 12 tasks TDD, sem
> placeholders, com o dossiê de padrões reais embutido (raw shape `data Json`/
> `odooWriteDate`; builder `fato-nota-fiscal.ts` + registry `FATO_BUILDERS`; tool
> `ToolEntry`+`withFreshness`+`FATO_FONTE`; bumps de contagem model-catalog 113->114
> e integration 68->71/77->80; vocab Router). Decisões abertas resolvidas na Task 0
> (inspeção do raw real): cycle, critério de manifestação, `consultaId` (lote, não empresa).
>
> **PRÓXIMA AÇÃO (retomar O1 aqui): EXECUÇÃO do PLAN v3**, Task 0 -> 11. ATENÇÃO:
> a Task 1 roda migration no Postgres dev compartilhado , AVISAR o usuário antes e
> usar o workaround de drift (PR1-2) se `migrate dev` pedir reset. Não começar a
> execução com contexto curto (migration pela metade = pior caso). Rebuild
> `worker`+`mcp`, E2E dado real, bateria R-X, code review, PR (merge gated).
> Depois: O2 CRM, O3 Pedido, O4 Financeiro, O5 Contábil.
>
> ---
> ### Histórico R1 (feat/router-catalogo-r1) , arquivado abaixo
>
> ## 🔄 (arquivado) `feat/router-catalogo-r1` (Sub-projeto R1 do roadmap)
>
> **Router de catalogo por embedding** em andamento (Caminho C do brainstorm
> 2026-05-28). Habilitador arquitetural das ondas de expansao do MCP. Spec/Plan
> em `docs/superpowers/{specs,plans}/2026-05-28-router-catalogo-*`.
>
> ### Progresso atual (11 commits ahead de origin/main, backend completo)
> - **G0**: rebase + investigacao bateria R-X (`pnpm tsx scripts/quality-audit/03-run-test-questions.ts`) ✓
> - **Wave A**: migration aplicada (5 colunas em agent_settings + tabela agent_router_decision), 5 modulos puros (vocabulary, tool-to-domain, question-normalize, types), 39 testes ✓
> - **Wave B**: motor completo (embed-domains race-safe, embed-question LRU 200, pick-domains regras 1-8, filter-catalog generico, log-decision fire-and-forget), 98 testes ✓
> - **Wave C completa**: C1 wire em `src/lib/agent/run-agent.ts` (shadow default, ROUTER_FORCE_DISABLE honrado) + C2 `router-retry.ts` (helper isolado para auto-validator com 15 testes) + C3 integration tests (8 testes) ✓
> - **Wave D backend**: `queries.ts` com 5 server queries (getRouterKpis, getRouterHistogram via width_bucket, getRouterDiscordancias, getRouterLatencyTimeseries, getRouterEligibleToActivate) + `router-settings.ts` server action com gate de seguranca + rate limit 10/min + audit ✓
> - **Wave E parcial**: POST `/api/admin/router/kill` (kill-switch nivel 2) + `scripts/router/calibrate-against-batteries.ts` (calibragem offline contra 291 perguntas R8-R23) + `.env.example` documentando ROUTER_FORCE_DISABLE ✓
> - **Fix bonus**: corrigida falha pre-existente em `src/worker/catalog/model-catalog.test.ts` (modelo `pedido.documento.historico.tempo` intencionalmente removido do catalogo) ✓
>
> ### Verificacoes feitas
> - **tsc verde** em todo o monorepo.
> - **1968 testes do projeto verdes** (4 suites skipped). Antes desta branch havia 1 falha; agora zero.
> - **Migration aplicada** no Postgres dev local (`agent_router_decision` + 5 colunas em `agent_settings`).
> - **Padrao de tool 100% preservado** (P2 do roadmap): zero tool MCP existente alterada.
> - **Shadow mode default**: `routerEnabled=false`, LLM recebe catalogo inteiro. Zero impacto no 95,5% baseline da R23.
>
> ### Sessao 2026-05-28 21:45 (continuacao)
> - **Descontaminacao RBAC v2**: o commit `f9ef264` tinha empacotado o gating do
>   RBAC v2 (layouts + rotas que importam `@/lib/auth/require`, modulo que so
>   existe na branch `feat/rbac-v2-gating-e-dominios`), deixando o **tsc da branch
>   vermelho**. Revertidos/removidos os 11 arquivos de gating; tsc verde de novo.
>   Mantida toda a UI legitima do router. Commit `3c1bd38`.
> - **Wave D4f + E4 entregues**: `RouterCalibrationButton` (botao de processo
>   longo + KPIs + selo de aprovacao) + rota `POST /api/admin/router/calibrate`
>   (gate super_admin, rate limit 3/5min, audit) + nucleo `calibrate.ts`
>   (`runCalibration`, reusado por CLI e rota). 6 testes novos. Commit `6e448fa`.
> - **CLI de calibragem corrigido**: env carregada antes do prisma (preload
>   `scripts/router/load-env.ts`); calibragem com **concorrencia 8** (full run
>   ~1-2min). Commits `51f4e8c`, `a1c47db`.
> - **Calibragem rodada de verdade** (achado R9 no RADAR): no threshold default
>   **0.55 o router cai em fallback 84% das vezes (Top-1 16,2%)**. Sweep mostra
>   0.35 como melhor ponto (Top-1 63,9% / Top-K 75,9%). Nao e bug de scoring, e
>   threshold mal calibrado. Relatorio em `docs/router-calibration-r1.md`.
>
> ### Pendencias para fechar R1
> - **R9 (decisao do usuario)**: baixar o threshold default 0.55 -> ~0.35
>   (mudanca de `AgentSettings.routerThreshold` + linha `global`). Mesmo a 0.35,
>   Top-1 63,9% < gate de 85%: enriquecer `domain-vocabulary.ts` e re-rodar.
> - **Wave G**: rebuild containers (`app`, `mcp`, `worker` por causa do schema),
>   rodar **bateria R-X em shadow contra baseline 95,5%** (valida que o router em
>   shadow nao regride o agente), code review, UI review, **PR contra main (pede
>   aval do usuario)**.
>
> ### Como retomar Wave G manualmente
> ```bash
> # 1. Rebuild containers (schema mudou)
> docker compose build app mcp worker
> docker compose up -d app mcp worker
>
> # 2. (Opcional) Calibragem offline contra perguntas historicas
> pnpm tsx scripts/router/calibrate-against-batteries.ts
> # -> docs/router-calibration-r1.md
>
> # 3. Bateria R-X em shadow
> pnpm tsx scripts/quality-audit/03-run-test-questions.ts --limit 300
> # -> aguarda execucao, depois compara contra baseline 95,5%
> ```
>
> ## ✅ Ronda Nex anterior concluída e mergeada
>
> **Ronda de qualidade do Agente Nex 100% entregue:**
> - **PR #30 MERGEADO** em 2026-05-28 14:04 (commit `4d9c226`)
> - **PR #31 MERGEADO** em 2026-05-28 14:15 (commit `d01c219`, hotfix lint travessões)
> - Resultado: 78,5% → 95,5% CORRETO real (R17 → R23, 290 turnos)
> - +17pp acumulado, meta 95% superada
>
> ### Tudo aplicado no ambiente local (único existente)
> Projeto ainda não tem produção. Tudo abaixo já está rodando no
> ambiente local (Postgres `nexus_odoo_l1` via Docker compose):
> - Migration `20260528010000_fato_parceiro_data_criacao` aplicada
>   (coluna + índice).
> - Migration `20260528020000_dim_empresa_grupo` aplicada (tabela com
>   18 empresas do grupo Matrix seedadas via regex + GRANT já incluído).
> - Backfill rodado: 6576/6576 parceiros com `data_criacao` populada
>   (datas entre 2025-04-11 e 2026-05-27).
> - Smoke E2E executado: `validate-novas-tools.ts` 16/16 OK contra SQL
>   direto. Smoke test geral: 49 OK / 0 ERRO em 65 tools.
>
> Quando o projeto for pra produção (Portainer + ghcr.io conforme
> arquitetura prevista no CLAUDE.md §3), o `docker/entrypoint.sh` já
> roda `prisma migrate deploy` automaticamente no boot do container
> `app`. Só o backfill é manual e único (script SQL acima preserva).
>
> ### Relatórios completos da rodada (em `docs/agent-quality-review/`)
> - `auditoria-manual-r17-r18.md` (raiz do trabalho)
> - `r19-relatorio.md` (Ronda 1, 84%)
> - `r20-relatorio.md` (Ronda 2, 86%)
> - `r22-relatorio.md` (Ronda 3, 94%)
> - `r23-relatorio.md` (R23 final, 95,5%)
> - `ronda5-plano.md` (R5: 7 tools novas + regra prompt anti-lacuna)
>
> ### Outro agente em paralelo
> O agente `claude-router-catalogo-r1` está trabalhando em
> `feat/router-catalogo-r1` (Router de Catálogo por embedding) desde
> 2026-05-28 10:30. Ler `docs/agents/active/claude-router-catalogo-r1.md`
> antes de mexer em qualquer coisa relacionada a catálogo MCP, embeddings
> ou agente. **Não mexer em arquivos da branch dele** sem coordenar.
>
> ### Próxima sessão, quando retomar
> - Branch ativa: `main` (PRs #30 + #31 + #32 mergeados).
> - Não há pendência operacional. Ambiente local tem tudo aplicado.
> - **NÃO existe produção ainda** (corrigido em 2026-05-28 11:30 após
>   confusão na sessão anterior). Antigo: "parceiros
>   novos cadastrados esta semana" nem "quantas filiais temos" até as
>   2 migrations rodarem em prod.
> - Próxima frente provável: avaliar fechamento da Ronda nex como
>   release / tag, ou começar trabalho novo (router de catálogo está
>   em andamento por outro agente).

---

## 1. Onde estamos

| Fase | Entrega | Status |
|---|---|---|
| **F0 — Discovery** | Mapa do Odoo (modelos/campos/relações) | ✅ mergeado na `main` (PR #1) |
| **F1 — Fundação** | App no ar, login, RBAC | ✅ mergeado na `main` (PR #2) |
| **F2 — Ingestão/cache** | Worker BullMQ + cron JSON-RPC + cache Postgres | ✅ mergeado na `main` (PR #4) |
| **F3 — Dashboard de relatórios** | 6 relatórios de estoque sobre o cache | ✅ mergeado na `main` (PR #4) |
| **F3.5 — Dashboard de relatórios v2** | Sofisticação no padrão `nexus-insights` | ✅ mergeado na `main` (PR #4) |
| **F4 — MCP semântico** | Servidor MCP, **todos os domínios** + Caminho 3c funcional | ✅ **completa — mergeada na `main` (PR #5 + #6 + #7)** |
| **F5 — Integração WhatsApp** | Agente de IA por WhatsApp + chat in-app, Integrações, RAG | ✅ **mergeada na `main` (PR #9, commit `682b9a7`)** |
| **F4 Onda 2 — Escrita no MCP** | Capacidade de escrita no servidor MCP, gate por API Key com capabilities, painel Servidor MCP | 🔄 **PR #10 aberto e avaliado** (branch `feat/f4-onda2-mcp-escrita`): Onda 0 + painel Servidor MCP + Plugar MCP com abas + integração agente para MCP externo; pendente: testes E2E (escrita real e MCP externo) |
| F6 — Construtor de relatórios | Wizard in-app guiado por IA | ⬜ futura (inclui o polimento fino dos relatórios) |

**Branch ativa: `feat/f4-onda2-mcp-escrita`**. A `main` tem F0+F1+F2+F3+F3.5+F4+F5.

> ## ⚠️ RETOMADA, F4 ONDA 2: RODADAS 8 E 9 **CONCLUÍDAS**, PR #10 AVALIADO
> A F4 Onda 2 está na branch `feat/f4-onda2-mcp-escrita`, **PR #10** aberto para
> a `main` e **avaliado por Claude** (a avaliação completa está no corpo do PR).
> Onda 0 + Rodadas 1 a 9 **concluídas**. Árvore de trabalho limpa, branch
> sincronizada com `origin`. Spec/plano da r8 em `docs/superpowers/`
> (`specs/2026-05-21-f4-onda2-r8-*`, `plans/2026-05-21-f4-onda2-r8.md`,
> `reviews/2026-05-21-r8-plan-review-{1,2}.md`).
>
> **R8 (feature, metodologia completa: spec + plano v1 a 2 reviews genuínas a
> v3):** webhooks no padrão de card + criação em modal; **Plugar MCP com abas**
> (Visão Geral, Servidores, Logs); **integração agente para MCP externo**
> (`src/lib/agent/external-mcp.ts`): o Agente Nex abre sessão com os servidores
> MCP externos cadastrados, soma as tools deles ao catálogo com prefixo `ext__`,
> e cada chamada vira `ExternalMcpCallLog`.
> **R9 (ajustes pós-validação):** alinhamento das tags de log, seletor de ano
> mais estreito, respiro no modal de webhook, cabeçalho do Plugar MCP consistente
> entre abas (header e nav movidos para o `layout`).
>
> **Verificação (estado atual da branch):** `tsc` limpo, `eslint src/` 0 erros
> (4 warnings pré-existentes, RADAR R7), `jest` 1536 testes, `next build` verde.
>
> **PENDENTE antes do merge do PR #10:**
> 1. Teste E2E de **escrita real** contra `grupojht.teste.tauga.online` (faltam
>    credenciais `ODOO_WRITE_*`). É o gate de merge.
> 2. Teste E2E da **integração agente para MCP externo** (precisa de um servidor
>    MCP externo alcançável + credencial de LLM ativa).
> 3. Deploy: após `prisma migrate deploy`, reexecutar os GRANT scripts (RADAR R4).
> **NÃO mergear o PR #10 antes dos testes E2E.**
>
> **Rodada 7 — completa (commitado, `tsc`/`eslint`/`jest` 1531/`build` verdes):**
> calendário do `DateField` com setas de mês simples nas extremidades (mais espaço para
> mês/ano); `SecretRevealStep` sem travessão, descrição em 1 linha, termo "token" e botão
> "Concluir" (no rotate da edição o Concluir já salva a edição); modal de criação de
> chave atualiza a lista ao fechar (Concluir ou X); na edição da chave o Tenant fica
> visível (read-only) e as Origens voltaram a ser editáveis; Logs: detalhe sempre
> explica o motivo de erro/negado/inválido, nota do topo resumida, e cada linha ganhou
> uma tag com o nome da chave (ou "Agente Nex"); tours de Documentação, Logs e Chaves
> ganharam passos (tool aberta, registro aberto, chaves cadastradas) e o `tour-overlay`
> passou a re-tentar localizar alvos que surgem após a troca de passo.
>
> **Pendências herdadas:** teste E2E de escrita real contra `grupojht.teste.tauga.online`
> nunca rodou (faltam credenciais `ODOO_WRITE_*`); inspeção visual pixel a pixel.
> **NÃO mergear o PR #10 antes do teste E2E de escrita.**

---

## 2. O que já foi entregue

### F2 — Ingestão/cache
Worker BullMQ + cron JSON-RPC sincronizando o Odoo Tauga para o Postgres cache:
`OdooClient` JSON-RPC, **79 tabelas `raw` JSONB**, `SyncState`, sync engine
(incremental/snapshot/reconcile com isolamento de falha), tela `/configuracao`
(super_admin). 78/79 modelos sincronizam (`pedido.documento.historico.tempo` é
defeito do próprio Odoo).

### F3 — Dashboard de relatórios
RBAC por domínio (`ReportDomain`, `UserDomainAccess`); **fatos de estoque**
(`fato_estoque_saldo`, `fato_estoque_movimento`, `fato_produto_parado`) +
builders no worker + `FatoBuildState`; motor declarativo (catálogo → render);
6 relatórios de estoque em `/relatorios`.

### F3.5 — Dashboard de relatórios v2 (milestone, sub-fases a–g)
Roadmap: `docs/superpowers/plans/2026-05-17-f3.5-roadmap.md`.
- **a — Charts v2:** animação, gradient, tooltip rico, `KPICard`, `ChartCard`.
- **b — Seletor de período:** `PeriodBar` (pílulas + calendário de meses
  travado à faixa de dado), estado na URL. Spec/plan v1→v3 em `docs/superpowers/`.
- **c — Tabela profissional:** ordenação multi-coluna com indicador numerado,
  busca em todas as colunas, linhas expansíveis (drill-down), exportar CSV.
- **d — Filtros:** dropdowns decentes (agrupados, com busca), chips de filtros
  aplicados, diálogo simples (facetas) + avançado (construtor E/OU recursivo,
  modelo puro `compilarFiltro`).
- **e — Presets, atalhos e tour:** `ReportPreset` (model + migration + Server
  Actions), atalhos de teclado, tour de onboarding reutilizável.
- **f — Relatórios repensados:** `valor-armazem` vira lista+KPIs, `entradas-saidas`
  ganha tabela de detalhe, `top-movimentados`/`produtos-parados` ganham
  KPIRow+DataTable, `concentracao` ganha tabelas por trás dos gráficos.
- **g — Frescor do dado:** snapshot do worker 1440→**30 min**;
  `FreshnessIndicator` ("Atualizado há X min", auto-refresh).
- Verificação final: `tsc`/`eslint`/`jest` (381) /`next build` verdes; CI verde.

> Pontos finos de relatório que ficaram para a F6 (decisão do usuário): a F3.5
> "melhorou bastante" mas não está 100% — o polimento fino é escopo da F6.

---

## 3. Metodologia (resumo — detalhe em `CLAUDE.md §6`)

Toda implementação percorre, **em modo autônomo automático** (sem pedir
permissão entre etapas):

```
[1] BRAINSTORM → SPEC v1            ← requer humano (entrada de requisitos)
[2] DESIGN UI/UX (ui-ux-pro-max)
[3] REVIEW SPEC #1 → SPEC v2        ← review crítica de verdade
[4] REVIEW SPEC #2 → SPEC v3        ← review ainda mais profunda
[5] PLAN v1 (sobre a SPEC v3)
[6] REVIEW PLANO #1 → PLAN v2
[7] REVIEW PLANO #2 → PLAN v3       ← tasks em microtarefas, decomposição máxima
[8] EXECUÇÃO (Superpowers; fase grande → subagentes Sonnet em paralelo)
[9] VERIFICAÇÃO (tsc/eslint/jest/build verdes; evidência antes de afirmar)
[10] CODE REVIEW + UI REVIEW (/gsd-code-review, /gsd-ui-review — Opus)
[11] /ultrareview                  ← requer humano (manual, opcional)
[12] DEPLOY ASSISTIDO              ← requer humano
```

- `ui-ux-pro-max` é **obrigatório** em tudo que for frontend.
- Subagentes: execução em **Sonnet**, reviews em **Opus**.
- Artefatos em `docs/superpowers/`: `specs/`, `plans/`, `reviews/`, `research/`.
- Git: nunca commitar na `main`; feature branch → PR → merge (decisão humana).

---

## 4. Ambiente

- Docker: `docker compose up -d db redis` — `db` (Postgres 5436), `redis` (6380).
- Banco migrado (Prisma) e com seed. `.env.local` (gitignored) tem credenciais
  do Odoo Tauga e do owner.
- Worker: `npm run worker`. Dev server: `npm run dev` (porta 3000).
  **Ambos estavam encerrados no fim desta sessão** — reabrir conforme necessário.
- Verificação: `npx tsc --noEmit`, `npx eslint src/`, `npx jest`, `npx next build`.

---

## 5. PARA RETOMAR — F5 em execução (ondas 1–7 completas)

A **F4 (MCP semântico) está completa e na `main`** — PRs #5, #6, #7, #8.

A **F5 está em execução** na branch `feat/integracao-whatsapp`. Todas as 7 ondas
implementadas. Próximo passo: code review + UI review (`/gsd-code-review` e
`/gsd-ui-review`) → PR para `main`.

### F5 — Status das ondas

| Onda | Entrega | Status |
|---|---|---|
| **Onda 1** | Fundação de dados + núcleo do agente (schema, mcp-client, run-agent, conversation, llm stack) | ✅ completa |
| **Onda 2** | Cadastro de WhatsApp no usuário (campo phone, resolução número→usuário) | ✅ completa |
| **Onda 3** | Chat in-app (SSE, página `/agente`, config LLM/prompt, playground) | ✅ completa |
| **Onda 4** | Webhook receptor WhatsApp + processor BullMQ (inbound, HMAC, cloud-client) | ✅ completa |
| **Onda 5** | Consumo + playground (tela de consumo, histórico, playground com override de prompt) | ✅ completa |
| **Onda 6** | Menu Integrações (superadmin: Canais/WhatsApp, MCP, Webhooks, API, BI) | ✅ completa |
| **Onda 7** | RAG com pgvector (embed, searchKb, ingestão, integração ao prompt, UI de gestão de KB) | ✅ **completa (2026-05-19)** |

### Próximo passo

1. `/gsd-code-review` — auditoria de bugs, segurança, qualidade (Opus).
2. `/gsd-ui-review` — 6 pilares visuais nas telas novas (Opus).
3. Corrigir achados materiais.
4. Abrir PR `feat/integracao-whatsapp` → `main` (decisão de merge é humana).

### Artefatos da F5

- Spec v3: `docs/superpowers/specs/2026-05-18-f5-whatsapp-agente-spec.md`
- Plano v3: `docs/superpowers/plans/2026-05-18-f5-whatsapp-agente.md`
- Design: `docs/superpowers/research/2026-05-18-f5-ui-design.md`
- Runbook n8n: `docs/runbooks/n8n-whatsapp.md`

### O que a F4 entregou (33 tools no catálogo do MCP)

- **Container `mcp/`** — servidor Node puro `@modelcontextprotocol/sdk`,
  Streamable HTTP (porta 3100), service token + `userId` por sessão, RBAC
  estrutural (catálogo filtrado, gate no handler, role Postgres `nexus_mcp` com
  GRANT mínimo, rate limit, `McpAuditLog`).
- **Fatos** — estoque (3, da F3), financeiro (3), comercial (2: `fato_pedido`,
  `fato_pedido_parcela`), fiscal (2: `fato_nota_fiscal`, `fato_nota_fiscal_item`
  211k linhas), cadastros (`fato_parceiro`), contábil (`fato_conta_contabil`) —
  todos via registry de builders no worker.
- **33 tools semânticas** — 6 estoque, 6 financeiro, 5 comercial, 6 fiscal,
  3 cadastros, 2 contábil, 3 de domínio sem dado (RH/CRM/produção, respondem
  honestamente "domínio não operado"), `registrar_lacuna` (3a),
  `bi_consulta_avancada` (3c).
- **Caminho 3 completo** — 3a (log de gap), 3b (recusa), **3c funcional**:
  executor de SQL read-only embutido (role `nexus_mcp_bi`, guard AST via
  `pgsql-parser`, `default_transaction_read_only`, `statement_timeout`, LIMIT
  cap; rejeita DML/DDL/multi-statement; gated a admin/super_admin).
- Verificação: `tsc` (raiz e mcp), `eslint`, `jest` (837 testes), `next build`,
  `docker compose build mcp` — verdes.

### Domínios sem dado (informação do mapa de domínios)

RH e CRM existem no Odoo da Matrix mas têm **0 registros** — não são operados;
produção tem 1 registro; contábil só tem o plano de contas (sem movimento). As
tools desses domínios existem e respondem honestamente. Ver
`docs/superpowers/research/2026-05-18-mapa-dominios.md` e `docs/RADAR.md` R3.

### Atenção para o deploy da F4 (`docs/RADAR.md` R4)

O deploy assistido precisa, após `prisma migrate deploy`, (re)executar os
scripts de GRANT `prisma/sql/2026-05-17-mcp-role.sql` e
`prisma/sql/2026-05-17-mcp-bi-role.sql` — senão o MCP sobe com `permission
denied`.

### Artefatos da F4

`docs/superpowers/` — `2026-05-17-f4-*` (onda 1) e `2026-05-18-f4*` (completo):
specs v1→v3 (2 reviews cada), plans v1→v3 (2 reviews cada), review por onda,
code reviews finais, e research (`mapa-dominios`, `f4-completo-dominios`).

### Decisões canônicas da F4 (ver `CLAUDE.md §5`)

Cache obrigatório; sem fallback JSON-RPC; tools semânticas validadas; MCP
próprio em TS; RBAC 7 camadas; 3c é executor SQL embutido (revisão de §5.5/§5.7
registrada em 2026-05-18); F4 ≠ F5 (WhatsApp/conversas/personalização são F5).

---

## 6. Notas

- Specs/plans/reviews/research em `docs/superpowers/`. Workflow canônico e
  decisões: `CLAUDE.md`. Ideia da F6: `docs/ideias/2026-05-16-construtor-relatorios.md`.
- Modelagem de fatos: `docs/fatos-modelagem.md`. Git: `docs/git-workflow.md`.

> **Retomada (2026-06-03):** pendência única = drill-down do Router (banner não quebra texto). Ver docs/agents/HANDOFF-2026-06-03-router-drilldown.md.

## 2026-06-15 , auto-deploy (Shepherd) + start-first em prod; healthcheck do app pendente p/ zerar os ~18s de downtime. Fix clareza faturamento + ondas M/O/P em prod. Ver docs/runbooks/deploy-procedure.md e PROGRESSO.

## 2026-07-09 , Acesso aos menus por perfil EM PRODUCAO (PR #158, commit 8140334e)

Na tela Configuracao, o super_admin define quem ve cada um dos 8 menus do sidebar
(nivel por heranca). `menu_access` e a autoridade unica dos menus de topo: os gates
estaticos de `nav.ts` sairam e cada menu tem guarda de rota no layout
(`requireMenuAccess`), o que cobre as sub-rotas. Configuracao fica fixa em super_admin
(trava anti-lockout, e a tela so tem acoes de super_admin). O menu "Relatorios 2.0"
tinha dois seletores gravando em lugares diferentes; sobrou um (o card de Rel 2.0 ficou
com os submenus). `temp-rules.ts` foi removido: virou configuracao de tela.

Deploy validado: migrations 104/105 aplicadas em prod (menu_access + seed do nivel antigo
de Relatorios 2.0), app/mcp/worker atualizados em rolling, `/api/health` OK, bundle em prod
contendo o codigo novo, logs dos 3 servicos sem erro. Comportamento padrao identico ao de
antes: ninguem ganha ou perde menu ate alguem mexer na tela.

## 2026-07-09 (noite) , Conexao com WhatsApp (branch feat/conexao-whatsapp, NAO mergeada)

**Em producao hoje:** PRs #158 (menu_access como autoridade real dos menus), #159
(saude do banco + `scripts/db-health.py`), #160 (gate do canal in-app no servidor
+ receptor de WhatsApp so para super_admin + cards padronizados) e #161 (o
endpoint de recebimento de webhook estava inalcancavel de fora). Todos validados
em producao, migrations 105 -> 106 (a 106 e so no dev).

**Em andamento:** feature "Conexao com WhatsApp" (webhook 2-em-1: recebimento +
envio numa unica conexao). SPEC v3 e PLAN v3 fechados, cada um com duas reviews
adversariais. Execucao na Onda A.

**Achado mais grave (aberto):** `loadOutboundTargets()` dispara para TODOS os
destinos habilitados, sem filtrar por conexao , inclusive no `fireBlocked()`, que
roda antes da sessao. Com dois clientes, o "nao encontrei seu numero" de um vaza o
telefone no destino do outro. Teste que prova: `src/lib/whatsapp/isolamento.test.ts`.

**Retomada:** ler `branches/feat-conexao-whatsapp/.agente-handoff.md`.
