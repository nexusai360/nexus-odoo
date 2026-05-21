# HANDOFF — F4 Onda 2: Correções Críticas (sessão de retomada)

> Criado: 2026-05-21 · Branch: `feat/f4-onda2-mcp-escrita` · Repo: `github.com/nexusai360/nexus-odoo`
>
> **LEIA ESTE ARQUIVO PRIMEIRO.** Ele consolida a indignação do usuário com a entrega da
> F4 Onda 2 e define exatamente o que corrigir. O usuário vai **re-enviar o texto da
> indignação dele** no início da próxima sessão — cruzar este documento com aquele texto
> para confirmar que nada foi esquecido. O texto re-enviado é COMPLEMENTO, não substituição.

---

## 0. Como conduzir a sessão de retomada

1. Ler este handoff + `STATUS.md` + `CLAUDE.md` + `AGENTS.md`.
2. Aguardar o usuário re-enviar o texto da indignação; cruzar com a §2 abaixo.
3. Pedir ao usuário (ver §3) o que falta: credenciais da base de teste e a lista dos 12 issues.
4. **Montar um plano de correção** (`docs/superpowers/plans/`) cobrindo tudo da §2.
5. **Double review do plano** (metodologia `CLAUDE.md §6 [6][7]`): review crítica #1 → plan v2 → review crítica #2 → plan v3. Reviews reais e adversariais, não carimbo.
6. Executar o plan v3 **na sessão principal, modelo Opus 4.7, sem delegar para subagente**. UI com `ui-ux-pro-max` obrigatório.

**Regras de modelo (já aplicadas no `CLAUDE.md §6[8]`):**
- Opus 4.7 sempre — Sonnet 4.6 proibido para qualquer trabalho.
- Execução na sessão principal, inline. Não delegar por padrão.
- Se algum dia delegar: só com arquivo de briefing de contexto completo, e o subagente também em Opus 4.7.
- UI/frontend: exclusivamente sessão principal + `ui-ux-pro-max`. Inegociável.

---

## 1. Verificações factuais já feitas (2026-05-21)

| Item | Resultado |
|---|---|
| **Conexão Odoo leitura** (`grupojht.tauga.online`, user `joaozanini`) | ✅ **FUNCIONA** — testado ao vivo: autenticou (uid 11), Odoo 17.0, retornou `res.partner` reais |
| **Conexão Odoo escrita / base de teste** (`grupojht.teste.tauga.online`) | ❌ **NUNCA testada.** `.env.local` não tem `ODOO_WRITE_*`. `clientFromEnv("write")` faz fallback para produção. A URL de teste nunca foi configurada |
| **Testes E2E de escrita real** | ❌ **Não rodaram.** Os 1519 testes são unitários com **mocks**. `poc-happy-path` foi **skipped** por falta de credenciais. Nenhuma escrita real no Odoo foi exercida |
| **Erro de console `TabsTrigger`/`nativeButton`** | ✅ Corrigido (commit `ff46692`) — `nativeButton={false}` nas 4 rotas do painel |

**Conclusão honesta:** o backend da Onda 0 (schema, migration, pipeline auth/idempotency/
capability/rate-limit, sync direcionado, audit) **existe e passa 1519 testes unitários** —
isso é real. Mas **não há prova E2E de que a escrita no Odoo funciona** (regra de raiz do
`CLAUDE.md §6[9]` violada), e **toda a UI precisa ser refeita**.

---

## 2. Tudo que está errado e precisa ser corrigido

### 2.1. Teste E2E de escrita real (BLOQUEADOR — regra de raiz)

- Configurar `ODOO_WRITE_URL=https://grupojht.teste.tauga.online` + `ODOO_WRITE_DB` + `ODOO_WRITE_USER` + `ODOO_WRITE_PASSWORD` no `.env.local` (credenciais a obter com o usuário — §3).
- Rodar o script `discovery/check-mcp-nexus-module.py` para confirmar que `module = mcp_nexus` está livre em `ir.model.data`.
- Rodar de verdade os testes E2E de escrita (`mcp/__tests__/e2e/poc-happy-path.test.ts`) contra a base de teste: criar partner real, conferir no Odoo, conferir no cache, conferir no audit log. Fazer create → e desfazer (unlink) conforme o usuário autorizou ("você faz a alteração e depois desfaz").

### 2.2. UI — refazer TODO o painel "Servidor MCP" do zero

O usuário reprovou **integralmente** a UI (feita por subagentes Sonnet — erro de processo).
Refazer na sessão principal, Opus 4.7, com `ui-ux-pro-max`, **no padrão de fonte/espaçamento/
componentes do resto da plataforma** (referência canônica: `src/components/integracoes/
webhooks-content.tsx` e `api-keys-content.tsx`). Componentes a refazer:

