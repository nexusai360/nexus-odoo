# nexus-odoo — Workflow e Contexto do Projeto

> Carregado automaticamente em toda sessão. Define como conduzir o trabalho.
> Sobrescreve regras globais quando houver conflito específico.

---

## 1. Sobre o projeto

**Cliente:** Matrix Fitness Group (mesma do projeto irmão `nexus-insights`).
**Domínio:** empresa de movimentação e entrega de equipamentos de academia no Brasil — estoque, financeiro, fiscal, comercial.
**ERP de origem:** Odoo da comunidade (OCA Brasil), instância Tauga (`grupojht.tauga.online`), implantado por terceiros.

**Não temos acesso ao banco de dados do Odoo.** O único acesso é a **API XML-RPC** (usuário + senha). Toda extração passa por ela.

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
                                                    │ XML-RPC
                                           ┌────────┴────────┐
                                           │  Odoo Tauga     │
                                           └─────────────────┘
```

**Monorepo único**, múltiplos serviços/containers:

```
nexus-odoo/
├── app/      → Next.js — o dashboard            (container "app")
├── mcp/      → servidor MCP semântico            (container "mcp")
├── worker/   → cron de sincronização XML-RPC     (container "worker")
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

Ordem: **F0 → F1 → F2 → F3 → F4 → F5**. F3 e F4 podem ser paralelas após F2.
**Cada sub-projeto tem sua própria spec → plan → execução.** Não se planeja tudo de uma vez.

---

## 5. Decisões canônicas já tomadas (não rediscutir sem motivo)

1. **Cache local é obrigatório.** Dashboard e MCP leem do Postgres interno, nunca do Odoo ao vivo.
2. **Sem fallback XML-RPC nas tools.** O Odoo é tocado **somente** pelo cron de sincronização. Nenhuma pergunta de usuário dispara chamada ao Odoo. Toda tool retorna o timestamp da última sync (`atualizado há Xs`).
3. **A IA consulta via ferramentas semânticas (MCP próprio), não text-to-SQL livre.** Tools de vocabulário de negócio (`faturamento_no_periodo`, `estoque_modelo`...), cada uma código TS validado/testado/auditado.
4. **Não usar DuckFly.** MCP próprio em TypeScript com `@modelcontextprotocol/sdk`.
5. **Caminho 3 — perguntas fora do catálogo:**
   - **3a** métrica inexistente no escopo → resposta de falta honesta + log de gap (`feature_requests`).
   - **3b** fora do escopo de negócio → recusa educada.
   - **3c** modo BI/avançado → **Postgres MCP** (text-to-SQL controlado, read-only), restrito a perfil admin/analista, resposta com aviso de "consulta dinâmica".
6. **RBAC estrutural em 7 camadas** (não depende de prompt): catálogo filtrado por usuário, validação no handler, tenant scoping injetado, user Postgres com GRANT mínimo, RLS opcional, validação Zod, audit + rate limit.
7. **Postgres MCP (Crystal DBA) também em ambiente dev/DBA** — uso de produtividade, separado do MCP semântico de produção.

---

## 6. Workflow por fase

Cada sub-projeto percorre o fluxo abaixo. Classificar o esforço pela demanda — não matar mosca com fuzil.

```
[1] BRAINSTORM ──────────────────────► requer humano
[2] DESIGN UI/UX ────────────────────┐
[3] PLAN v1 ─────────────────────────│
[4] REVIEW PROFUNDA #1 ──────────────│ autônomo
[5] PLAN v2 ─────────────────────────│
[6] REVIEW PROFUNDA #2 ──────────────│
[7] EXECUÇÃO (GSD) ──────────────────│
[8] VERIFICAÇÃO ─────────────────────│
[9] CODE REVIEW + UI REVIEW ─────────│
────────────────────────────────────
[10] /ultrareview ───────────────────► requer humano (manual, opcional)
[11] DEPLOY ASSISTIDO ───────────────► requer humano (validação final)
```

**[1] Brainstorm** — `superpowers:brainstorming`. Output: spec em `docs/superpowers/specs/`.
**[2] Design UI/UX** — `ui-ux-pro-max`. Autoridade de design. Sempre antes de qualquer UI. Alimenta o plano.
**[3] Plan** — `superpowers:writing-plans`. Plano com tasks bite-sized, sem placeholders. Salvo em `docs/superpowers/plans/`.
**[4–6] Double-check do plano** — duas reviews críticas (v1→v2): #1 captura o óbvio (lacunas, ordem, premissas), #2 captura o sutil (granularidade, integração, testabilidade).

**[7] Execução — GSD (mudança em relação ao LP Nexus 360).**
> Este projeto é **multi-fase com roadmap** — o cenário em que o GSD supera o `subagent-driven-development`. Usamos a família **`gsd-*`** para a execução: estrutura de fases, execução por fase com paralelização em waves, controle de estado e commits atômicos.
> O `subagent-driven-development` do LP era adequado a um projeto single-shot (landing page); **não é o caso aqui**.
> **Ponte writing-plans → GSD:** o PLAN produzido em [3]/[5] alimenta a execução GSD. Na primeira execução real (F0/F1) validar o encaixe do formato e ajustar este documento se necessário.
> `superpowers:test-driven-development` continua aplicado dentro de cada task com código testável.

**[8] Verificação** — `superpowers:verification-before-completion`. Evidência antes de afirmar pronto. Testar feature na UI quando aplicável.
**[9] Auditoria final** — `/gsd-code-review` (bugs, segurança, qualidade) + `/gsd-ui-review` (6 pilares visuais, sempre que tocar UI).
**[10] `/ultrareview`** — só quando o humano disparar. Nunca autonomamente.
**[11] Deploy assistido** — descrever cada passo; validar com humano no fim, sempre.

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
