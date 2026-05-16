# nexus-odoo — Workflow e Contexto do Projeto

> Carregado automaticamente em toda sessão. Define como conduzir o trabalho.
> Sobrescreve regras globais quando houver conflito específico.

> **Ao iniciar uma sessão, ler `STATUS.md`** — é o ponto de retomada: o que já
> foi feito, em que fase/bloco estamos e qual a próxima ação. Trabalho conduzido
> em **modo autônomo** (ver §5).

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
| **F4** | MCP semântico | Servidor MCP, catálogo de tools, RBAC 7 camadas, Caminho 3 |
| **F5** | Integração WhatsApp | Agente conectado ao MCP via WhatsApp |
| **F6** | Construtor de relatórios | Construtor in-app de relatórios para admin/super_admin: wizard guiado por IA que parametriza templates (sem gerar código). Ver `docs/ideias/2026-05-16-construtor-relatorios.md` |

Ordem: **F0 → F1 → F2 → F3 → F4 → F5**. F3 e F4 podem ser paralelas após F2.
**F6 vem por último** — depende da camada semântica da F4 e do modelo de templates da F3.
**Cada sub-projeto tem sua própria spec → plan → execução.** Não se planeja tudo de uma vez.

---

## 5. Decisões canônicas já tomadas (não rediscutir sem motivo)

1. **Cache local é obrigatório.** Dashboard e MCP leem do Postgres interno, nunca do Odoo ao vivo.
2. **Sem fallback JSON-RPC nas tools.** O Odoo é tocado **somente** pelo cron de sincronização. Nenhuma pergunta de usuário dispara chamada ao Odoo. Toda tool retorna o timestamp da última sync (`atualizado há Xs`).
3. **A IA consulta via ferramentas semânticas (MCP próprio), não text-to-SQL livre.** Tools de vocabulário de negócio (`faturamento_no_periodo`, `estoque_modelo`...), cada uma código TS validado/testado/auditado.
4. **Não usar DuckFly.** MCP próprio em TypeScript com `@modelcontextprotocol/sdk`.
5. **Caminho 3 — perguntas fora do catálogo:**
   - **3a** métrica inexistente no escopo → resposta de falta honesta + log de gap (`feature_requests`).
   - **3b** fora do escopo de negócio → recusa educada.
   - **3c** modo BI/avançado → **Postgres MCP** (text-to-SQL controlado, read-only), restrito a perfil admin/analista, resposta com aviso de "consulta dinâmica".
6. **RBAC estrutural em 7 camadas** (não depende de prompt): catálogo filtrado por usuário, validação no handler, tenant scoping injetado, user Postgres com GRANT mínimo, RLS opcional, validação Zod, audit + rate limit.
7. **Postgres MCP (Crystal DBA) também em ambiente dev/DBA** — uso de produtividade, separado do MCP semântico de produção.
8. **Protocolo Odoo: JSON-RPC.** O XML-RPC do Odoo quebra no `fields_get` de modelos com metadados `None` (customização SPED da Tauga). A F0 comprovou JSON-RPC estável. Cliente em `src/worker/odoo/client.ts`.

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

### Modo autônomo — regra de continuidade (inegociável)

**Modo autônomo é o padrão e significa seguir sozinho do começo ao fim.** Uma
vez iniciado o trabalho de uma fase, Claude percorre as etapas `[2]→[10]` —
e encadeia uma fase na seguinte (F2→F3→F4...) — **sem parar para pedir
permissão de continuar**. Não existe checkpoint de "posso seguir?" entre
etapas autônomas. Concluiu uma etapa, começa a próxima.

Claude só interrompe e chama o humano nos pontos marcados `requer humano`:
**[1] Brainstorm** (entrada de requisitos), **[11] `/ultrareview`** (disparo
manual), **[12] Deploy** (validação final) e o **merge de PR para `main`**.
Erro/bloqueio real também interrompe. Fora disso: não chamar o humano, não
perguntar se pode prosseguir — seguir até o fim do escopo combinado.

Ao terminar tudo, aí sim chamar o humano com o resumo final.

**[1] Brainstorm → SPEC v1** — `superpowers:brainstorming`. Output: spec v1 em `docs/superpowers/specs/`.
**[2] Design UI/UX** — `ui-ux-pro-max`. Autoridade de design. Sempre antes de qualquer UI. Alimenta a spec e o plano.
**[3–4] Double-check da SPEC — REGRA DE RAIZ, inegociável.**
> A spec passa por **duas reviews genuinamente críticas** antes de virar plano.
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
> - **Fase enxuta** (ex.: F0): executar **inline**, task a task.
> - **Fase grande** (ex.: F1): `superpowers:subagent-driven-development` — subagente fresco por task, com revisão entre tasks. Usar subagentes críticos, que já identificam problemas durante a execução, não só no review.
> - `superpowers:test-driven-development` dentro de cada task com código testável.
> `/gsd-code-review` e `/gsd-ui-review` permanecem como auditorias pontuais na etapa [10] — é o único uso da família `gsd-*`.

**[9] Verificação** — `superpowers:verification-before-completion`. Evidência antes de afirmar pronto. Testar feature na UI quando aplicável.
**[10] Auditoria final** — `/gsd-code-review` (bugs, segurança, qualidade) + `/gsd-ui-review` (6 pilares visuais, sempre que tocar UI).
**[11] `/ultrareview`** — só quando o humano disparar. Nunca autonomamente.
**[12] Deploy assistido** — descrever cada passo; validar com humano no fim, sempre.

### Quando fazer spec
Fazer spec antes do plano quando o requisito é ambíguo, tem múltiplas interpretações, ou toca vários sistemas. Pular quando já é objetivo, bug fix diagnosticado, ou ajuste pontual. Em dúvida: fazer spec.

---

## 7. Fluxo de Git

Documento canônico: **`docs/git-workflow.md`**. Em resumo:
- Nunca commitar direto na `main` (protegida = produção).
- Toda mudança: feature branch → teste local → PR → review → merge.
- Deploy de produção dispara só no merge da `main` — decisão humana.
- Claude **coordena e nomeia** todas as branches, abre os PRs, controla o ciclo.
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
- **Infra:** VPS Hostinger + Portainer + Docker + Traefik (SSL Let's Encrypt); CI/CD GitHub Actions → `ghcr.io/jvzanini/nexus-odoo` → redeploy.
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