- `src/components/integracoes/servidor-mcp/visao-geral.tsx` — usuário: "não entendi nada o que tem aquela tela de visão geral", "top 5 métricas" confuso, **fontes gigantes** fora do padrão. Repensar o que a tela mostra e simplificar.
- `src/components/integracoes/servidor-mcp/chaves-lista.tsx` — tela de **criar chave de acesso** descrita como "horrível", "uma desgraça". Modal denso, com scroll, campos largos demais (ver screenshot). Refazer.
- `src/components/integracoes/servidor-mcp/logs-timeline.tsx` — "não dá pra entender porra nenhuma", modal ao clicar, fora do padrão de fonte. Logs são válidos no escopo, mas a apresentação está ruim. Refazer com clareza.
- `src/components/integracoes/servidor-mcp/docs-*.tsx` (docs-renderer, docs-layout, docs-catalog) — documentação "uma verdadeira merda", sem exemplos, feia. **Refazer usando como referência o PDF `screencapture-nfe-nexusai360-api-docs-2026-05-21-00_17_11.pdf`** (documentação da API do projeto NFE Nexus, que o usuário aprovou — está em `~/Downloads/`; projeto em `~/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-nfe`).
- Navegação de abas (Visão Geral / Chaves de Acesso / Logs / Documentação) — usuário não sabe em qual aba está. A aba ativa não é destacada. Hoje cada aba é uma rota separada com `<Tabs>` próprio. Repensar: indicação clara de aba ativa.
- Telas com **fonte fora do padrão** — auditar todos os tamanhos contra o design system. O resto do app tem um padrão de tipografia; o painel MCP não seguiu.

### 2.3. "Plugar MCPs" — conceito ERRADO, refazer do zero

- **O que o subagente fez (errado):** uma tela em `Agente Nex → Plugar MCPs` mostrando o endpoint do NOSSO servidor MCP + token de serviço (`MCP_SERVICE_TOKEN`) + instruções focadas em n8n. Diz "MCP inacessível" mesmo com tudo configurado.
- **O que era para ser (combinado no brainstorm de 2026-05-20):** "Plugar MCPs" é onde o usuário **pluga MCPs EXTERNOS no Agente Nex** — servidores MCP de terceiros (Slack, GitHub, etc) para *munir/agregar capacidades ao Agente Nex*. O Nex como **cliente** de MCPs externos. Não tem nada a ver com expor o nosso MCP, nem com n8n.
- **Correções:**
  - Refazer a tela para o conceito correto: cadastrar/listar/remover MCPs externos que o Agente Nex consome.
  - n8n NÃO é o foco — o consumo do nosso MCP por terceiros (qualquer serviço) é outra coisa, e vive em `Integrações → Servidor MCP`, não aqui.
  - O `MCP_SERVICE_TOKEN`: o usuário não sabe onde criar/gerar/copiar. Hoje é uma env var. Decidir: a UI gera e gerencia o token? Ou explica claramente que é env var e como configurar? O usuário precisa de um caminho claro — "não tem nada lá, não consigo copiar, não sei onde pego".
  - Corrigir o "MCP inacessível": investigar por que o health check reporta inacessível mesmo com o serviço no ar (provável: `MCP_URL` não setada, ou o container `mcp` não está rodando localmente — só o `app` está).

### 2.4. Erro de console / issues

- `TabsTrigger`/`nativeButton` — ✅ corrigido (commit `ff46692`).
- **12 issues** mencionados pelo usuário — só 1 foi informado (o TabsTrigger). Pedir a lista dos outros 11 na retomada (ver §3).

### 2.5. CLAUDE.md / processo

- ✅ Já corrigido (commit `ff46692`): `CLAUDE.md §6[8]` — Opus 4.7 sempre, sessão principal, não delegar, UI com ui-ux-pro-max.
- ✅ Memória atualizada: `feedback_subagent-model-strategy.md`.

---

## 3. O que pedir ao usuário na retomada

1. **Credenciais da base de teste** `grupojht.teste.tauga.online` — usuário e senha (para `.env.local` → `ODOO_WRITE_*`). Sem isso não há teste de escrita real.
2. **A lista dos 12 issues** — só foi informado o erro do `TabsTrigger`. Pedir os outros 11 (ou onde vê-los: editor? console? lint?).

---

## 4. Estado técnico atual (o que existe na branch)

- **Backend Onda 0:** schema (`ApiKey`/`McpAuditLog` estendidos, `McpIdempotencyRecord`), migration `20260521001439_f4_onda2_mcp_writes` aplicada no DB local, `OdooClient` com métodos de escrita, pipeline externo (`mcp/dispatcher/external-pipeline.ts`), auth dual, idempotency, capability check, rate limit, sync direcionado, audit, health check, tools POC `crm.res_partner.{get,create}`. 1519 testes unitários passando, `tsc` + `build` OK.
- **UI:** painel `Integrações → Servidor MCP` (4 abas) + `Agente Nex → Plugar MCPs` — **REPROVADA, refazer.**
- **PR #10** aberto (`github.com/nexusai360/nexus-odoo/pull/10`) — **NÃO mergear** antes das correções.
- Spec: `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` (v3).
- Plano Onda 0: `docs/superpowers/plans/2026-05-20-f4-onda2-onda0-fundacao.md` (v3).

---

## 5. Sequência da sessão de retomada (resumo)

```
1. Ler handoff + STATUS + CLAUDE.md + AGENTS.md
2. Usuário re-envia texto da indignação → cruzar com §2 deste doc
3. Pedir credenciais base de teste + lista dos 12 issues (§3)
4. Montar PLANO de correção (cobre §2.1 a §2.4)
5. Review crítica #1 → plan v2 → Review crítica #2 → plan v3
6. Executar plan v3 — sessão principal, Opus 4.7, ui-ux-pro-max
   - Refazer UI do painel Servidor MCP (visão geral, chaves, logs, docs)
   - Refazer "Plugar MCPs" com o conceito correto
   - Configurar ODOO_WRITE_* + rodar testes E2E de escrita REAIS
   - Corrigir os 12 issues
7. Verificação E2E real + /gsd-code-review + /gsd-ui-review
```
