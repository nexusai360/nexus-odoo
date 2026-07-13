# RADAR — pendências conhecidas a resolver

> Itens identificados que **não bloqueiam** a entrega atual, mas precisam ser
> resolvidos antes de marcos seguintes. Revisar a cada nova onda/fase.

---

## R-stack-prod-drift — O compose da stack no Portainer NÃO chega no serviço vivo (RESOLVIDO no worker)

**O que aconteceu (2026-07-12).** O worker de produção morria com `JavaScript heap out of
memory` e parou de rodar os ciclos de sync. Havia um bug de código (o rebuild de
`fato_nota_fiscal_item` carregava as 9.595 notas inteiras no heap, corrigido no PR #178), mas
por baixo dele havia um problema de **infra** que teria mordido de novo:

| | compose da stack (Portainer) | serviço VIVO no Swarm |
|---|---|---|
| `NODE_OPTIONS` | `--max-old-space-size=4096` | `--max-old-space-size=1024` |
| limite de memória | `4608M` | `1536M` |

O compose declarava uma coisa e o Swarm rodava outra. **Causa:** `scripts/deploy-portainer.py`
(e o Shepherd) fazem *service update* via API do Docker, que troca a **imagem** e força o
rolling, mas **não reaplica o `environment` nem os `resources` do compose**. Só um
`docker stack deploy` faria isso. Então o compose foi corrigido em algum momento e a correção
**nunca chegou no serviço**: o worker seguiu com 1 GB de heap, e o container morria em ~1045 MB.

Isso também explicava por que o bug não reproduzia em dev: o `docker-compose.yml` local já
tinha `--max-old-space-size=2048`.

**Corrigido no worker** com `scripts/_prod-worker-heap.py --aplicar`: update cirúrgico do
serviço `nexus-odoo_worker` para heap 2048M dentro de um container de 4608M (folga de 2,5 GB,
sem risco de OOM-kill do kernel). Validado: ciclo incremental concluído em 126s, sem OOM.

**O que FICA de pendência:** a divergência é estrutural, não pontual. Qualquer mudança de
`environment` ou de `resources` feita no compose da stack continua **sem efeito** até alguém
rodar um stack deploy de verdade. Vale (a) auditar se `app`/`mcp` também estão com spec viva
divergente do compose, e (b) decidir se o pipeline passa a fazer stack deploy em vez de service
update. Enquanto isso, mudar env/limites em prod exige um update de serviço explícito.

---

## R-f5-drop-booleans-legados — Drop das colunas `bubbleEnabled`/`whatsappEnabled` deferido (banco compartilhado)

**Aberto em:** 2026-06-17 (F5 Onda C, branch `feat/router-ativacao-r2`).

**Contexto:** a Onda C trocou os dois booleans de disponibilidade do Agente Nex por
níveis de acesso (`bubbleAccessLevel`/`whatsappAccessLevel`, enum `ChannelAccessLevel`).
O **código** desta frente já não referencia mais `bubbleEnabled`/`whatsappEnabled`
(função `updateBubbleEnabled` removida, DTOs/Row/map migrados).

**Por que o DROP da coluna foi deferido:** o Postgres é **compartilhado** entre as
worktrees. As frentes paralelas vivas `feat-nex-reconstrucao` e `feat-deploy-producao`
ainda **leem** `bubbleEnabled`/`whatsappEnabled` (em `layout.tsx`, `agent-config.ts`,
`page.tsx`, `agent-availability-card.tsx`). Rodar `migrate dev --name
f5_drop_legacy_channel_booleans` agora dropa as colunas do banco compartilhado e
**quebraria o runtime das duas frentes** (Prisma seleciona coluna inexistente).

**Plano:** mergear esta frente cedo para `main`; as outras frentes rebaseiam e
migram para os níveis; **só então** rodar a migration de DROP (segunda migration,
seguindo o protocolo de schema: avisar + `agente schema-changed`). As colunas
permanecem fisicamente no schema/DB até lá (inertes para esta frente).

**✅ FECHADO em 2026-07-10** (branch `chore/dividas-whatsapp-radar`): as frentes
que liam as colunas foram encerradas; migration
`20260710010000_drop_booleans_legados_canal` dropou as duas colunas
(idempotente, aplicada no dev; prod aplica no boot do deploy).

---

## R-faturamento-duas-definicoes — Plataforma tem DUAS definicoes de faturamento divergentes (RESOLVIDO)

**Aberto em:** 2026-06-10 (achado ao auditar a consistencia da plataforma).
**FECHADO em:** 2026-06-10 (Fase 2.5). As tools `fiscal_faturamento_periodo`, `_por_cliente` e `_mensal_serie`
foram repontadas para a camada canonica (`item.vrProdutos` + Tabela de Regras + eliminacao intercompany).
`faturamento_periodo` grupo 2025 passou de R$ 551,2 mi (inflado) para **R$ 325,5 mi (receita externa real)**,
com faturamento individual (R$ 543,4 mi) e intragrupo eliminavel (R$ 217,9 mi) como auditoria. Por empresa,
mostra o individual da CNPJ com paridade externa/intragrupo + flag "concentrador" (Jds Matriz 94,8%). Core
compartilhado `_itens-venda-grupo.ts`; `receitaConsolidada` refatorada com saida identica (conferencia I3/I4 ao
centavo). Provado por conferencia + f2-receita-consolidada.e2e + smoke test. O dashboard nao importa
`reports/queries/fiscal.ts` (tudo via MCP), entao a correcao propaga para Nex/WhatsApp/Playground.

**Problema:** existem hoje duas camadas de calculo de faturamento que NAO conversam:
- **Canonica** (`src/lib/metrics/fiscal/`, Fases 1-2): por CFOP, `item.vrProdutos`, Tabela de Regras,
  elimina intercompany. Tools: `fiscal_faturamento_por_cfop`, `fiscal_receita_consolidada`,
  `fiscal_intercompany`, `_por_empresa`, `_por_operacao`, `_nao_autorizado`, `_recebido` (7).
- **Antiga** (`src/lib/reports/queries/fiscal.ts`, ~18 tools + dashboard): por NATUREZA de operacao,
  `nota.vrNf`, NAO elimina intercompany. Tools: `fiscal_faturamento_periodo` (a mais usada),
  `_por_cliente`, `_por_marca`, `_por_uf`, `_mensal_serie`, `impostos_periodo`, `produtos_faturados`,
  `notas_emitidas*`, etc.

**Impacto medido (2025):** a tool antiga `fiscal_faturamento_periodo` da **R$ 551,2 mi**; a receita
externa REAL (canonica, sem intercompany) e **R$ 325,5 mi**. **Divergencia de R$ 225,8 mi (+69%)**, quase
toda por NAO eliminar intercompany (as duas BASES de calculo batem: 551 vs 543 mi). E o dono quer o
numero real (sem intercompany). Pergunta "qual o faturamento?" hoje responde inflado.

**Plano (proxima fase , Unificacao):** migrar as tools de faturamento/receita para a camada canonica;
distinguir explicitamente "faturamento individual/bruto" (com intercompany) de "receita externa real"
(sem); aplicar a base de conferencia (`scripts/conferencia-fiscal.ts`) garantindo que nada quebra. O
dashboard de relatorios (`reports/queries`) consome a mesma camada , migrar junto. Consistencia exigida
em TODOS os consumidores (Nex in-app, WhatsApp/n8n, Playground) , como todos passam pelo MCP server, a
correcao na tool propaga, MAS o dashboard tem queries proprias que precisam alinhar.

---

## R-intercompany-fallback-fragil — 38,8% da eliminacao intercompany depende de regex sobre nome (RESOLVIDO)

**Aberto em:** 2026-06-10 (auditoria adversarial da Fase 2).
**FECHADO em:** 2026-06-10 (Fase 2.5). Criada `PARTICIPANTES_GRUPO_WHITELIST` (15 ids do grupo validados no
cache: 2,9,10,11,12,13,14,15,16,19,20,21,22,23,24), com os odoo_id reciclados (8722 Jaguaribe, 8723 Vilmar,
9552 Smartfit, 7719 Residencial) EXCLUIDOS explicitamente (`PARTICIPANTES_RECICLADOS_EXCLUIDOS`). `ehNotaIntragrupo`
agora cascateia whitelist→cadastro→nome. Delta na eliminacao = R$ 0 (a whitelist e blindagem, nao correcao , o
fallback de nome ja capturava tudo), mas a marcacao deixa de depender do regex de nome para os estabelecimentos
conhecidos. Travado por **S0** (gate: eliminacao pos-whitelist >= baseline pre-whitelist, ao centavo nos 5
periodos) e monitorado por **S1** (residual so-por-nome, caiu para 2025=0 / acumulado=109 apos a whitelist) e
**S2** (divergencia nome x cadastro = 0). Cuidado mantido: franquias "Matrix Fit" (32493616/50075046/57692916)
sao clientes externos, NAO grupo.

**Problema:** a marcacao intragrupo por `fato_parceiro.documentoDigits` so pega R$ 440,4 mi do intercompany.
Os outros **R$ 278,8 mi (2.538 notas, 38,8%)** so sao eliminados pelo fallback `extrairRaizCnpjDeTexto`
(le o CNPJ embutido no `participante_nome`), porque o `fato_parceiro` esta CORROMPIDO para os
estabelecimentos do proprio grupo: `documento_digits` VAZIO (pid 9/11/12...), ou pior, `odoo_id` reciclado
no Odoo apontando para CNPJ de OUTRA pessoa (pid 8723 = "Vilmar Luiz Borges" 21446394). O numero de hoje
esta CORRETO (auditoria confirmou a particao fechando ao centavo por ano), mas se um nome vier sem CNPJ
legivel, esses R$ 278,8 mi vazam para a receita externa e inflam o "faturamento real".

**Correcao recomendada:** (a) whitelist de `participante_id` conhecidos do grupo (odoo_id 2,9,10,11,12,13,
15,16,8722,8723,9552,7719...) alem das raizes; (b) sentinela na base de conferencia: contar notas marcadas
intragrupo SO por nome (hoje 2.538 / R$ 278,8 mi) e alertar se saltar; (c) sentinela de divergencia
nome×cadastro (participante cujo nome tem raiz do grupo mas `fato_parceiro` aponta doc de fora , hoje 10
pares); (d) NUNCA usar `fato_parceiro.eh_empresa` para identificar grupo (e lixo: inclui Banco do Brasil).
Cuidado: "Matrix Fit" franquias (32493616, 50075046) sao CLIENTES externos, nao grupo , nao adicionar por nome.

---

## R-sem-cfop-transparencia — Linha "sem CFOP" (R$ 23,3 mi) mistura venda perdida e devolucao (RESOLVIDO)

**FECHADO em:** 2026-06-10 (Fase 2.6). `faturamentoPorCfop` ganhou `semCfopPorFinalidade` (fin=1 venda
candidata R$ 11,84mi/275it; fin=4 devolucao R$ 11,46mi/89it) e `outrasNaoEspecificadas` (CFOP 5949/6949,
R$ 11,78mi finalidade=venda). O formatador exibe 2 linhas com **rotulo honesto**: a auditoria provou que o
balde "outras" e majoritariamente NAO-venda por natureza (OUTRA SAIDA/SIMPLES REMESSA), entao o rotulo diz
"substancia a confirmar com o cliente", NAO "venda escondida". Mantido FORA da receita (conservador); a
reclassificacao (se houver) e decisao do cliente. C5 da conferencia loga a decomposicao por ano.

---

### (historico do achado original)
## R-sem-cfop-historico — Linha "sem CFOP" (R$ 23,3 mi) mistura venda perdida e devolucao

**Aberto em:** 2026-06-10 (auditoria da Fase 1). **Prioridade media.**

**Problema:** os 364 itens sem `cfop_id`/`cfop_nome` na origem (R$ 23,3 mi) sao um balde unico. Decomposicao
pelo cabecalho: ~R$ 11,68 mi finalidade=1 (normal, candidato a VENDA REAL perdida na origem do Odoo, ICMS
quase zero) + ~R$ 11,46 mi finalidade=4 (DEVOLUCAO) + R$ 0,16 mi servico. Manter fora da receita esta correto
(conservador), mas o bloco esconde que metade e devolucao. **Correcao:** quebrar `sem_cfop` por `finalidade_nfe`
na exibicao; investigar com o cliente por que ~R$ 11,7 mi de equipamentos sairam sem CFOP (pode ser receita real).

---

## R-conferencia-fiscal-expandir — Base de conferencia deve virar gate permanente (do CI) (RESOLVIDO)

**Aberto em:** 2026-06-10. **Prioridade media.**
**FECHADO em:** 2026-06-10 (Fase 2.6). `scripts/conferencia-fiscal.ts` agora tem 5 invariantes + S0/S3/S4
(gates) + S1/S2 (alertas) + **C1-C6**: C1 orfaos na base de receita (gate ==0); C2 reconciliacao item vs
(cabecalho - notas-sem-item) (gate < 0,01%, fecha ao centavo , a dif de R$ 113k era 100% notas de
transferencia sem item); C3 sentinela de CFOP novo em "outras" (so 5949/6949 hoje); C4a inversao
receita(cfop) x natureza nao-venda (alerta, R$ 906.853 hoje); C5 log sem_cfop por finalidade; C6 notas sem
item (alerta, 101 hoje). Primitivas `checkPct`/`checkBandaValor` adicionadas. CI nao tem DB, entao a
conferencia roda como gate LOCAL pre-merge (decisao mantida).

`scripts/conferencia-fiscal.ts` ja confronta 5 invariantes (TS vs SQL bruto, por ano). As 2 auditorias
recomendaram 12 checagens adicionais para tornar a confianca permanente: orfaos item→nota == 0; reconciliacao
item vs cabecalho < 0,05%; sentinela de CFOP novo caindo em "outras" > R$ 100k/ano; cross-check natureza×ehReceita
(inversoes); guarda do filtro `situacao='autorizada'` (em_digitacao R$ 236 mi jamais entra); sentinela do
fallback de nome (R$ 278,8 mi); divergencia nome×cadastro; decompor sem_cfop por finalidade; notas sem item (101).
Tornar isso um TESTE que roda (o CI nao tem DB, entao avaliar healthcheck agendado ou gate local pre-merge).

---

## ~~R-periodo-acumulado~~ — OBSOLETO (periciado em 2026-07-13; o texto abaixo é histórico)

> **Não existe mais.** A perícia contra o código provou que o item, como está escrito, está
> errado em três pontos: (a) o cache **não tem 13 anos** , a ingestão tem corte técnico em
> `2026-01-01` (`src/worker/sync/corte.ts`); (b) o default das tools fiscais **não é mais "ano
> corrente"** , `resolverPeriodoFiscal` devolve "do início das análises até hoje"; (c) o
> "Grupo C" (`dfe_*`, `notas_recebidas`) **tem** default hoje. Somado a isso, a **data de
> início das análises** (`src/lib/corte-dados.ts`) é um piso global de leitura: nenhuma tool
> consegue varrer o acumulado inteiro. O item pode ser arquivado.
>
> Texto original preservado abaixo apenas como registro.

**Aberto em:** 2026-06-09 (achado pelo usuario ao ver "R$ 897 mi de receita").

**Problema:** o cache cobre **2013-08 a 2026-06 (~13 anos)**. Toda metrica/tool fiscal que roda
**sem periodo** soma o acumulado historico inteiro, produzindo numeros gigantes e enganosos
(ex.: receita externa acumulada R$ 897 mi vs R$ 325 mi so de 2025). O dado esta integro (zero
duplicacao); o problema e de comportamento/apresentacao.

**Corrigido nesta entrega (PR #81):** as 3 tools desta jornada , `fiscal_faturamento_por_cfop`
(F1), `fiscal_receita_consolidada` e `fiscal_intercompany` (F2) , passaram a usar
`resolverPeriodoFiscal` (`mcp/tools/fiscal/_periodo-padrao.ts`): sem periodo informado, assumem
o **ano corrente** e a resposta SEMPRE explicita o periodo. Decisao do usuario 2026-06-09.

**RESOLVIDO (Grupo B) em 2026-06-10 (Fase 2.5):** `resolverPeriodoFiscal` (default ano corrente, periodo
sempre explicito) aplicado em `fiscal_faturamento_periodo`, `_por_cliente`, `_mensal_serie` (repontadas) +
`notas_emitidas`, `impostos_periodo`, `produtos_faturados`, `_nao_autorizado`, `_por_operacao`, `_por_empresa`,
`_recebido`. `fiscal_contar_notas` EXCLUIDO de proposito (e contagem de inventario do cache, sem periodo;
`ouro-fiscal-01` crava 49.427). **Grupo C (`dfe_*`, `notas_recebidas`) NAO usa default ano corrente** , decisao:
ano corrente esconderia DF-e/nota pendente de periodo anterior; mantem ordenacao desc sem corte de ano. O agente
nao precisa mais passar periodo nas tools do Grupo B.

---

## ~~R-base-cfop~~ — ENCERRADO como registro histórico (periciado em 2026-07-13)

> **Nada a corrigir aqui.** A troca de base foi deliberada e está consistente: ninguém mais lê
> `item.vr_nf` (a coluna só é escrita pelo builder). A divergência item x cabeçalho **não é
> erro de rateio**: são **6 notas de saída autorizada sem nenhum item no cache**, que somam
> exatamente os R$ 1.048.807,87 da diferença medida hoje (as outras 140 notas sem item são
> modelo 23, DIFAL/FCP, com valor zero). A própria tool já declara isso na resposta.
>
> **Os percentuais do texto abaixo estão desatualizados** (foram medidos sobre 13 anos de
> histórico; hoje a janela de análise é bem menor, então a mesma divergência absoluta pesa
> mais em percentual). Medição de 2026-07-13, no recorte da tool: Σ item = R$ 253.251.807,87;
> Σ cabeçalho = R$ 254.300.615,74; diferença = R$ 1.048.807,87 (0,41%).
>
> **Mas a investigação achou outra coisa, e séria:** a eliminação intragrupo da mesma tool
> estava quebrada , ver **R-intragrupo** no topo deste arquivo.
>
> Fica registrado, sem ação: as 6 notas sem item são ignoradas por toda métrica de grão de
> item e contadas pelas de grão de nota (o KPI). É a fonte permanente da divergência.

**Aberto em:** 2026-06-09 (Fase 1 do Faturamento Real Consolidado).

**Mudança:** a tool `fiscal_faturamento_por_cfop` deixou de somar `item.vr_nf` (rateado)
e passou a somar `item.vr_produtos`, ganhando classificação por operação fiscal
(categoria gerencial + flag `ehReceita`) via a Tabela de Regras (`src/lib/fiscal/regras/`).

**Impacto numérico (medido no cache real):** o número total da tool muda em
**R$ 28.432,83 / 0,0015%** (delta `Σ item.vrProdutos − Σ item.vrNf` no recorte de saída
autorizada). Ínfimo, mas a tool já roda em produção, então qualquer painel/resposta que
citasse o valor antigo terá essa diferença. A reconciliação produto×nota (item vs
cabeçalho `fato_nota_fiscal.vr_produtos`) fecha em **R$ 113.198,89 / 0,006%**, exposta na
própria resposta da tool.

**Mitigação:** 7 testes de regressão fiscal travam as classificações de risco (6152
transferência, 6202 devolução de compra, 5933/6933 e 5932/6932 serviço, 5922/5117 entrega
futura sem dobrar, 5551 venda de ativo, 5949/6949 outras, 6918 devolução de consignação);
auditoria sobre os 58 CFOPs reais confirmou receita = R$ 1,316 bi (70,8%) e sem-CFOP de
R$ 23,3 mi destacado com alerta. **Não bloqueia**; registrado para rastreabilidade.

---

## R-ajustes — Histórico de ajustes só mostra transição no mais recente (opcional)

**Aberto em:** 2026-06-05 (B2/Backtest, redesign do drill-down).

**Contexto:** o drill-down do Backtest tem um **Histórico de ajustes** (seção
"Ajuste manual"). Hoje o banco guarda, por ajuste, apenas **data + justificativa**
(append `[AJUSTE HUMANO <iso>] <reason>` em `razoes`) e o **status humano atual**
(`humanStatus`). Não há registro do **status ANTES** de cada ajuste. Por isso a
linha mostra a transição "antigo → novo" (tag cinza riscada → tag colorida) só no
ajuste **mais recente** (derivada de `status` do juiz → `humanStatus` efetivo); os
ajustes anteriores mostram só data + justificativa.

**Pedido:** para ter a transição em **todos** os ajustes do histórico, passar a
gravar o status-antes em cada ajuste. Mudança **pequena**: em `adjustEvaluation`
(`src/lib/actions/agent-quality.ts`) gravar o `previousStatus` por ajuste (coluna
nova ou um JSON `adjustment_history[]` em `conversation_quality_evaluations`), e o
drill-down (`evaluation-drilldown.tsx`, `parseRazoes`/Histórico) renderiza a
transição por linha. **Opcional / cosmético.**

---

## R-tempo — KPI de tempo médio das respostas no Backtest (a discutir)

**Aberto em:** 2026-06-04 (feedback do usuário no B2).

**Contexto:** o tempo de geração de cada resposta JÁ é armazenado em
`LlmUsage.durationMs` (por iteração do loop de tool calling, ligado a
`conversation_id`). A bubble viva mostra o wall-clock do turno
(`doneAt − startedAt`) no header "Raciocínio · N tools · X.Xs"; o monitoramento
Bubble (coluna Conversa) passou a mostrar o mesmo, derivado de
`createdAt(assistant final) − createdAt(user)` (proxy fiel do wall-clock).

**Pedido do usuário:** no **Backtest** (aba Monitoramento), o drill-down de cada
linha de avaliação não mostrava o tempo, e não há KPI/gráfico de tempo médio.
1. ~~tempo por avaliação no drill-down da `evaluations-table`~~ **FEITO**
   (commit `1b83b88`: `getEvaluationDetail.durationMs` + `Clock` no cabeçalho);
2. **PENDENTE:** um KPI/gráfico de tempo médio (e talvez p50/p95) no topo do Backtest.

**A decidir:** fonte exata (somar `LlmUsage.durationMs` por turno vs proxy por
`createdAt`), atribuição LlmUsage→mensagem (hoje LlmUsage só tem
`conversation_id`, não `message_id`), e forma de visualização (KPI vs série
temporal). Discutir antes de implementar.

---

## ~~R1 — Fonte de "contas a receber/pagar" pode ser a tabela errada~~ RESOLVIDO

**Aberto desde:** 2026-05-18 (teste end-to-end da F4 onda 1).
**Resolvido em:** 2026-05-18 — commit `fix(f4): re-source fato_financeiro_titulo para finan.lancamento`.

### Diagnóstico confirmado

`fato_financeiro_titulo` era derivado de `raw_finan_pagamento_divida` (eventos
de pagamento — ~21 registros abertos, `vr_saldo` ≈ 0 nos abertos). A fonte
correta é **`raw_finan_lancamento`** (`finan.lancamento` — carteira de títulos):
- `tipo='a_receber' situacao_divida_simples='aberto'`: 120 títulos, R$ 1.164.266,36
- `tipo='a_pagar'  situacao_divida_simples='aberto'`:  18 títulos, R$    95.694,95
- Para título aberto: `vr_saldo == vr_documento == vr_total`.

### Correção aplicada

- **Builder** (`src/worker/fatos/fato-financeiro-titulo.ts`): fonte trocada para
  `rawFinanLancamento`, filtro `tipo IN ('a_receber','a_pagar')`, tipo mapeado
  direto (não derivado de `sinal`), `vrSaldo` agora é o valor correto.
- **Queries** (`src/lib/reports/queries/financeiro.ts`): `vrSaldo` re-adicionado
  ao output; `totalAReceber`/`totalAPagar`/`totalVencido` usam `vrSaldo`.
- **Handlers MCP** (3 tools de título): `tituloSchema` inclui `vrSaldo`; shape
  serializa `vrSaldo`.
- **Testes** (builder + queries + handlers): fixtures atualizados para o formato
  real de `finan.lancamento`; novos casos cobrem filtro de caixa descartado.

---

## R2 — Verificação por dado real, não só review de código

**Aberto desde:** 2026-05-18.

Os 2 bugs de financeiro da F4 onda 1 (critério "em aberto" errado; valor
somando `vr_saldo` ~zero) **passaram por 12 reviews adversariais** e só foram
pegos rodando o MCP contra o cache real. Lição: review de código não cobre
premissas sobre o dado.

### Ação

Toda onda de domínio novo (comercial, fiscal, contábil, produção) deve incluir,
na etapa de verificação, um **teste end-to-end contra o cache real** — popular
os fatos, subir o servidor, exercer as tools e conferir os números — não só
`tsc`/`eslint`/`jest`/code-review.

---

## R3 — Contábil e Produção quase não têm dado no cache

**Aberto desde:** 2026-05-18 (levantamento dos domínios restantes da F4).

Levantamento das tabelas `raw` por domínio que falta cobrir no MCP:

| Domínio | Tabelas `raw` | Volume |
|---|---|---|
| **Comercial** (pedidos) | `pedido_documento` (71), `pedido_parcela` (1.925), `pedido_etapa` (203), `pedido_documento_historico` (8.054), `pedido_operacao` (36) | substancial — domínio real |
| **Fiscal** (SPED) | `sped_documento` (3.743 notas), `sped_documento_item` (211.385), `sped_documento_pagamento` (36.141), `sped_participante` (6.516)… (40 tabelas) | substancial — domínio real |
| **Contábil** | `contabil_conta` (934), `contabil_conta_referencial` (2.204) | **só o plano de contas** — não há tabela de lançamentos contábeis no cache |
| **Produção** | `producao_processo` (1) | **1 único registro** — praticamente inexistente |

### Implicação — confirmado pelo censo F0 (não é gap de sync)

Verifiquei o censo completo do Odoo (`discovery/output/censo.md`): o dado
contábil/produção **não existe na instância Odoo**, não é só não-sincronizado.

- **Contábil:** `contabil.lancamento` (Lançamento Contábil) = **0 registros**;
  `contabil.demonstracao`, `contabil.encerramento`, `contabil.operacao` = 0.
  Só o **plano de contas** tem dado (`contabil.conta` 934, `…referencial`
  2.204, `…arvore` 4.955). A Matrix **não opera o módulo de contabilidade** no
  Odoo.
- **Produção:** `producao.processo` = 1; todos os demais modelos `producao.*`
  = 0. A empresa **movimenta/entrega** equipamento de academia — não fabrica.

### Decisão de escopo

"MCP 100% de todos os domínios" se traduz, na realidade do dado, em:
- **Comercial** (pedidos) e **Fiscal** (notas SPED) — domínios reais, dado rico
  → tools semânticas completas.
- **Contábil** — apenas tool(s) de *estrutura do plano de contas* (referência),
  pois não há movimento. Ou omitir até o cliente operar contabilidade no Odoo.
- **Produção** — sem dado; nada a expor. Omitir.
- O **Caminho 3c (modo BI)** cobre a cauda longa: qualquer pergunta fora das
  tools, inclusive sobre o que houver de contábil/produção, cai no SQL
  controlado.

Pendente: aval do usuário sobre cobrir contábil (plano de contas) e omitir
produção, ou aguardar dado.

---

## ~~R4 — GRANTs SQL fora do `prisma migrate`~~ RESOLVIDO

**Aberto desde:** 2026-05-18 (code review final F4 completo — IMP-2).
**Resolvido em:** 2026-05-18.

### Solução aplicada

Os 2 scripts avulsos foram **consolidados** num único script idempotente
`prisma/sql/provision-mcp.sql` e o deploy virou **um comando**:

```bash
npm run db:deploy   # = prisma migrate deploy && npm run db:provision
```

- **Idempotente** — seguro rodar a cada deploy.
- **A prova de esquecimento** — o `GRANT SELECT` nos fatos e dinamico (loop
  sobre `fato_*`); um fato novo e coberto automaticamente, sem editar o script.
- Senhas via variavel de ambiente (`MCP_DB_PASSWORD`/`MCP_BI_DB_PASSWORD`),
  nunca no arquivo.

Runbook: `docs/runbooks/deploy-mcp-db.md`. O deploy assistido [12] usa
`npm run db:deploy` como passo de banco.

---

## R5 — Achados BAIXO do review adversarial F5 (2026-05-19)

**Aberto desde:** 2026-05-19 (reviews adversariais das ondas 1-7).

### R5-A — `logAudit` sem `await` em `user-whatsapp.ts` (review 1-2-7, BAIXO-1)
`addWhatsappNumber`/`removeWhatsappNumber` chamam `logAudit({...})` sem `await`.
Em Server Action serverless, a promise pode não completar → risco de auditoria perdida.
**Ação:** adicionar `await logAudit(...)` nas duas actions.

### R5-B — `deleteCredential` sem `findUnique` antes do delete (review 1-2-7, BAIXO-2)
`prisma.llmCredential.delete` lança erro `P2025` cru quando `id` não existir.
**Ação:** capturar `P2025` e retornar erro de domínio claro.

### R5-C — `ChatUsage` agregado perde `costKnown` (review 1-2-7, BAIXO-3)
`totalUsage.costUsd` soma 0 para iterações sem pricing — total pode ser subestimado
sem sinalização. A tela de consumo lê de `LlmUsage` (correto), mas o retorno de
`runAgent` é impreciso para quem o consumir diretamente.
**Ação:** adicionar `costKnown`/`costPartial` ao `ChatUsage` agregado.

### R5-D — Rota SSE sem heartbeat (review 3-5, BAIXO-1)
Loop de tool calling longo pode passar 30-60s sem byte SSE → proxies podem fechar.
**Ação:** adicionar comentário SSE de keep-alive (`: ping\n\n`) periódico no `route.ts`.

### R5-E — `ApiKey.createdById` sem FK para `User` (review 4-6, BAIXO-3)
`createdById` é `String?` solto sem `@relation`. Verificar `revokedAt` ao consumir
chaves na F6.
**Ação:** adicionar `@relation` no schema na F6 antes de consumir API keys.

### R5-F — Idempotência do inbound: `processedCreate` pode duplicar em race extremo (review 4-6, M4 — parcialmente corrigido)
A ordem foi corrigida (enfileira antes de gravar), mas em race extremo de dois
requests simultâneos do mesmo `messageId` pode processar 2×. O dedup no job
mitiga o impacto, mas é tolerado conscientemente.

### R5-G — Streaming do Anthropic com tools: stop_reason é ignorado (review 1-2-7, ALTO-2 — mitigado)
O streaming foi habilitado mesmo com tools. O `#parseStream` acumula tokens e
tool_use blocks. No entanto, tokens emitidos durante um turno com tool_use também
chegam ao `onToken` callback — o `ChatPanel` os exibirá na bolha de streaming e
depois sobrescreve com o `message` do evento `done`. Comportamento visual pode
causar piscar no chat em turnos intermediários. Tolerado para a fase atual;
resolver refinando o streaming para só emitir tokens quando `stop_reason !== tool_use`.

### R6 — Build quebra no prerender de `/_not-found` e `/_global-error` (PRÉ-EXISTENTE, ALTO)
`next build` falha no prerender das páginas internas do Next (`_not-found`,
`_global-error`) com `TypeError: Cannot read properties of null (reading 'useContext')`.
**Confirmado pré-existente:** reproduzido em `git stash` total (código 100% HEAD,
sem nenhuma mudança do rework F5-UI v2) — o build da branch `feat/integracao-whatsapp`
já estava quebrado. O bug é mascarado por um segundo: `/integracoes/bi` quebra
antes no prerender estático (corrigido com `export const dynamic = "force-dynamic"`),
e só então `_global-error`/`_not-found` aparecem.
**Causa provável:** o root `app/layout.tsx` usa `cookies()` (`getResolvedThemeFromCookie`),
o que conflita com o prerender estático das páginas de erro internas no Next 16
Turbopack. `tsc`, `eslint` e `jest` passam — só o `next build` quebra.
**Ação:** investigação dedicada — tornar o root layout compatível com prerender
estático das páginas de erro (ex.: mover a leitura de cookie para um boundary
dinâmico, ou adicionar `export const dynamic` ao `not-found.tsx`/`global-error.tsx`
próprios). Fora do escopo do rework de UI da F5.

---

## R7 — `eslint .` acusa `no-explicit-any` em test files do MCP (PRÉ-EXISTENTE, BAIXO)

**Aberto desde:** 2026-05-21 (verificação da F4 Onda 2 rodada 3 de correções).

`npm run lint` (`eslint .`) reporta 83 erros `@typescript-eslint/no-explicit-any`,
todos em arquivos de **teste** do servidor MCP (`mcp/__tests__/e2e/*`,
`mcp/auth/__tests__/*`, `mcp/middleware/idempotency.ts`, `migrate-scopes.ts`) e
em `src/lib/actions/mcp-api-keys.test.ts` / `src/worker/odoo/__tests__/`. Foram
introduzidos pela F4 Onda 2 (Bloco P, commit `736cd0d` e arredores), não pela
rodada 3 de correções de UI — nenhum arquivo tocado na r3 tem erro de lint.

**Implicação:** não bloqueia (`tsc`/`jest`/`build` verdes; produção não usa
`any` de teste), mas deixa `npm run lint` vermelho no repo inteiro.

**Ação:** numa varredura dedicada, tipar os mocks dos testes do MCP ou aplicar
`eslint-disable` justificado por bloco. Fora do escopo da r3 (correções de UI
do painel Servidor MCP).

---

## R8 — Dois modelos da F2 não sincronizam (achado da bateria L2, MÉDIO)

**Aberto desde:** 2026-05-22 (bateria L2 de validação de leitura).

A conferência de fidelidade da L2 (count `raw_*` vs `search_count` do Odoo)
flagrou dois modelos do catálogo F2 com `sync_state.last_status = 'erro'`:

- **`pedido.documento.historico.tempo`** (raw 0, Odoo 8.658). Erro do Odoo:
  `coluna pedido_documento_historico_tempo.id não existe`. É um modelo Odoo
  sem coluna `id` (view/agregado); o sync, que faz `search_read` selecionando
  `id`, não consegue lê-lo. **É não-sincronizável pelo mecanismo atual.**
  Ação: removê-lo do `MODEL_CATALOG` (e ajustar `model-catalog.test.ts`), ou
  dar ao sync um caminho para modelos sem `id`.
- **`sped.produto.lote.serie`** (raw 5.000, Odoo 7.534). `last_error` vazio
  após 3 tentativas — provável timeout ou erro não serializado numa página
  específica. O raw tem 5.000 de um sync parcial anterior. Ação: re-rodar o
  sync só desse modelo com log verboso para capturar o erro real.

**Implicação:** nenhuma tool da F4 depende desses dois modelos — as 55/56
conferências de tool da L2 passaram. É dívida de robustez do sync da F2, não
um gap da F4 leitura. Cada ciclo de sync gasta 3 tentativas falhas em cada um.

**Ação:** sessão de debug dedicada ao sync da F2. Fora do escopo da F4 L2.

### R8-B — Gap pequeno de backfill em 4 modelos (BAIXO)

A mesma conferência de fidelidade da L2 achou 4 modelos com `last_status` ok
mas `raw` ligeiramente abaixo do Odoo, persistente entre corridas:
`estoque.saldo` (−92), `finan.fluxo.caixa` (−147), `finan.banco.extrato` (−20),
`finan.banco.saldo` (−4) — todos ~1%. São modelos `incremental`: o ciclo
incremental só puxa por `write_date` e nunca remove/repuxa linhas antigas
perdidas no backfill. O ciclo de **reconcile** (24h) fecharia o gap; o
`f4l-ingest.ts` roda só snapshot+incremental, sem reconcile. Não é bug de
tool. Ação: rodar um reconcile, ou aceitar o gap de ~1% como ruído de janela.

---

## ~~R9 — Router de catálogo (R1): calibração e meta de ativação~~ RESOLVIDO

**Resolvido em 2026-05-28 23:10:** modelo large@0.30 + tuning de vocabulário
(forceIncludeOn) levaram a **cobertura Top-K a 98-99%** (meta 95% batida);
gate de ativação agora incide sobre Top-K (allInTopKPct), não Top-1.
Telemetria de embedding no menu de consumo + precisão de custo corrigida.
Multidomínio validado. Histórico abaixo.

---

### R9 (original) — threshold default 0.55 mal calibrado

**Aberto desde:** 2026-05-28 (calibragem offline da Wave G, executada de
verdade pela primeira vez contra as 291 perguntas R8-R23).

A calibragem (`scripts/router/calibrate-against-batteries.ts`,
`runCalibration`) revelou que o **threshold default 0.55** faz o router cair em
**fallback em 84% das perguntas** (245/291) e acertar só **16,2% de Top-1**. Não
é bug de scoring: a distribuição de cosseno do `text-embedding-3` entre pergunta
e descrição de domínio fica majoritariamente abaixo de 0.55. Sweep completo
(topK=3, dataset 291, 216 mapeáveis):

| threshold | Top-1 | Top-K | Fallbacks |
|---|---:|---:|---:|
| 0.35 | **63,9%** | **75,9%** | 52 |
| 0.40 | 59,3% | 67,6% | 86 |
| 0.45 | 42,1% | 48,1% | 147 |
| 0.50 | 25,5% | 27,3% | 209 |
| 0.55 (default atual) | 16,2% | 16,7% | 245 |

### Atualização 2026-05-28 22:35 (threshold + modelo resolvidos; gap restante)

Duas correções aplicadas (commits `8501e6e`, `ebdd066`):
1. **Threshold default 0.55 -> 0.30** (schema + run-agent + linha `global`).
2. **Modelo small -> large** (`text-embedding-3-large`/3072) só no router (o
   `embed()` default segue small/1536 porque o RAG da F5 tem pgvector(1536)).
   A/B comprovou o ganho:

| modelo @ threshold | Top-1 | Top-K | Fallbacks |
|---|---:|---:|---:|
| small @ 0.35 | 63,9% | 75,9% | 52 |
| large @ 0.20 | 78,2% | 93,5% | 9 |
| **large @ 0.30 (produção)** | **77,3%** | **92,1%** | 15 |

Meta de ativação também elevada de 85% para **95%** por decisão do usuário
(`constants.ts ROUTER_PROMOTION_MIN_TOP1`).

**Gap restante para fechar o R9:** Top-1 plateou em ~78% com large (teto do
vocabulário atual, não do threshold). Para chegar a 95% de Top-1 é preciso
enriquecer `domain-vocabulary.ts`. **Questão de metrica em aberto (decisão do
usuário):** o router entrega top-K domínios ao LLM, então o Top-K (~92%, perto
de 95%) é o que de fato determina se o LLM recebe a ferramenta certa; o Top-1
é mais rígido do que o necessário. Definir se o gate de 95% incide sobre Top-1
(exige tuning pesado de vocabulário, talvez inalcançável) ou Top-K (quase lá).

**Implicação:** nenhuma de produção, **o router segue em shadow** e o gate
bloqueia a ativação enquanto não bater a meta.

---

## F3 R1 , chosenToolRank inflado pelo piso (pre-condicao para ativar retrieval)

**Quando:** 2026-06-07 (code review F3).
**Onde:** `src/lib/agent/run-agent.ts` (chosenToolRank via rankOf sobre retrievalOfferedTools) + `pick-tools.ts`.

`retrievalOfferedTools` inclui o nucleo minimo inteiro (dominios picked +
transversais + _desconhecido), que costuma ser a maior parte do catalogo. Logo
`chosenToolRank != null` quase sempre, e o gate de go-live "% no top-K >= 98%"
(spec 4.5) pode passar trivialmente sem provar que o top-K (a parte que enxuga)
acerta. Os dados crus para uma metrica melhor JA estao persistidos em
`AgentRouterDecision.retrievalScores` (cosseno por tool) + `retrievalOfferedTools`.

**Acao antes de ligar `routerToolRetrieval=active`:** computar o gate sobre o
rank restrito as candidatas top-K (excluindo floorAdded) ou rankear por
retrievalScores; nao confiar no chosenToolRank cru. Implicacao de producao:
nenhuma (retrieval segue em shadow; default nao corta catalogo).

## F3 R2 , V6 (total x linhas) e shadow-only ate o envelope canonico (F4)

**Quando:** 2026-06-07. **Onde:** `src/lib/agent/validation/auto-validator.ts` validateV6.

V6 ja pula listas truncadas (`_amostraReduzida`/`_listaTruncada`) para nao dar
falso positivo. Mas a verificacao plena de coerencia (totais, datas no periodo)
depende do envelope canonico unico, que e da F4. Manter V6/V7 em shadow ate la;
so promover a active (Falta Honesta direta) quando o envelope padronizar
total/linhas/periodo. Implicacao de producao: nenhuma (V6/V7 so logam).

---

## F6 , Pendências pós-merge (telemetria entregue; ativação/medição-fiel no full-stack)

**Quando:** 2026-06-08. **Status:** F6 MERGED (PR #65). Produção **inalterada**
(`routerEnabled=false`, `routerToolRetrieval=shadow`; as novas chamadas `logUsage`
só completam a telemetria de custo). Nada bloqueia; são passos de medição/ativação
que dependem do ambiente full-stack e de decisão do usuário.

### F6-A , Custo-fiel + Gate C precisam do ambiente full-stack
`runAgent` E2E via `tsx` no host **não carrega tools**: o container MCP (`:3100`)
fecha a sessão streamable-HTTP autenticada vinda do host (`other side closed`;
reproduzível com `curl`+token = problema de infra, fora do escopo F6). Logo
`cost-regression.e2e` sai `faithful=false` e `golden-under-active.e2e` sai
`INCONCLUSIVO` (exit 2) , **nunca mascaram**. **Ação:** rodar ambos no ambiente
full-stack (app/docker, onde a sessão MCP funciona) e capturar o baseline
`src/lib/agent/evals/golden/cost-scorecard.json`. Gates A (recall@K=100%) + B
(golden-nex VERDE) já cobrem o critério de promoção; Gate C é confirmação E2E.

### ~~F6-B , Promover `routerToolRetrieval=active`~~ ATIVADO 2026-06-08
`routerEnabled=true` + `routerToolRetrieval=active` aplicados em `agent_settings`,
sob gate triplo verde: recall@K=100% + golden-nex VERDE + golden-under-active com
critério **no-regressão** (active nunca perde tool que o catálogo cheio usaria), 10/10
pares. Reversível: `UPDATE agent_settings SET router_tool_retrieval='shadow'`.
Gotcha de acesso MCP em dev resolvido (sessão do host falhava por `MCP_DB_PASSWORD`
vazio no container , recriar o `mcp` da raiz principal com `.env`): ver
`docs/RUNBOOK-retrieval-ativacao.md`. Opcional: medir o ganho real de custo
(cost-scorecard faithful shadow×active) no full-stack; coordenar com `feat/router-ativacao-r2`.

---

## R10 , dim_empresa_grupo com odooId DESLOCADO vs empresaId das notas (MÉDIO-ALTO)

**Quando:** 2026-06-09 (perícia a pedido do usuário). **Onde:** `dim_empresa_grupo`
(builder no worker) vs `fato_nota_fiscal.empresaId`.

**Achado:** o `odooId` do `dim_empresa_grupo` NÃO casa com o `empresaId` gravado nas
notas. Confronto fato.empresaNome (nome na própria nota) × dim.nome: só `id=1` bate;
de `id>=4` quase todas DIVERGEM (a dim aponta para a empresa errada, deslocada).
Ex.: nota `empresaId=4` = "Jds Comércio - Matriz 18.282.961/0001-00", mas dim
`odooId=4` = "Jht DF Comércio 10.557.556/0001-37". E `empresaId=2` e `3` (Jht DF
Matriz e Filial SE, ativos, com notas até hoje) NEM EXISTEM no `res.company`
sincronizado (RawResCompany tem 1,4,5,...,21,27 , sem 2,3). dim_empresa_grupo
tem 18 cadastros; o fato tem 15 empresaIds distintos , id-spaces diferentes.

**Impacto:** qualquer resolução de nome/UF/tipo via `fato.empresaId → dim.odooId`
rotula a empresa ERRADA (os VALORES por id estão certos; o NOME vinha trocado).
Era a causa da "empresa duplicada" que o usuário viu (uma linha era a empresa real
sem dim, outra era outra empresa mal-rotulada com o mesmo nome).

**Mitigação aplicada (2026-06-09):** `faturamentoPorEmpresa` passou a usar o
`empresaNome` DENORMALIZADO da nota (autoritativo), sem a dim. Corrige o rótulo
imediatamente.

**Pendência (worker, fazer direito):** reconstruir `dim_empresa_grupo` no id-space
correto (o `empresaId` das notas parece ser company_id de SPED/contábil, não
`res.company.id`; investigar RawSpedEmpresa) e cobrir os ids 2/3 ausentes. Enquanto
não fizer, NENHUM resolvedor deve confiar em `dim.odooId == fato.empresaId`.
Além disso há cadastro malformado/duplicado na própria dim: `odooId=21`
("Jht SP Comércio - Filial MG 34.161.829/0005-11 34.161.829/00", CNPJ repetido)
duplica o `odooId=12`.

### R10 , atualização 2026-06-09 (perícia completa: origem + impacto + fix recomendado)

**Origem exata:** `dim_empresa_grupo` é populada por **seed ESTÁTICO** na migration
`prisma/migrations/20260528020000_dim_empresa_grupo/migration.sql` (`INSERT ... VALUES`),
com `odoo_id` = ids do **res.company** (1,4,5,6,...). Mas o `empresaId` gravado em
`fato_nota_fiscal` é de OUTRO id-space (denso: 1,2,3,4,...; ex.: Jht DF Matriz =
empresaId **2** na nota, mas res.company **4**). Os dois nunca casam de id 4 em diante.

**Impacto (3 consumidores) , TODOS CORRIGIDOS (2026-06-09):**
1. `faturamento_por_empresa` (nome) , **CORRIGIDO** (usa `fato.empresaNome`).
2. `resolverEmpresa` (`src/lib/metrics/_shared/empresa.ts`) , **CORRIGIDO**: derivado do
   FATO. Devolve `odooId = fato.empresaId` (mesmo id-space das notas); nome casa
   insensível a acento. Filtro por empresa agora acerta a empresa.
3. `filiais-listar` (`mcp/tools/cadastros/filiais-listar.ts`) , **CORRIGIDO**: lista
   `distinct` do fato com `odooId = empresaId`, tipo/UF/CNPJ parseados do nome da nota.

**Fix aplicado (2026-06-09):** `dim_empresa_grupo` deixou de ser fonte. Helpers novos
em `_shared/empresa.ts`: `parseEmpresaNome` (parseia "{Nome} - {Matriz|Filial} {UF} {CNPJ}")
e `listarEmpresasDoFato` (`SELECT DISTINCT empresaId, empresaNome FROM fato_nota_fiscal`).
`resolverEmpresa` e `filiais-listar` reusam esses helpers. Verificado: tsc raiz+mcp + jest
(2761) verdes + E2E contra cache real (`scripts/e2e-empresa-r10.ts`): 'Jds Comercio - Matriz'
→ empresaId=4 → nota "Jds Comércio - Matriz DF" (empresa CERTA), CNPJ exato resolve certo,
'Jht DF' → ids {2,3} reais. **Pendência remanescente (worker, opcional):** reconstruir ou
descontinuar a `dim_empresa_grupo`; nenhum consumidor depende mais dela.

---

## R11 , bubble do Nex ressuscitava conversa antiga (ghost) ao recarregar , CORRIGIDO (2026-06-09)

**Quando:** 2026-06-09 (relatado pelo usuário). **Onde:** `getActiveConversationId`
(`src/lib/actions/active-conversation.ts`), consumido pelo boot da bubble em
`(protected)/layout.tsx`.

**Sintoma:** ao recarregar a página, a bubble restaurava uma conversa de **dias
atrás** (ex.: 28/05) que o usuário não esperava ver.

**Raiz:** a query buscava a conversa in_app mais recente **filtrando `ended_at IS
NULL`**. O usuário tinha ~100 conversas in_app antigas com `ended_at = NULL`
(órfãs , criadas antes do restore-on-boot existir, nunca limpas). Ao arquivar
("Limpar sessão") as sessões recentes, a query "descia" e ressuscitava a órfã
ativa mais nova. Não é janela de tempo: o modelo correto é "a sessão dura até o
usuário limpar", mas **uma conversa mais nova (mesmo já arquivada) deve superar as
órfãs antigas**.

**Correção (PR #78):**
1. `getActiveConversationId` pega a **última** conversa in_app do canal (sem filtrar
   `ended_at`) e só restaura se ela ainda estiver **aberta**.
2. `handleClearSession` passa a checar o retorno de `archiveActiveConversation`: se
   o arquivamento falhar, não limpa a UI (senão a conversa voltaria no reload) e
   avisa por toast.
3. Migration `20260609220000_archive_orphan_inapp_conversations`: arquiva (não
   deleta) as órfãs in_app, deixando no máximo **uma ativa por usuário**.

**Verificado (dado real):** usuário do bug 102 órfãs ativas → 0; mais recente vira
a sessão de hoje (arquivada) → boot resolve para welcome. Outro usuário com sessão
genuína manteve 1 ativa. tsc verde + jest (46 dos arquivos afetados).

---

## R-conexao-whatsapp , achados da sessao 2026-07-09 (WhatsApp / webhooks / agente)

Perícia feita antes de implementar a "Conexão com WhatsApp". Tudo abaixo foi
**medido no código ou no banco**, não suposto. O que já foi corrigido está
marcado; o resto é dívida aberta.

### CORRIGIDO e em producao

1. **Menus: a UI escondia, o servidor liberava** (PR #158). `nav.ts` filtrava por
   `visibleTo`/`superAdminOnly` e os layouts usavam `requireMinRole` fixo, então
   a tela de Configuração conseguia RESTRINGIR um menu mas nunca LIBERAR.
   `menu_access` virou a autoridade única. Trava: `menu-catalog-autoridade.test.ts`.
2. **Bolha do Nex: gate só na interface** (PR #160). `bubbleAccessLevel` era lido
   apenas no layout (escondia o botão). Nenhuma rota de API o checava: um admin
   conversava com o agente chamando `POST /api/agent/stream` direto. Gate movido
   para o servidor.
3. **Webhook de entrada inalcançável de fora** (PR #161). A tela ensinava
   `/api/webhooks/<slug>`, que não existia; a rota real (`/api/hooks/<slug>`) não
   estava na lista pública e o middleware devolvia 302 para `/login`. Nenhuma
   mensagem chegaria. Rota canônica passou a ser `/api/webhooks/<slug>`.
4. **Banco de dev com sujeira silenciosa** (PR #159). 11 migrations com checksum
   divergente, 4 tentativas falhas, 1 linha `manual-applied` e drift real. Nada
   quebrava, mas `prisma migrate dev` exigiria RESET (perderia o cache do Odoo).
   Saneado sem perder registro. Criado `scripts/db-health.py`.

### CORRIGIDO NA BRANCH `feat/conexao-whatsapp` (2026-07-09, aguardando merge)

5. ✅ **VAZAMENTO ENTRE CLIENTES (segurança).** `loadOutboundTargets(connectionId)`
   agora exige e filtra por conexão (fail-closed: sem `connectionId`, ninguém
   recebe); `fireBlocked` escopado à conexão que recebeu a mensagem. Prova:
   `src/lib/whatsapp/isolamento.test.ts` (3/3 verdes).
6. ✅ **Modo de resposta por conexão.** `responseMode` na linha de recebimento,
   `modoEfetivo(conexão → singleton → direct)`. O assistente grava
   `n8n_webhook` ao concluir o Envio; a EDIÇÃO também grava ao configurar um
   destino (era o bug A13 reaparecendo no cliente real do backfill).
7. ✅ **`daily_limit_exceeded` agora é emitido** com mensagem própria, e a entrega
   do bloqueio respeita o modo (`direct` sai pelo cloud-client; nenhum caminho →
   log de aviso, nunca silêncio).
8. ✅ **`model` e `connectionName` no payload** (`RunAgentResult.model` = modelo
   efetivo pós retry/tier; `connectionName` viaja pela fila).
9. ✅ **Envelope aninhado da SPEC §3.10** montado dentro de `emitAgentReply`
   (o `AgentReplyData` continua plano por causa do replay no Redis).
10. ✅ **Dedup por `message.inboundMessageId`** documentado no runbook e no guia
    da UI ("O que enviamos"); `deliveryId` declarado inadequado no próprio payload.
11. ✅ **Trava de número único (§3.4.1)**, nos dois sentidos, comparação
    normalizada; `WhatsappChannel.phone_number` resolvido na Graph API
    (fail-closed). Substitui a ideia antiga de "bloquear direct na 2ª conexão".
12. ✅ **Rota fixa legada responde 410 Gone** (pública, testável); cobertura de
    `handleWhatsappInbound` portada para `slug-inbound.test.ts` antes.
13. ✅ **Gate reforçado:** linhas de Conexão (`connection_id` preenchido) são
    exclusivas do super_admin mesmo quando não são receptoras (a linha de ENVIO
    aparecia como webhook genérico editável para admin comum).

### DIVIDA (estado em 2026-07-10, branch chore/dividas-whatsapp-radar)

- ✅ ~~`technical_error` cobre também mídia não suportada~~ → `media_unsupported`
  criado (catálogo + processor), 2026-07-10.
- ✅ ~~`WhatsappInstance` sem uso vivo~~ → removido (modelo, tabela com 0 linhas
  em dev/prod, telas e actions), 2026-07-10.
- ✅ ~~Fuso do teto diário (meia-noite do servidor = 21h BR)~~ → corte agora é a
  meia-noite de America/Sao_Paulo (`inicioDoDiaEmSaoPaulo`), 2026-07-10.
- Jobs em voo / payloads no Redis gravados antes do deploy não terão
  `connectionName` nem `model` (saem `null`; janela transitória, se resolve
  sozinha em 24h de TTL do replay).
- Formatação de tabela (SPEC §3.12): a regra assume que a primeira coluna é
  texto. Se for um código numérico, o título da linha sai como número nu
  (mudar exige decisão de spec do usuário).
- Aviso de hidratação do React aparece em `/dashboard` e `/integracoes`
  (preexistente; frente própria de investigação de UI, fora deste escopo).

### ARMADILHAS que custaram tempo (não repetir)

- **Teste vermelho pelo motivo errado.** O `isolamento.test.ts` falhou primeiro
  porque `queue.add` não devolvia `job.id` e `emitAgentReply` não devolvia
  promessa. Vermelho por erro de setup **não prova bug nenhum**. Sempre conferir a
  mensagem da falha, não só a cor.
- **Mock que ignora o `where`.** Se `findMany` devolve `[A,B]` fixo, o teste de
  isolamento continua vermelho depois da correção e não tem poder de detecção.
- **Editar migration já aplicada.** `migrate deploy` ignora o checksum (produção
  passa liso), mas `migrate dev` exige RESET do banco. Ver `docs/runbooks/db-migrations.md`.
- **O `worker` não tem build próprio.** `docker compose build worker` é no-op.
  Use `docker compose build app` + `up -d --force-recreate worker`, senão os E2E
  rodam contra imagem velha e dão **falso verde**.
- **Runbook mentindo.** O runbook do n8n dizia que a entrada usa HMAC; o código
  exige `Authorization: Bearer`, e os campos são `snake_case`. Corrigido, mas a
  lição fica: conferir o código antes de seguir a documentação.

---

## R-corte , data de início das análises (revisão completa das regras de consulta, 2026-07-12)

### Decisões de produto pendentes (os agentes pararam e relataram, não decidiram sozinhos)

- **"Dias parado" (`fato_produto_parado`, relatório R4)**: é estado derivado do histórico de
  movimento, calculado pelo worker sob o corte TÉCNICO de ingestão, não sob a data de análise.
  Mover a data de início NÃO muda esse número. Ficou sem filtro, com comentário. Se o dono quiser
  que o indicador acompanhe a janela, a mudança é no builder do fato (worker), não na leitura.
- **DRE (`queryResultadoPorConta`)**: `dataDocumento` é nullable. Com o piso obrigatório, item de
  lançamento SEM data deixa de entrar na DRE (antes entrava quando não havia período). É a leitura
  literal da regra (não dá para provar que é pós-corte), mas muda o total se existir lançamento sem
  data no cache. Conferir: `SELECT count(*) FROM fato_financeiro_lancamento_item WHERE data_documento IS NULL`.
- **`estoque_comparativo` (tool)**: com o piso no `data_ref` do snapshot, se todas as fotos forem
  anteriores ao corte a tool cai na reconstrução por movimento (com aviso honesto) em vez de servir
  foto pré-corte. Coerente com a regra, mas é mudança de comportamento da tool.
- **Documento SEM data cai fora da janela** (pedido sem `dataOrcamento`, OC sem data, DF-e sem
  emissão): com o piso `gte`, essas linhas somem das telas. É a leitura literal da regra.
- **`fiscal_faturamento_recebido`**: "recebido no período" passou a significar "quanto já foi pago
  dos lançamentos EMITIDOS no período" (o cache não guarda data da BAIXA no item). Se o dono quiser
  "recebido = pago no período", precisa de data de baixa no fato (campo novo na ingestão).
- **Prompt do agente salvo no banco**: se `AgentSettings.usesCodeDefaults = false` (o dono editou o
  prompt pela tela), o `identityBase` do BANCO sobrescreve o do código, e a correção do texto ("2026
  em diante" cravado) não chega ao Nex. Conferir em produção.

### ARMADILHAS desta frente (não repetir)

- **"Constante fixa" que não era fixa.** O PR #168 trocou `corteAtual()` por `CORTE_DADOS_ISO`
  achando que estava fixando a ingestão, mas essa constante era o próprio `corteAtual()` avaliado
  NO IMPORT, ou seja, o padrão da tela. A ingestão continuou amarrada à data de análise e o cache
  nunca repunha janeiro a março. Constante técnica é LITERAL, e o arquivo não importa a fonte que
  ele quer evitar.
- **Cache em memória por PROCESSO.** `corteAtual()` é síncrono e lê um cache que só é preenchido
  por `getCorteDados(prisma)`. O MCP é outro processo: nunca chamava, então TODAS as tools do Nex
  usavam a data padrão e a configuração da tela não valia nada para o agente. Toda função síncrona
  que depende de config de banco precisa de um ponto de hidratação declarado no boundary.
- **Escrita fora de transação = tela zerada.** `updateMany({ data: { isVendaExterna: false } })`
  seguido de remarcação, sem transação, deixava o faturamento em ZERO por segundos a cada ciclo.
  `TRUNCATE` solto é pior (commita sozinho). Rebuild de fato é DELETE + INSERT dentro de UMA
  transação: em READ COMMITTED, a leitura vê o estado antigo até o commit.
- **Freshness da INGESTÃO não é freshness do DADO.** `sync_state.last_incremental_at` avança quando
  o raw chega, antes de os fatos serem reconstruídos. A tela se atualizava no meio da obra. O sinal
  certo é o marcador de FIM DE CICLO (gravado depois de todos os builders).
- **Purge não volta sozinho.** O incremental filtra por `write_date > marca d'água`; registro antigo
  não "mudou", então ele nunca é repuxado. Para repor histórico apagado, zerar
  `sync_state.last_incremental_at` do modelo (o backfill respeita o corte técnico de ingestão).
- **Docker: rebuildar o `app` para atualizar o `worker`.** Rodei o E2E com a imagem velha e o
  worker reescreveu as colunas novas com os defaults. Ver a regra de raiz no CLAUDE.md.
- **`docker compose` na worktree não enxerga o `.env` da pasta principal.** O worker subiu sem as
  credenciais do Odoo. Passar `--env-file <pasta-principal>/.env`.

---

## R-mapa-uf , "Sem UF" no mapa da Diretoria (investigado 2026-07-12, a pedido do dono)

O mapa por estado usa a **UF do CADASTRO DO CLIENTE** (`fato_parceiro.uf`), não a UF da nota.
A nota fiscal sempre tem destinatário, mas o CADASTRO do parceiro no Odoo pode estar sem estado
preenchido , e é isso que cai no balde "Sem UF" (a query normaliza para `??`).

Em produção, julho/2026: R$ 450 mil em 8 notas, por duas causas:
- **5 notas (R$ 423.818)**: o cadastro do cliente está sem UF no Odoo. Os dois maiores são
  pessoas físicas (GEORGE OLIVEIRA DA SILVA, R$ 291.719; JOÃO ANNES GUIMARÃES, R$ 130.499).
- **3 notas (R$ 26.631)**: o participante da nota não existe em `fato_parceiro` (cadastro ainda
  não ingerido ou removido no Odoo).

Não é bug de cálculo: o dinheiro está certo e entra no faturamento total. É **qualidade de
cadastro no Odoo**. Duas saídas possíveis (decisão do dono):
1. corrigir o cadastro desses clientes no Odoo (o mapa se resolve sozinho no próximo sync);
2. usar a UF do ENDEREÇO DE ENTREGA da nota como segunda fonte, quando o cadastro não tiver.
## R-participante , o destinatário da nota NÃO é o `res.partner` (perícia 2026-07-12)

**Erro de raiz, corrigido.** No Odoo da Tauga, `participante_id` (em sped.documento,
pedido.documento, finan.lancamento, DF-e...) aponta para **`sped.participante`**, não para
`res.partner`. As duas tabelas têm numeração independente. O `fato_parceiro` vinha de
`res.partner`, então TODO join por `participante_id` pegava **pessoa diferente**.

Estrago medido: **116 das 136 notas de julho/2026 no estado errado** no mapa (R$ 6,6 mi). O
"Sem UF" (R$ 450 mil) era o sósia de número sem estado preenchido, não cliente sem endereço.

Correção: `fato_parceiro` passou a vir de `sped.participante` (mesma chave dos documentos).
`partner_id` fica materializado para quem precisar do contato do Odoo.

**Ponto de atenção que ficou:** `src/worker/sync/directed.ts` (sync direcionado após as write
tools do MCP) ainda sincroniza `res.partner`. Escrita em `res.partner` via API externa **não
reflete mais no cadastro analítico**, que agora é o participante fiscal. Se as write tools de
parceiro forem usadas de verdade, o directed sync precisa passar a atualizar
`sped.participante` também.

**Lição:** ao cruzar dois modelos do Odoo por id, CONFIRA a `relation` do campo com
`fields_get`. Id igual não quer dizer entidade igual.

---

## R-corte-pericia , varredura da plataforma inteira (2026-07-13, a pedido do dono)

Perícia das **128 tools do MCP**, dos **6 relatórios 1.0 + 22 fontes do 2.0**, de **todos os
KPIs da Diretoria** e do **prompt do Nex**, para garantir que tudo respeita a data de
"Analisar dados a partir de" (`sync.corte_dados`, hoje 16/03/2026) e que a data é tratada como
**variável** (muda na tela, sem deploy).

**O que já estava certo:** o boundary de hidratação (o servidor MCP, o pipeline externo, o
worker e as páginas RSC leem o AppSetting antes de qualquer consulta); todos os KPIs da
Diretoria; as 22 fontes do construtor; os 6 relatórios 1.0; e a esmagadora maioria das tools.

**Furos corrigidos:**

| Onde | O que acontecia |
|---|---|
| `cadastro_parceiros_novos` | Tinha um resolvedor de período **próprio**, que não importava nada de `corte-dados` , a única tool que ignorava a data por completo. `periodoDe: "2020-01-01"` (ou o preset `ano_corrente`) varria o cadastro inteiro abaixo do corte. |
| `fiscal_faturamento_mensal_serie` | Ano anterior ao corte devolvia **12 meses de R$ 0,00 sem aviso** , o agente leria como "faturamento zero", que é falso. |
| `fiscal_detalhar_nota` / `comercial_detalhar_pedido` | `findFirst` por `odooId` **sem piso**: serviam documento pré-corte com valor, sendo que o mesmo documento não entra em total nenhum. |
| `queryCartaCorrecao` | O branch de drill-down (`documentoId`) trocava o `where` inteiro e **descartava o clamp**. |
| Relatórios 1.0 (barra de período) | O calendário tinha como piso o mês mais antigo do **cache**, e o preset "Ano" nascia em janeiro. A query grampeava por baixo (o dado saía certo), mas a barra **anunciava uma janela que não era a lida**. |
| Prompt do Nex | A data é injetada por turno (certo), mas a **seção que ensina o agente a usá-la** morava dentro do `identityBase` , sobrescrito pelo banco quando o admin salva o prompt, e descartado inteiro por um `advancedOverride`. Em produção o `identity_base` do banco **ainda tem o texto antigo** ("apenas dados de 2026 em diante"); só não valia porque `uses_code_defaults = true`. Agora a regra vive em `regra-corte.ts` e é anexada SEMPRE, por último. |

**Decisões de produto que ficam com o dono (não inventamos filtro onde não cabe):**

- **Estado não tem janela.** Saldo de estoque, valor por armazém, concentração, saldo bancário,
  seriais e idade em dias são **foto do agora**: não existe "saldo em março". Filtrar por data
  esconderia mercadoria que está fisicamente no armazém hoje.
- **"Dias parado"** vem pronto do Odoo, calculado sobre o histórico **inteiro** do ERP. Um item
  pode aparecer como "parado há 400 dias" enquanto a plataforma só analisa desde 16/03. Cortar
  isso viraria um número artificial; se tiver que acompanhar a janela, a mudança é no builder
  do fato, não na leitura.
- **Cadastro de parceiros** (quantos clientes/fornecedores) conta todos, inclusive os
  cadastrados antes do corte , é o certo para um cadastro (o cliente existe hoje). "Clientes
  novos na janela" é outro KPI, não um filtro neste.
- **`bi_consulta_avancada` (Caminho 3c)** executa SQL do agente e **não injeta o piso** , só
  avisa. É furo estrutural conhecido e declarado; fechá-lo exige validar no `sql-guard` que
  toda tabela de histórico citada tenha o piso no WHERE.
- **`fato_cotacao` não tem coluna de data** (bomba-relógio). Hoje o fato está vazio (a Matrix
  não opera cotação), então não vaza nada. Quando entrar em operação, o builder precisa
  materializar a data antes de a tool ir para o ar.

---

## R-intragrupo , o Nex respondia faturamento 65% acima do dashboard (RESOLVIDO 2026-07-13)

Achado ao investigar o `R-base-cfop` a pedido do dono. **Não era o corte: era uma regressão
viva**, introduzida pelo PR #166 e medida em produção.

`fiscal_faturamento_por_cfop` soma **toda saída autorizada**, mas a marcação de intragrupo
vinha do `carregarItensVendaComGrupo`, cujo universo é "nota de venda pela operação" , e essa
regra **exclui a operação `venda interna`**, que é justamente onde mora a venda entre empresas
do grupo, com CFOP de receita (5102/6108). O numerador contava esses itens; o subtraendo, não.

Resultado: a eliminação intragrupo caiu para **R$ 0,02** e a tool respondia ao agente *"a
receita REAL, sem intragrupo, é R$ 102,1 milhões"* enquanto o dashboard dizia **R$ 61,9
milhões** para a mesma pergunta. **+R$ 40 mi (+65%).**

Medido em produção depois da correção (recorte da tool, CFOPs de venda):

| | |
|---|---|
| receita bruta | R$ 99.445.291,21 |
| intragrupo eliminado | **R$ 39.012.727,53** (era R$ 0,02) |
| receita real | **R$ 60.432.563,68** |

**Correção:** a marcação de intragrupo passa a nascer do **mesmo universo** que a soma. O
teste unitário não pegava porque o mock zerava o intragrupo de propósito ("sem grupo no mock");
agora há um caso com nota de venda interna para empresa do grupo.

**Lição:** quando o numerador e o subtraendo de uma conta vêm de **loaders diferentes**, um
deles pode ser estreitado sem que o outro perceba. Universo da soma e universo da eliminação
têm que ser o mesmo objeto.

**Fica aberto (decisão de produto):** no grão da NOTA, "venda interna" **não é venda**
(`nota-venda-externa.ts`); no grão do ITEM, o CFOP 5102/6108 dessas mesmas notas **é receita**
(`cfop-mapa.ts`). Enquanto as duas camadas discordarem, a eliminação intragrupo é a única coisa
que segura a conta. Ver também `fiscal_ponte_faturamento`, que mistura `item.vr_produtos` com
`nota.vr_nf` e por isso responde `reconciliado: false`.

---

## R-pendencias-2026-07-12 , RESOLVIDAS em 2026-07-13

As quatro pendências que sobraram do incidente de OOM do worker foram fechadas. Registro do que
era, do que se descobriu medindo, e de onde ficou cada coisa.

### 1. Drift de configuração no `app` e no `mcp` , AUDITADO, ESTAVAM LIMPOS
O `worker` rodava com **1 GB de heap e 1,5 GiB de limite**, embora o compose da stack declarasse
**4 GB / 4608M**. Causa: `deploy-portainer.py` (e o Shepherd) fazem *service update* pela API do
Docker , trocam a IMAGEM e forçam o rolling, mas **não reaplicavam `environment` nem `resources`**.
O compose virou papel; o Swarm ficou com a spec antiga.

Auditoria completa da stack com `scripts/_prod-stack-drift.py` (compara, serviço a serviço, o
compose da stack com a spec VIVA no Swarm, e faz backup da stack em `.prod-backups/`):

| serviço | drift encontrado |
|---|---|
| `app` | nenhum |
| `mcp` | nenhum |
| `worker` | `NODE_OPTIONS` (o compose ainda dizia 4096; o vivo já estava em 2048 pelo PR #180) |
| `db` | limite de memória: compose 1024M, **vivo 1536M** |
| `redis` | nenhum |

O `db` é o achado novo: o Postgres roda com 1536M desde que sofreu OOM interno (cgroup) com teto
de 1 GB durante o reconcile pesado, e **o compose nunca acompanhou**. Ou seja, o drift era nos dois
sentidos. O compose foi corrigido para refletir a realidade (1536M) , se alguém tivesse feito um
`docker stack deploy` ingênuo, o Postgres teria sido rebaixado de volta para 1 GB.

### 2. Raiz do deploy , CORRIGIDA (o deploy agora reconcilia o compose)
Decisão: **não** virar `docker stack deploy` (opção (a) descartada , ele atualiza os serviços em
paralelo, e em 2026-06-12 recriar `app`+`mcp`+`worker` juntos estourou a memória do nó e o OOM
killer atingiu o Postgres). Adotada a opção (b): o `deploy-portainer.py` passou a **ler o compose
da stack e aplicar `environment` + `resources` na spec de cada serviço**, junto com a imagem,
mantendo o rolling um-a-um. Ele imprime tudo que muda antes de subir.

Regra que fica: **o compose da stack é a fonte da verdade da configuração.** Variável que exista só
no serviço vivo é mantida e reportada (tirar env de produção é decisão humana, não efeito colateral
de deploy). Ferramentas: `_prod-stack-drift.py` (conferir), `_prod-stack-put.py` (publicar o
compose; se recusa a publicar um compose que divirja dos serviços vivos, para o `stack deploy` do
PUT ser no-op e não recriar task). Passo a passo em `docs/runbooks/deploy-procedure.md` §4.1.

O Shepherd continua trocando só a imagem , o que é seguro: ele não *causa* drift, apenas não o
corrige. Mudança de configuração passa pelo caminho acima.

### 3. Teto de memória do worker , 3 GB APLICADO, e o pico real era o dobro do que se supunha
O que se supunha: "pico real do ciclo fica na casa de 1 GB". **Medido** em produção com
`scripts/_prod-worker-mem.py` (amostra o endpoint de stats do Docker durante um ciclo completo):

- em repouso: **~0,48 GB**
- no ciclo pesado (rebuild dos fatos): **~1,9 GB**

Ou seja, 1 GB de heap (o que o serviço rodava por causa do drift) era mesmo insuficiente , o OOM
não era azar. E um teto de 2 GB teria sido apertado demais. Ficou: **teto do container 3072M, heap
V8 2048M**, que cobre o pico com ~1,1 GB de folga. O 4608M anterior veio de chute.

### 5. LIÇÃO NOVA (a mais cara da noite): em compose, OMITIR é APAGAR
Publicar o compose corrigido pelo Portainer dispara um `docker stack deploy`, e ele
**remove do serviço tudo que o compose não declara**. Como o compose da stack não trazia
`deploy.labels` nem `deploy.update_config`, a publicação silenciosamente:

- **apagou `com.nexus.autodeploy=true` de `app`, `mcp` e `worker`.** O Shepherd só toca
  serviço com esse label , ou seja, **o auto-deploy de produção morreu sem avisar**.
  Pego no diff da spec viva contra o backup da stack e restaurado em ~2 min;
- **apagou `UpdateConfig`/`RollbackConfig`** (start-first + rollback automático). O update
  virou stop-first e o `app` devolveu 502 durante a troca.

Os dois voltaram, agora **declarados no compose** (que é a fonte da verdade): `app` e `mcp`
com `start-first`, `worker` com `stop-first` (com start-first existiriam dois workers vivos
rodando ciclo de sync em cima do mesmo cache; ninguém depende do worker responder request).

O que ficou de defesa, para não repetir:
- `_prod-stack-put.py` agora avisa o que o compose **omite** e o serviço vivo tem (labels,
  update_config, rollback_config), dizendo que aquilo **seria apagado**;
- `_prod-stack-drift.py` passou a comparar **labels de serviço** (o do Shepherd inclusive).
  A auditoria não olhava labels , foi exatamente por isso que a perda passou despercebida;
- `deploy-portainer.py` reconcilia labels do compose junto com env/resources, de forma
  aditiva (não remove o que só existe no serviço vivo).

**Sempre faça backup da stack antes de publicar** (`_prod-stack-drift.py` grava em
`.prod-backups/`). Foi o backup que permitiu descobrir o que tinha sumido.

### 4. Lock zumbi a cada restart , CORRIGIDO (dono + heartbeat)
Todo restart deixava `odoo-sync:lock:incremental` preso no Redis, e o worker novo pulava ciclos até
o TTL de 15 min expirar. Agora o lock tem **dono e heartbeat** (`src/worker/sync/ciclo-lock.ts`):
TTL de 90s, renovado a cada 30s por quem o detém. Ciclo honesto e longo segue protegido; processo
morto para de renovar e o lock cai sozinho em no máximo 90s. A liberação é compare-and-delete, para
um worker atrasado não apagar o lock de outro.

Não se limpa o lock no boot de propósito: o worker não distingue lock órfão de lock de outra
réplica viva; apagar no boot funcionaria hoje (`replicas=1`) e viraria bug no dia de uma segunda
réplica. O `scripts/_prod-redis-lock.py --destravar` continua existindo como paliativo manual.
