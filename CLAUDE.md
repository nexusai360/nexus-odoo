# nexus-odoo — Workflow e Contexto do Projeto

> ## 🔒 REGRA DURÁVEL , DATA DE INÍCIO DAS ANÁLISES É **FILTRO**, NUNCA FAXINA (dono, 2026-07-12)
>
> A data configurada em **Configuração > "Analisar dados a partir de"** (AppSetting
> `sync.corte_dados`, fonte única em `src/lib/corte-dados.ts`) é o **parâmetro global de
> início das análises**. Ela **filtra a LEITURA** , dashboard da diretoria, Relatórios,
> Relatórios 2.0, agente Nex (MCP), KPIs e o calendário.
>
> **NADA É APAGADO por causa dela.** O cache guarda o histórico ingerido. Mover a data para
> trás faz o histórico **reaparecer na hora**, sem re-sync e sem perda; mover para frente
> apenas estreita a janela analisada.
>
> A **ingestão tem corte técnico próprio e FIXO** (`src/worker/sync/corte.ts`). Nunca amarrar
> o domínio do Odoo (sync/reconcile) à data da tela: o worker pararia de puxar o que ficasse
> fora dela e a **reconciliação marcaria o histórico como removido** (erro cometido e
> corrigido no PR #168).
>
> Ao criar QUALQUER consulta nova que leia histórico, ela **tem que** respeitar essa data
> (use os helpers de `corte-dados.ts`: `getCorteDados`, `corteAtual`, `clampIsoAoCorte`).



> Carregado automaticamente em toda sessão. Define como conduzir o trabalho.
> Sobrescreve regras globais quando houver conflito específico.

> ## 🔒 REGRA DURÁVEL , F6 (Construtor de relatórios): SÓ LOCAL ATÉ APROVAÇÃO EXPLÍCITA
>
> **Decisão do usuário (2026-06-26), inegociável, vale para ESTA e TODAS as sessões
> futuras.** TODO o trabalho do **Construtor de relatórios (F6)** fica **somente
> local** e **NÃO sobe para produção** sem **aprovação explícita do usuário**.
>
> Concretamente, enquanto a F6 não for liberada por ele:
> - **NUNCA mergear a branch do F6 para `main`** (merge na `main` dispara o
>   auto-deploy via Shepherd e vai para produção). O `gh pr merge` da F6 só
>   acontece com o "sim" explícito do usuário, como qualquer merge, e aqui com
>   rigor redobrado.
> - **NÃO rodar `scripts/ship.py`, `scripts/deploy-portainer.py` nem qualquer
>   deploy** para a F6.
> - **NÃO aplicar migrations da F6 no banco de produção.** Schema novo da F6 só
>   em dev local. Como o Postgres é compartilhado entre worktrees, qualquer
>   migration da F6 segue o protocolo de schema e fica restrita ao dev.
> - O trabalho vive numa **worktree/branch local dedicada** do F6. Push da branch
>   feature para o GitHub (backup/PR de revisão) é tolerável, MAS **o merge para
>   `main` é o gatilho proibido** sem aprovação. Em dúvida, perguntar antes.
> - Validação é toda **local** (dev local, `npm run dev:fresh`, containers locais),
>   nunca em produção.
>
> Esta regra protege contra subir um construtor (que gera relatórios e consome a
> API do Claude por cliente) para produção antes do usuário validar. Só sai daqui
> quando ele disser, com todas as letras, que pode subir.

> **Ao iniciar uma sessão, ler `STATUS.md`** — é o ponto de retomada: o que já
> foi feito, em que fase/bloco estamos e qual a próxima ação. Trabalho conduzido
> em **modo autônomo** (ver §5).
>
> **Multi-agente:** se houver outras sessões Claude trabalhando no repo em
> paralelo (comum neste projeto), seguir o protocolo de `AGENTS.md` (raiz) e
> `docs/agents/_README.md`. Criar `docs/agents/active/<seu-id>.md` antes de
> tocar código, registrar commits relevantes em `docs/agents/HISTORY.md`,
> respeitar lista de arquivos compartilhados. Sem o protocolo, conflitos de
> merge garantidos.

---

## 1. Sobre o projeto

**Cliente:** Matrix Fitness Group (mesma do projeto irmão `nexus-insights`).
**Domínio:** empresa de movimentação e entrega de equipamentos de academia no Brasil — estoque, financeiro, fiscal, comercial.
**ERP de origem:** Odoo da comunidade (OCA Brasil), instância Tauga (`grupojht.tauga.online`), implantado por terceiros.

**Não temos acesso ao banco de dados do Odoo.** O único acesso é a **API JSON-RPC** (usuário + senha). Toda extração passa por ela.

**O que o projeto entrega — duas frentes sobre uma base comum:**
- **Frente A — Dashboard de relatórios:** painel visual com gráficos e relatórios pré-definidos, controle de acesso por perfil.
- **Frente B — MCP semântico:** camada de consulta para um agente de IA (futuramente acessível via WhatsApp) responder perguntas sobre a operação.

Ambas leem de um **banco interno (cache)** alimentado por sincronização periódica do Odoo. Nenhuma das frentes toca o Odoo ao vivo.

---

## 2. Idioma e estilo de comunicação

- Responder sempre em **português brasileiro**.
- Padrão: silêncio. Trabalho feito com ferramentas, sem narração.
- Falar só quando necessário: erro/bloqueio, informação crítica, ou resumo final.
- Resumo final em um único parágrafo.
- **Proibido o caractere travessão (`—`, em dash) em qualquer texto:** UI, documentação,
  comentários de código, mensagens de commit, chat. Vale também para o travessão como
  separador de frase. Usar vírgula, parênteses, dois-pontos ou ponto final no lugar.
  A escrita deve ser humanizada, em linguagem natural de produto, como se uma pessoa
  tivesse escrito cada parte da plataforma.

---

## 2.2 Atalho de manutenção dev local: `npm run dev:fresh`

> Quando o usuário disser **"atualiza a plataforma"**, **"coloca na última
> versão"**, **"sobe o sistema atualizado"**, **"reinicia o dev"**,
> **"limpa o cache do next"** ou variações ("a versão está velha",
> "tá desatualizado"), execute o script:
>
> ```bash
> npm run dev:fresh
> ```
>
> O script (definido em `package.json`) faz:
> 1. mata processos `next dev` / `next-server`;
> 2. apaga `.next` (cache do Turbopack);
> 3. roda `npx prisma generate` (caso schema tenha mudado);
> 4. sobe `npm run dev` de novo.
>
> Rode com `nohup ... > /tmp/nexus-dev.log 2>&1 &` quando for em background.

## 2.1 REGRA DE RAIZ: rebuild de containers após mudança de código

> **Inegociável.** A stack dev (`docker-compose.yml` + `docker-compose.override.yml`)
> roda 3 containers que **NÃO usam volume mount** do código-fonte: `app`,
> `mcp` e `worker`. Toda vez que você muda código que esses containers
> consomem, **precisa rebuildar e reiniciar o container afetado** antes
> de testar. Pular esse passo já custou horas de debugging falso ("a
> feature foi entregue mas não funciona").
>
> **Mapa de impacto código → container:**
>
> | Mudou em… | Rebuilda |
> |---|---|
> | `mcp/**` | `mcp` |
> | `src/lib/reports/queries/**` | `mcp` (a tool MCP importa daí) |
> | `src/lib/odoo/**` ou clientes Odoo | `worker` |
> | `prisma/schema.prisma` ou `src/generated/prisma/**` | **todos** (app + mcp + worker) |
> | `src/**` exceto os acima | `app` |
> | `next.config.ts`, `tsconfig.json`, `package.json` | `app` (e `mcp` se afetar import resolvido lá) |
>
> **⚠️ ARMADILHA CRÍTICA , o `worker` NÃO tem `build:` próprio (2026-05-31).**
> No `docker-compose.yml`, só `app` e `mcp` têm `build:`. O **`worker` apenas roda
> a imagem `nexus-odoo:local`, que é construída pelo serviço `app`**. Consequência:
> `docker compose build worker` e `docker compose up -d --build worker` são
> **no-op** , reusam a imagem antiga e o worker fica com **catálogo/builders
> velhos** (foi exatamente o bug que deixou modelos novos "parados", sem sync, por
> horas). **Para atualizar o código do worker, rebuilde o `app`:**
>
> ```bash
> # Atualiza o WORKER (e o app): rebuildar a imagem nexus-odoo:local via `app`
> docker compose build app
> docker compose up -d --force-recreate worker   # (e app, se estiver rodando em container)
>
> # MCP tem build próprio:
> docker compose up -d --build mcp
> ```
>
> **Verificação obrigatória do rebuild** (não confiar no "Built"): confira a data
> da IMAGEM e o catálogo DENTRO do container:
> ```bash
> docker image inspect nexus-odoo:local --format '{{.Created}}'   # tem que ser AGORA
> docker exec nexus-odoo-worker-1 grep -cE "odooModel:" src/worker/catalog/model-catalog.ts
> ```
> Se a data da imagem for antiga, o build não pegou , use `docker compose build app`
> (não `worker`).
>
> **Comando padrão genérico** (demais serviços):
>
> ```bash
> docker compose build <serviço>
> docker compose up -d <serviço>
> # ou faz os dois de uma vez (NÃO vale para worker , ver armadilha acima):
> docker compose up -d --build <serviço>
> ```
>
> **Quando obrigatoriamente rebuildar** (gatilhos automáticos):
>
> 1. Encerrou uma onda/commit que tocou caminhos do mapa acima.
> 2. Antes de validar em UI/bubble/playground qualquer feature nova.
> 3. Em modo autônomo: ao final de cada onda que afetou container.
> 4. Antes do `/ultrareview` ou verificação manual do usuário.
>
> **Como detectar que o container está velho:** rode
> `docker inspect <container> --format '{{.State.StartedAt}}'` e compare
> com `git log -1 --format=%aI -- <caminho-tocado>`. Se o container
> começou antes do último commit que mexeu no caminho que ele consome,
> rebuilde.
>
> **Em produção:** o push para `main` dispara CI → ghcr.io → Portainer
> redeploy automaticamente. Mas em **dev local** é manual.
>
> **Multi-agente:** registre em `docs/agents/HISTORY.md` quando rebuildar
> ("scope=infra summary=rebuild mcp pos onda B"). Outros agentes leem.

---

## 3. Arquitetura macro

```
┌─────────────┐   ┌──────────────┐   ┌────────────────────────────┐
│  WhatsApp   │──▶│  Agente IA   │──▶│  MCP semântico (container) │
└─────────────┘   └──────────────┘   └────────────┬───────────────┘
                                                   │ lê
┌──────────────────────────────┐                  ▼
│  Dashboard (container "app")  │────lê───▶┌─────────────────┐
└──────────────────────────────┘          │  Postgres cache │
                                           │  (raw + fatos_*)│
                                           └────────▲────────┘
                                                    │ escreve
                                           ┌────────┴────────┐
                                           │  Worker BullMQ  │
                                           │  cron polling   │
                                           └────────▲────────┘
                                                    │ JSON-RPC
                                           ┌────────┴────────┐
                                           │  Odoo Tauga     │
                                           └─────────────────┘
```

**Monorepo único**, múltiplos serviços/containers:

```
nexus-odoo/
├── app/      → Next.js — o dashboard            (container "app")
├── mcp/      → servidor MCP semântico            (container "mcp")
├── worker/   → cron de sincronização JSON-RPC     (container "worker")
├── prisma/   → schema do cache (COMPARTILHADO)
├── discovery/→ script(s) Python de mapeamento do Odoo (F0)
└── docs/     → specs, plans, runbooks, git-workflow
                                                  + containers "db" e "redis"
```

Independência das frentes está **na camada de cima** (app e mcp evoluem sem se travar). A base — cache, ingestão, auth — é **única e compartilhada**. Nunca dividir em dois repos ou dois bancos.

---

## 4. Decomposição em sub-projetos (roadmap)

| Fase | Sub-projeto | Entregável |
|---|---|---|
| **F0** | Discovery do Odoo | Mapa dos modelos/campos/relações + JSONs de schema descoberto |
| **F1** | Fundação | App no ar, login e RBAC funcionando (clona padrão `nexus-insights`) |
| **F2** | Ingestão / cache | Worker + cron + schema Prisma; cache populado e se atualizando |
| **F3** | Dashboard de relatórios | Painel com relatórios lendo do cache; RBAC por relatório |
| **F4** | MCP semântico | Servidor MCP, RBAC 7 camadas, Caminho 3 (3a/3b/3c). **Escopo decidido: TODOS os domínios de negócio** que o Odoo expõe — não uma lista fixa. **Entrega faseada por domínio (decisão #10): a F4 desenha a arquitetura completa e entrega a onda 1 com estoque + financeiro; comercial, fiscal, contábil e produção entram em ondas seguintes reusando a mesma base.** Exige construir a camada de **fatos** dos domínios que ainda só têm `raw` — hoje só estoque tem `fato_*`. |
| **F5** | Integração WhatsApp + Agente de IA | Agente de IA respondendo por **WhatsApp** (via **n8n** — Meta→n8n→nossa plataforma; resposta em 2 modos: envio direto ou webhook→n8n) e por **chat in-app** (clone melhorado do "Nex" do `nexus-insights`). Inclui: número(s) de WhatsApp no cadastro de usuário + cruzamento número→usuário→acesso; menu **Integrações** (superadmin only — Canais/WhatsApp, MCP, Webhooks, API, BI); MCP consumível de fora (node Agent do n8n); log de conversas em Postgres relacional; `pgvector` para RAG quando houver. **Escopo completo: `docs/superpowers/specs/2026-05-18-f5-whatsapp-agente-design.md`.** |
| **F6** | Construtor de relatórios | Construtor in-app de relatórios para admin/super_admin: wizard guiado por IA que parametriza templates (sem gerar código). Ver `docs/ideias/2026-05-16-construtor-relatorios.md` |

Ordem: **F0 → F1 → F2 → F3 → F4 → F5**. F3 e F4 podem ser paralelas após F2.
**F6 vem por último** — depende da camada semântica da F4 e do modelo de templates da F3.
**Cada sub-projeto tem sua própria spec → plan → execução.** Não se planeja tudo de uma vez.

---

## 5. Decisões canônicas já tomadas (não rediscutir sem motivo)

1. **Cache local é obrigatório.** Dashboard e MCP leem do Postgres interno, nunca do Odoo ao vivo.
2. **Leitura sempre do cache; escrita só via tools `write:*` do MCP.** Leitura: o cache Postgres é alimentado pelos ciclos da F2 (incremental 3min + snapshot/reconcile 24h); nenhuma pergunta de usuário dispara chamada de leitura ao Odoo; toda tool de leitura retorna o timestamp da última sync (`atualizado há Xs`). Escrita (F4 Onda 2): pode ir ao Odoo **exclusivamente** via tools `WriteToolEntry` do servidor MCP, gated por capability de `ApiKey` (modo EXTERNO de auth) e disponível só pelo endpoint público `/api/mcp`. Toda write é seguida de sync direcionado da(s) linha(s) afetada(s), retornando ao cache em <2s. O Agente Nex (in-app + WhatsApp) usa o modo INTERNO de auth e **nunca pode** chamar uma `WriteToolEntry` — é defesa pela rota de auth, não pelo prompt.
3. **A IA consulta via ferramentas semânticas (MCP próprio), não text-to-SQL livre.** Tools de vocabulário de negócio (`faturamento_no_periodo`, `estoque_modelo`...), cada uma código TS validado/testado/auditado.
4. **Não usar DuckFly.** MCP próprio em TypeScript com `@modelcontextprotocol/sdk`.
5. **Caminho 3 — perguntas fora do catálogo:**
   - **3a** métrica inexistente no escopo → resposta de falta honesta + log de gap (`feature_requests`).
   - **3b** fora do escopo de negócio → recusa educada.
   - **3c** modo BI/avançado → **executor de SQL embutido no próprio MCP semântico** (`bi_consulta_avancada` recebe um `sql` pronto do agente e o executa sob o role read-only `nexus_mcp_bi`). O text-to-SQL é responsabilidade do agente da F5 — o MCP apenas executa. Restrito a `admin`/`super_admin`; resposta tabular com aviso de "consulta dinâmica". O **Postgres MCP (Crystal DBA)** ficou restrito a ambiente **dev/DBA** — não é usado em produção no Caminho 3c. Decisão registrada em `docs/superpowers/research/2026-05-17-f4-postgres-mcp-role.md` (revisão em 2026-05-18).
6. **RBAC estrutural em 7 camadas** (não depende de prompt): catálogo filtrado por usuário, validação no handler, tenant scoping injetado, user Postgres com GRANT mínimo, RLS opcional, validação Zod, audit + rate limit.
7. **Postgres MCP (Crystal DBA) em ambiente dev/DBA apenas** — uso de produtividade para o time, separado do MCP semântico de produção. Não é o mecanismo do Caminho 3c de produção (ver #5 acima).
8. **Protocolo Odoo: JSON-RPC.** O XML-RPC do Odoo quebra no `fields_get` de modelos com metadados `None` (customização SPED da Tauga). A F0 comprovou JSON-RPC estável. Cliente em `src/worker/odoo/client.ts`.
9. **F4 cobre TODOS os domínios.** O MCP semântico não se limita a estoque ou a uma lista de 4 domínios — o catálogo de tools cobre **todo domínio de negócio** que o Odoo expõe no cache. Consequência: a F4 inclui construir a camada de **fatos** (`fato_*`) dos domínios que hoje só têm dados `raw` (estoque já tem; financeiro/fiscal/comercial e demais, não). Decisão do usuário em 2026-05-17.

10. **F4 entregue em ondas; F4 ≠ F5.** O escopo "todos os domínios" continua canônico (#9), mas a entrega é faseada: a F4 desenha a arquitetura completa do MCP e entrega a **onda 1 com estoque + financeiro** (arquitetura validada com 2 domínios reais de alto valor); os demais domínios entram em ondas seguintes. Fronteira firme: a **F4 é estritamente o servidor MCP** — servidor `@modelcontextprotocol/sdk` em TS (transporte Streamable HTTP), camada de fatos dos domínios da onda, catálogo de tools semânticas, RBAC 7 camadas, Caminho 3, contrato de identidade (`userId` da plataforma sempre; número de WhatsApp nunca chega ao MCP) e `McpAuditLog` de tool calls. O MCP é **stateless** — não guarda conversa. Tudo que é WhatsApp, log de conversas, personalização e banco vetorial é **F5** (ver §4). Decisão do usuário em 2026-05-17.

11. **Rodadas de auditoria do Agente Nex são auto-numeradas (R8, R9, R10, ...).** PROIBIDO editar `KNOWN_MARKERS` / `LEGACY_MARKERS` à mão a cada bateria nova (já causou 4+ regressões com o linter/IDE revertendo). A função canônica é `buildRodadaNamesFromMarkers(allMarkers)` em `src/lib/agent/quality/rodada-labels.ts`: ordena os markers pelo timestamp embutido (`[AUDIT-POS-YYYY-MM-DDThh-mm-ss]`) e atribui RX sequencialmente a partir de R8. Toda UI/script que mostra nome de rodada **deve** usar essa função (ou o helper `labelFor` exposto em `qualidade-content.tsx`). Disparar uma R20, R30 ou R99 não exige edição de código. Decisão do usuário em 2026-05-27, após o bug ser relatado 4x.

---

## 6. Workflow por fase

Cada sub-projeto percorre o fluxo abaixo. Classificar o esforço pela demanda — não matar mosca com fuzil.

```
[1]  BRAINSTORM → SPEC v1 ───────────► requer humano
[2]  DESIGN UI/UX ───────────────────┐
[3]  REVIEW DA SPEC #1 → SPEC v2 ────│
[4]  REVIEW DA SPEC #2 → SPEC v3 ────│
[5]  PLAN v1 (sobre a SPEC v3) ──────│ autônomo
[6]  REVIEW DO PLANO #1 → PLAN v2 ───│
[7]  REVIEW DO PLANO #2 → PLAN v3 ───│
[8]  EXECUÇÃO (Superpowers) ─────────│
[9]  VERIFICAÇÃO ────────────────────│
[10] CODE REVIEW + UI REVIEW ────────│
────────────────────────────────────
[11] /ultrareview ───────────────────► requer humano (manual, opcional)
[12] DEPLOY ASSISTIDO ───────────────► requer humano (validação final)
```

### Modo autônomo — padrão automático, inegociável

**Modo autônomo é o padrão e é automático.** Iniciar a spec de qualquer
implementação já dispara, por conta própria, a cadeia inteira `[1]→[10]` até
a entrega — **sem pedir permissão, sem perguntar "posso seguir?", sem
checkpoint entre etapas**. Claude não aguarda o humano mandar continuar e não
pergunta se deve prosseguir. Concluiu uma etapa, começa a próxima; concluiu
uma fase, encadeia a seguinte (F2→F3→F4...). Isso vale **toda vez**, sem
exceção e sem precisar ser pedido — começou a spec, segue assim até o fim.

A sequência é cumprida na íntegra, sem atalho e sem pular etapa:
**SPEC v1 → review crítica profunda de verdade (não carimbo, não review
fake) → SPEC v2 → review ainda mais profunda e adversarial (caçar o que
faltou, o exagero, o conceito quebrado) → SPEC v3 → PLAN v1 → a mesma dupla
de reviews críticas → PLAN v2 → PLAN v3 → execução em microtarefas →
verificação → code review + UI review.** Cada review é genuína: se não achou
nada material, ela falhou em ser crítica o bastante.

Claude só chama o humano:
- na **entrada de requisitos** do brainstorm [1] — e só ali; com os requisitos
  dados, não volta a perguntar nada nem pede aval para continuar;
- no **merge de PR para `main`**, no **`/ultrareview` [11]** e no **deploy [12]**;
- diante de **erro/bloqueio real**.

Fora desses pontos: silêncio e execução. Ao terminar **tudo** — implementação,
verificação e reviews de código — aí sim chama o humano com o resumo final.
O humano interrompe quando quiser; enquanto não interromper, Claude segue
autônomo até o fim.

**[1] Brainstorm → SPEC v1** — `superpowers:brainstorming`. Output: spec v1 em `docs/superpowers/specs/`.
**[2] Design UI/UX — `ui-ux-pro-max`, OBRIGATÓRIO.** A skill `ui-ux-pro-max` é a autoridade de design e é de uso **obrigatório em tudo que for frontend** — layout, telas, componentes, ícones, gráficos, cores, tipografia, espaçamento, animação e interação. Nenhuma UI é construída ou alterada sem consultá-la primeiro. Alimenta a spec e o plano, e é reaplicada durante a execução de qualquer task com UI.
**[3–4] Double-check da SPEC — REGRA DE RAIZ, inegociável.**
> A spec passa por **duas reviews genuinamente críticas** antes de virar plano.
> **As duas reviews são SEQUENCIAIS, NUNCA em paralelo (regra de raiz):** a #2 só
> começa depois que a #1 foi aplicada e virou a v2, porque a #2 revisa a **v2 já
> corrigida**. É PROIBIDO disparar as duas ao mesmo tempo sobre a mesma versão.
> - **[3] Review da spec #1 → SPEC v2** — auditoria adversarial: achar erro,
>   inconsistência, premissa frágil, requisito ambíguo, o que está faltando ou
>   esquecido. Aplicar os achados gera a **SPEC v2**.
> - **[4] Review da spec #2 → SPEC v3** — review **ainda mais crítica e
>   profunda** sobre a v2: caçar todo problema e inconsistência restante,
>   incrementar e completar. Aplicar gera a **SPEC v3** — a versão que vai
>   para o plano.
> Critério de saída: a review não encontra mais achado material.
**[5] Plan v1** — `superpowers:writing-plans`, sobre a SPEC v3. Tasks bite-sized, sem placeholders. Salvo em `docs/superpowers/plans/`.
**[6–7] Double-check do plano — REGRA DE RAIZ, inegociável.**
> Duas reviews **genuinamente críticas**, sem passar pano. A review não é
> carimbo — é auditoria adversarial do próprio plano. Vale para TODA fase.
> **SEQUENCIAIS, NUNCA em paralelo (regra de raiz):** PLAN v1 → review #1 → aplicar
> → PLAN v2 → review #2 (mais profunda, sobre a v2) → aplicar → PLAN v3. A #2 só
> começa depois da v2 existir. Proibido disparar as duas ao mesmo tempo.
> Critérios de qualidade que o plano precisa cumprir para sair do loop:
> - **Decomposição máxima.** Cada task é uma unidade pequena, de escopo único,
>   verificável isoladamente. Se uma task descreve "portar a tela X" com
>   lista + forms + actions juntos, ela é um épico — quebrar em uma task por
>   arquivo ou por ação. Quanto mais granular, menor o espaço para
>   inconsistência. Em dúvida, quebrar mais.
> - **Zero ambiguidade.** Cada step diz exatamente o quê, em qual arquivo, com
>   qual verificação e qual resultado esperado. "Portar e adaptar" não é step —
>   é placeholder. Porte exige listar o arquivo-fonte e cada adaptação.
> - **[6] Review do plano #1 → PLAN v2** — lacunas, ordem, premissas.
>   **[7] Review do plano #2 → PLAN v3** — granularidade, integração,
>   testabilidade; aqui se mede se cada task é pequena o suficiente. Se não
>   for, o plano é redecomposto. A v3 é a versão que vai para a execução.
> Critério de saída: a review não encontra mais achado material **E** nenhuma
> task esconde mais de uma unidade de trabalho. Objetivo: zerar inconsistência
> no que for construído.

**[8] Execução — Superpowers (decisão revista em 2026-05-16).**
> Avaliação GSD × Superpowers: embora o projeto seja multi-fase, o ciclo Superpowers (brainstorming → writing-plans → execução → verification → code review) cobre o fluxo inteiro e provou-se limpo no F0. Adotar a família `gsd-*` como espinha exigiria reformatar specs/plans para o formato GSD e somar cerimônia (`.planning/`, ROADMAP formal, requirements rastreados) sem ganho proporcional — a estrutura de fases já vive neste documento (§4) e a continuidade entre sessões é garantida por specs/plans versionados + tasks + git. **Decisão: Superpowers de ponta a ponta.**
> - **Padrão: executar na sessão principal (Opus 4.7), inline.** Não delegar para subagente por padrão. A experiência com delegação foi ruim — o subagente não pega o contexto da conversa, das documentações nem das decisões, e entrega trabalho desalinhado. Execução inline mantém todo o contexto.
> - **Subagente é exceção, não regra.** Só delegar quando: (a) houver ganho real de paralelismo ou de isolamento de contexto E (b) for criado **antes** um arquivo de briefing que compartilhe TODO o contexto necessário (resumo do projeto, decisões, padrões, o que está sendo feito e por quê). Sem esse briefing, não delegar.
> - **Modelo: SEMPRE Opus 4.7 — nunca Sonnet.** Vale para execução inline E para qualquer subagente (execução, review, o que for). Sonnet 4.6 está proibido para qualquer trabalho neste projeto (decisão do usuário, 2026-05-21, após entregas de UI ruins feitas com Sonnet).
> - **Toda UI/frontend: exclusivamente na sessão principal (Opus 4.7) + `ui-ux-pro-max` obrigatório.** Nunca delegar layout/componente/tela para subagente. Regra absoluta.
> - `superpowers:test-driven-development` dentro de cada task com código testável.
> `/gsd-code-review` e `/gsd-ui-review` permanecem como auditorias pontuais na etapa [10] — é o único uso da família `gsd-*`.

**[9] Verificação** — `superpowers:verification-before-completion`. Evidência antes de afirmar pronto. Testar feature na UI quando aplicável.
> **Teste end-to-end contra dado real é obrigatório (regra de raiz, 2026-05-18).**
> `tsc`/`eslint`/`jest`/code-review **não bastam** — review de código não pega
> premissa errada sobre o dado. Toda onda que entrega tool de MCP, relatório ou
> consulta a dado precisa, na verificação, **subir o serviço, popular os fatos
> e exercer contra o cache real**, conferindo se os números fazem sentido. Foi
> assim que os bugs de financeiro da F4 onda 1 apareceram — depois de 12
> reviews de código. Ver `docs/RADAR.md` R2.

### Investigar até a certeza — autonomia plena (regra de raiz, 2026-05-18)
Sempre que houver **suspeita de que um dado pode não estar 100% verdadeiro** —
fonte possivelmente errada, número que não fecha, premissa não comprovada —
Claude tem autonomia para **investigar a fundo, comprovar contra o dado real e
corrigir antes de entregar**. Não entregar resultado com ressalva de "talvez";
não esperar o humano pedir para investigar. Chegar à certeza primeiro, corrigir,
e só então reportar. Achados e correções vão para `docs/RADAR.md` quando
ficarem para depois, mas a regra é resolver na hora sempre que possível.
**[10] Auditoria final** — `/gsd-code-review` (bugs, segurança, qualidade) + `/gsd-ui-review` (6 pilares visuais, sempre que tocar UI).
**[11] `/ultrareview`** — só quando o humano disparar. Nunca autonomamente.
**[12] Deploy assistido — LER `docs/runbooks/deploy-procedure.md` ANTES, SEMPRE.**
> **REGRA DE RAIZ (2026-06-12).** A PRIMEIRA coisa ao pensar em qualquer deploy
> é abrir `docs/runbooks/deploy-procedure.md` e seguir o passo a passo de lá.
> **AGORA O DEPLOY É AUTOMÁTICO (auto-deploy via Shepherd, 2026-06-14).** Fluxo:
> 1. **Mergear:** `python3 scripts/ship.py "titulo"` (espera CI verde +
>    squash-merge; dispara o build da imagem). Nunca refazer o merge na mão com `gh`.
> 2. **Pronto.** O Shepherd (roda DENTRO da VPS) detecta a imagem nova no ghcr
>    em ~5 min e atualiza prod sozinho (app+mcp+worker, 1 por vez, rollback se
>    falhar). Só toca os serviços com label `com.nexus.autodeploy=true`.
> **Forçar na hora (sem esperar 5 min) ou Shepherd fora:** `python3
> scripts/deploy-portainer.py` (rolling, da máquina local que alcança a VPS).
> **Causa raiz já provada:** o job `deploy` do GitHub Actions falha sempre
> (HTTP 000 — a borda da VPS bloqueia o IP do runner; build da imagem funciona
> normal). Não é quota nem falta de token. A credencial do ghcr já está no nó
> (`/root/.docker/config.json`) e no Portainer (registry id=1). NÃO repetir os
> becos "quota esgotada" / "precisa de PAT". Validar `/api/health` no fim.

### Quando fazer spec
Fazer spec antes do plano quando o requisito é ambíguo, tem múltiplas interpretações, ou toca vários sistemas. Pular quando já é objetivo, bug fix diagnosticado, ou ajuste pontual. Em dúvida: fazer spec.

---

## 7. Fluxo de Git

Documento canônico: **`docs/git-workflow.md`**. Em resumo:
- Nunca commitar direto na `main` (protegida = produção).
- Toda mudança: feature branch → teste local → PR → review → merge.
- Deploy de produção dispara só no merge da `main` — decisão humana.
- Claude **coordena e nomeia** todas as branches, abre os PRs, controla o ciclo.
- **Claude avalia e revisa todos os PRs.** Quem avalia o PR é o Claude, não o
  humano: confere completude (tudo que foi feito localmente está na branch),
  verificação (tsc/eslint/jest/build), correção e consistência, e escreve a
  avaliação no corpo do PR. O humano não revisa o PR. Ao humano cabe só a
  decisão final de merge para a `main`.
- Branches por fase: `feat/discovery-odoo`, `feat/fundacao`, `feat/ingestao`, `feat/dashboard-*`, `feat/mcp-*`.

---

## 8. Segurança

- `.env.example` (template, sem valores) **vai** para o Git. `.env.local` e `.env.production` **nunca**.
- `.gitignore` cobre `.env*` exceto `.env.example`.
- **Credenciais nunca no chat.** A senha real do Odoo Tauga e segredos de produção entram só em `.env.local` / `.env.production` / Portainer.
- **Não reaproveitar secrets entre projetos.** Cada projeto, suas próprias credenciais.
- Encryption AES-256 para dados sensíveis em banco. Rate limit em login e endpoints sensíveis. Auditoria de acessos.
- O `gh` CLI já está autenticado globalmente (conta `jvzanini`) — credencial do GitHub fica no keyring, não em arquivo.

---

## 9. Reaproveitamento do nexus-insights

O projeto irmão `nexus-insights` (mesmo cliente) compartilha o stack canônico. **Aproveitar ao máximo, não refazer:**

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + base-ui.
- **Auth:** NextAuth.js v5 (JWT, Credentials, bcryptjs) — tela de login e fluxo prontos.
- **DB:** PostgreSQL + Prisma v7 (`@prisma/adapter-pg`).
- **Fila/cache/realtime:** Redis 7 + BullMQ + Pub/Sub + SSE.
- **RBAC, design system, componentes, ThemeProvider, Toast, padrão de Server Actions, tenant scoping, auditoria, encryption** — portar do `nexus-insights`.
- **Infra:** VPS Hostinger + Portainer + Docker + Traefik (SSL Let's Encrypt); CI/CD GitHub Actions → `ghcr.io/nexusai360/nexus-odoo` → redeploy.
- **Containers:** `app` + `worker` + `db` + `redis`, **acrescentando `mcp`**.

O inventário detalhado do que copiar é trabalho da F1 (Fundação).

---

## 10. Ferramentas silenciosas (rodam sozinhas, não precisa invocar)

- **Context Mode** — roteia Bash de saída grande para `ctx_batch_execute`. Ativo.
- **Claude Mem** — captura decisões entre sessões, injeta contexto histórico. Ativo.

---

## 11. Princípios de execução

1. **Flexibilidade calibrada** — esforço proporcional à demanda.
2. **Evidência antes de afirmação** — verificar antes de declarar pronto.
3. **Double-check do plano antes de executar** — plano bullet-proof = execução limpa.
4. **Uma fase por vez** — spec → plan → execução por sub-projeto, não tudo de uma vez.
5. **Humano só onde precisa** — brainstorm, `/ultrareview`, merge, validação pós-deploy.
6. **Commits atômicos e memória atualizada** — continuidade entre sessões.
7. **Não criar burocracia sem motivo** — spec e reviews só quando agregam.
