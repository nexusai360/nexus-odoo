# STATUS — nexus-odoo

> **Ponto de retomada entre sessões.** Atualizado em 2026-05-29 (troca de sessão).
> Ao abrir: ler **este arquivo**, o **`CLAUDE.md`** e
> **`.agente-handoff.md`** (na raiz desta worktree). Modo autônomo é o padrão (`CLAUDE.md §6`).
>
> ## 🔄 BRANCH ATIVA: `feat/router-ativacao-r2`
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
