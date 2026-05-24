# Review Crítica #2 — F4 Onda 2 (MCP Escrita)

> **Reviewer:** Claude Opus 4.7 (Esta sessão — modo adversarial intensificado)
> **Spec alvo:** `docs/superpowers/specs/2026-05-20-f4-onda2-mcp-escrita-design.md` v2
> **Data:** 2026-05-20
> **Postura:** Auditoria adversarial **mais profunda que a #1**. A v2 corrigiu 41 itens; esta review caça o que **escapou**, o que **apareceu** com a reescrita, e os **detalhes operacionais** ainda soltos. Se não achar nada material, falhou.

## Resumo Executivo

V2 está significativamente melhor que v1. Porém:

- **3 contradições novas** introduzidas pela reescrita da arquitetura dual (auth interno vs externo).
- **5 gaps técnicos operacionais** que só aparecem quando se pensa em runtime (não em design).
- **7 lacunas em testes E2E** — cenários que §19.3 ainda não cobre.
- **4 detalhes de implementação ambíguos** que vão gerar dúvida no plano.
- **3 questões de segurança/operacionais** que merecem nota.
- **2 ajustes de redação** para evitar confusão futura.

**Total: 24 itens acionáveis.**

Conclusão: aplicar achados → produzir **v3**. A v3 estará pronta para virar plano.

---

## A. Contradições novas introduzidas pela reescrita (3)

### A1. Endpoint do modo interno: `/api/mcp/internal` vs Bearer-discriminado

**Onde:** §3.1 (diagrama mostra `/api/mcp/internal`) vs §6.1 (URL única `https://app.nexus-odoo/api/mcp`) vs §21.1 (critério "Endpoint `POST /api/mcp` aceita Bearer externo... preserva modo interno em `/api/mcp/internal` (ou via header `MCP_SERVICE_TOKEN`)").

**Problema:** Spec oscila entre **dois endpoints separados** (mais limpo, fácil de firewall/proxy) ou **um endpoint que distingue por valor do Bearer** (mais simples, menos config).

**Correção v3:** **Decidir: um endpoint só, distinção por valor do token.** Justificativa:
- `MCP_SERVICE_TOKEN` é único, fixo, conhecido pelo servidor → comparação `timingSafeEqual` antes de buscar em `ApiKey`.
- Se `Bearer == MCP_SERVICE_TOKEN` → modo interno (lê `X-Mcp-User-Id`, sem `Idempotency-Key`, capabilities=full-read+nenhum-write).
- Senão → modo externo (busca em `ApiKey`, valida capabilities, exige `Idempotency-Key` para writes).
- Razão: um endpoint = uma URL no painel "Visão geral"; o n8n e clientes externos descobrem MCP em uma rota só (padrão MCP). Modo interno é detalhe de implementação.

Atualizar §3.1, §6.1, §21.1 para uma única URL `https://app.nexus-odoo/api/mcp`.

### A2. Modo interno define "capabilities" implícitas — onde?

**Onde:** §1.3 (princípio 1) diz "modo interno incompatível com WriteToolEntry → 403". §7 Camada 3 repete. Mas a v2 não define **quais reads** o modo interno enxerga.

**Problema:** Modo interno hoje (existente em `mcp/`) usa `UserContext` com `dominio` + `gatedRoles` — controle por **usuário**, não por capability. A v2 introduz capabilities apenas no modo externo. Mas então: como o modo interno autoriza reads? Continua com o controle `UserContext`-based? Sim, mas spec não documenta essa coexistência claramente.

**Correção v3:** Adicionar subseção §7.1 "Coexistência de dois modelos de autorização":
- Modo interno: autoriza via `UserContext.dominio` + `gatedRoles` + `sempreVisivel` (mecanismo existente em `mcp/catalog/registry.ts`).
- Modo externo: autoriza via `ApiKey.capabilities` (mecanismo novo).
- **`WriteToolEntry` é sempre incompatível com modo interno** (independente do `UserContext`).
- Tools de leitura podem ter ambos os mecanismos aplicáveis dependendo do modo de acesso.

### A3. `ApiKey.scopes` deprecated — mas `default("[]")` ainda existe

**Onde:** §4.1 mantém `scopes Json @default("[]")` marcado como "DEPRECATED — preservado para migração; novo: capabilities".

**Problema:** Manter o campo como DEPRECATED indefinidamente é gambiarra. Novos consumidores podem ler `scopes` por engano. Pior: testes podem usar `scopes` em mock.

**Correção v3:** Política explícita:
1. Onda 0: migration popular `capabilities` a partir de `scopes` (script de migração de dados).
2. Onda 0: marca `scopes` como `@deprecated` no Prisma (anotação `///` doc); todas as queries do nosso código param de usar `scopes`.
3. Onda 1 (ou onda definida): migration final DROP `scopes`.
4. Documentar essa transição como TBD na §22 com prazo.

---

## B. Gaps técnicos operacionais (5)

### B1. Bootstrap da primeira chave externa

**Onde:** Não mencionado.

**Problema:** Onda 0 entrega o painel `Servidor MCP → Chaves de Acesso`. Para o super_admin criar uma chave, ele já precisa estar **autenticado no painel** (que usa NextAuth, não MCP key). OK. Mas em qual ambiente (`grupojht.teste`) testamos sem ter ainda chave criada?

**Implicação:** Os primeiros testes E2E precisam:
1. Migration roda (cria tabelas vazias).
2. Test setup cria uma `ApiKey` direto via Prisma (sem passar pelo painel) com capabilities estáticas.
3. Test usa essa key para chamar tools.

Sem essa "bootstrap key", testes E2E falham antes de qualquer chamada.

**Correção v3:** Adicionar §19.5 "Setup de testes E2E" detalhando:
- Fixture cria chave externa de teste via factory `createTestApiKey(capabilities)`.
- Token retornado pela factory é usado pelo test client HTTP.
- Cleanup deleta a chave em `afterAll`.

### B2. Como o servidor MCP **descobre** as ApiKeys (cache de lookup)

**Onde:** §3.1 diz "SHA-256(token) → SELECT em ApiKey por keyHash". §8.3 fala em pub/sub para hot reload.

**Problema:** A cada requisição, SELECT no banco para validar token = N queries por segundo. Em alta carga, é gargalo. Solução padrão é cache em memória; mas a v2 só menciona "cache em memória" no contexto do hot reload, sem definir formato.

**Correção v3:** Adicionar §3.4 "Cache de ApiKeys em memória":
- LRU cache (`lru-cache` lib) com TTL 60s; size = 1000 entries.
- Key do cache: `keyHash`.
- Value: full `ApiKey` row + capabilities parsed.
- Hot reload via pub/sub invalida entry específico (`mcp:keys:invalidated:<apiKeyId>` → cache.delete por `apiKeyId`).
- Fallback: TTL natural de 60s pega mudanças que pub/sub perdeu.

### B3. Como o servidor MCP sabe que processo de cron está vivo (pra freshness do cache)

**Onde:** §15.2 "Status: ● Ativo/Degradado/Offline" e §25 (health check tem `sync_directed_lag_ms`) mas não cobre staleness do cache do read.

**Problema:** Se o cron incremental (3min) parar, o cache fica stale. Reads continuam respondendo (sucesso), mas com dados antigos. Cliente n8n não percebe. **Gap silencioso.**

**Correção v3:** Adicionar ao health check (§25):
- `cache_freshness_seconds`: `now() - max(last_sync_at)` (timestamp da última escrita do cron incremental no cache).
- Se `> 600` (10 min): status do health = `degraded`.
- Se `> 3600` (1h): status = `unhealthy`.
- Painel "Visão geral" exibe "Cache atualizado há Xs".

### B4. Logs de denial preservam payload?

**Onde:** §10.4 (mascaramento de PII) + §4.2 (`McpAuditLog.payload`).

**Problema:** Se uma chamada é negada por capability missing (Camada 3), o payload chegou ao servidor mas não foi processado. Spec diz "Toda chamada registrada (success E denied)" mas não esclarece se o `payload` é gravado em denials. Implicação:
- Se grava → pode vazar tentativa maliciosa com dados sensíveis.
- Se não grava → perde forensics.

**Correção v3:** Política:
- Denials por **`unauthorized`** (token inválido) → audit grava só metadados (token hash truncado, IP, user-agent). Sem payload (token inválido = não confiar em nada).
- Denials por **`capability_missing` / `forbidden_via_internal_auth` / `rate_limited`** → audit grava payload com redaction (§10.4 aplicado). Forensics mantido.
- Documentar em §10.4.

### B5. Failover do Redis (durante a operação)

**Onde:** Não mencionado.

**Problema:** Redis é crítico — auth cache, idempotency lock, rate limit, sync queue. Se Redis cai:
- Auth: cache miss → vai ao DB (OK, mais lento).
- Idempotency lock: `SET NX` falha → o que fazer? Aceitar a write sem lock (perigoso) ou recusar tudo (downtime)?
- Rate limit: incremento falha → aceitar sem limite (perigoso) ou recusar?
- Sync queue: write conclui no Odoo mas job não enfileira → cache stale.

**Correção v3:** Adicionar §B (novo subapêndice ou seção dentro de §11) "Comportamento sob falha do Redis":
- **Auth cache miss → DB direto** (degrada performance, mantém correto).
- **Idempotency lock indisponível → recusa writes** com 503 `idempotency_unavailable`. (Fail closed; melhor recusar que duplicar.)
- **Rate limit indisponível → modo permissivo com alerta** (fail open com alarme — clientes legítimos não devem ser bloqueados por Redis caído).
- **Sync queue indisponível → write segue, mas registra `sync_failed` no audit** e o cron incremental pega na próxima janela.

---

## C. Lacunas em testes E2E (§19.3) (7)

A §19.3 tem boa cobertura mas faltam:

### C1. Tenant cross-leakage explícito
Cenário: criar 2 ApiKeys com `tenantId` diferentes; chave A tenta ler dados do tenant B → 403 + audit log. Crítico para multi-tenancy.

### C2. Chave expirada via `expiresAt`
Cenário: criar chave com `expiresAt = now() + 1ms`; aguardar; chamar → 401 `unauthorized` (`expired`). Verifica enforcement do `expiresAt`.

### C3. Rotação de chave durante chamada
Cenário: chave A está em uso ativo (10 req/s); rotacionar para chave A'; verificar que chave A continua válida até `revokedAt` (24h grace period); chave A' já funciona.

### C4. Capability adicionada dinamicamente (hot reload)
Cenário: chave sem `create:crm` chama tool → 403; editar chave no painel, adicionar `create:crm`; aguardar pub/sub propagar (<1s); chamar mesma tool → sucesso. Verifica hot reload.

### C5. Token vazado regenerado
Cenário: criar chave; "esquecer" de copiar (simular fechamento do modal); clicar "Marcar perdida e regenerar"; novo token funciona; antigo (nem chegou a ser usado) está revogado.

### C6. Catálogo filtrado: chave com só `read:crm` faz `tools/list` — só vê reads de CRM
Cenário: validação direta de Camada 1. `tools/list` retorna catálogo filtrado; chave sem `write:crm` não vê `crm.res_partner.create` na resposta.

### C7. Health check do MCP detecta Tauga offline
Cenário: derrubar conexão com Tauga (`docker stop` ou bloqueio de rede em ambiente de teste); chamar `/api/mcp/health` → status `degraded`; `odoo_write: fail`. Painel reflete.

**Correção v3:** Adicionar os 7 cenários acima a §19.3.

---

## D. Detalhes de implementação ambíguos (4)

### D1. Onde mora o catálogo de tools — em `mcp/catalog/` ou no banco?

**Onde:** §0.1 diz catálogo é estático em `mcp/catalog/registry.ts`. §8.2 versionamento de capability fala em `addedInVersion` no catálogo. §15.5 documentação auto-gerada do catálogo.

**Ambiguidade:** Catálogo é **código fonte** (TypeScript) ou **dados em DB**?

**Decisão v3:** **Código fonte**, conforme já existe em `mcp/catalog/`. Razões:
- Tools têm handlers (código). Não dá pra ser DB-only.
- `addedInVersion` vai como property estática do `ToolEntry`/`WriteToolEntry`.
- Documentação auto-gerada lê do catálogo em tempo de build (componente React importa o registry).
- "Changelog" do servidor MCP (§15.5) é texto MDX manuscrito (não derivado).

### D2. Sync direcionado: `snapshotAfter` vai do handler → middleware → worker. Formato exato?

**Onde:** §3.1 diagrama e §11.1.

**Ambiguidade:** O snapshot é o objeto retornado pelo handler ou um JSON minificado? Como passa pela fila (BullMQ)? E se for grande (>limite de payload do Redis)?

**Decisão v3:**
- Handler retorna `snapshotAfter: object` (raw JS object, não serializado).
- Middleware serializa via `JSON.stringify` ao enfileirar (BullMQ aceita até ~1MB por job; suficiente).
- Worker lê do job e faz UPSERT no cache via Prisma.
- Se snapshot >500KB (raro): worker descarta do job e faz `search_read` no Odoo direto (fallback).

### D3. Quem mapeia `cnpj_cpf` (vocabulário Brasil) → campo Odoo real

**Onde:** §5.5 menciona `mapInputToOdoo` mas é placeholder.

**Ambiguidade:** No Odoo (com l10n_br), o campo é `cnpj_cpf` mesmo? Ou `vat`? Ou `l10n_br_cnpj_cpf`?

**Decisão v3:** Discovery (§17) determina o nome real do campo por modelo. POC `crm.res_partner.create` da Onda 0:
- Confirma o nome do campo via `fields_get` na base de teste.
- `mapInputToOdoo` da tool faz o mapping concreto (sem inventar — usa o que existe).
- Documentar achado em `discovery/output/write_paths/crm.json`.

### D4. Comportamento de `If-Unmodified-Since` em multi-tabela (create com sub-objetos)

**Onde:** §13.

**Ambiguidade:** Se a write toca múltiplos registros (ex: `sale.order` com 10 lines), o header valida `write_date` de qual? Do parent? De todos?

**Decisão v3:**
- Onda 0 (POC `crm.res_partner.create`) não tem sub-objetos → defere a decisão para Onda 2 (vendas).
- Documentar como TBD em §22 com prazo Onda 2.

---

## E. Segurança / operacional (3)

### E1. Token de acesso aparece em URL? Em log?

**Onde:** Não mencionado.

**Problema:** Tokens só vão em header `Authorization`. Se o cliente acidentalmente passar em query string (`?token=...`), aparece em logs de proxy/CDN/access logs do Next.js. Vazamento silencioso.

**Correção v3:** Adicionar a §15.5 documentação:
- Token **sempre** em header `Authorization: Bearer ...`.
- Servidor MCP **recusa** tokens em query string ou body (`400 token_in_unsafe_location`).
- Middleware do Next.js/MCP nunca loga o header completo (mascarar para `Bearer mcp_live_aBcD****`).

### E2. CORS

**Onde:** Não mencionado.

**Problema:** Se o servidor MCP responde com CORS aberto (`Access-Control-Allow-Origin: *`), navegadores podem chamar (XSS em sites maliciosos). Mas alguns clientes precisam de CORS (apps web do cliente).

**Correção v3:** Adicionar §3.5 "CORS":
- Default: **CORS desabilitado** (responde sem header `Access-Control-Allow-Origin`).
- Por chave (no painel): opção "Permitir origens" com whitelist de domínios.
- Se whitelist vazia: rejeita Origin (response sem CORS header).
- Pré-requisito para chamada de browser: cliente cadastra `allowed_origins: ["https://meudominio.com"]` na chave.

### E3. Logs de erro do servidor MCP (Sentry, etc)

**Onde:** Não mencionado.

**Problema:** v2 menciona audit log mas não menciona logs operacionais (panics, exceptions do JS, deploy errors). Para produção, precisa de uma estratégia.

**Correção v3:** Adicionar §3.6 "Logging operacional":
- Usar `pino` (verificar se já em uso no projeto; senão, adicionar).
- Nível default: `info` em produção, `debug` em dev.
- Errors fatais → stdout estruturado (Portainer captura).
- Sentry opcional via env `SENTRY_DSN` — se setado, envia errors.
- **Audit log é separado** — DB via Prisma, cobre apenas chamadas de tool.

---

## F. Ajustes de redação (2)

### F1. "Decisão canônica #2" — confirmar numeração

**Onde:** §3.2.

**Problema:** v2 diz "decisão canônica #2" mas o `CLAUDE.md` pode ter sido alterado por outras sessões. Confirmar antes de aplicar.

**Correção v3:** Adicionar nota: "Verificar numeração atual no `CLAUDE.md` antes do merge — a decisão #2 atual fala de cache obrigatório e ausência de fallback."

### F2. "Defesa em profundidade — 7 camadas" — mas o texto cita 7?

**Onde:** §7.

**Problema:** Tabela tem 7 linhas mas Camada 5 é "guard-rail global" (não específica do nosso código). É confuso chamar de "camada de defesa" se é defesa do Odoo.

**Correção v3:** Renomear §7 para "Defesa em Profundidade — 6 camadas + guard-rail Odoo" e separar Camada 5 visualmente do resto (subseção ou nota).

---

## G. Validações que ainda precisam ser feitas antes do plano

Listar explicitamente itens que o plano vai precisar checar no início:

1. **Ler `mcp/auth/user-context.ts`** para confirmar como `UserContext` é resolvido hoje.
2. **Ler `mcp/lib/audit.ts`** para decidir: estender ou criar `McpAuditLog` novo.
3. **Ler `mcp/lib/rate-limit.ts`** para decidir: estender ou criar.
4. **Verificar `prisma/migrations/`** para entender padrão de migration usado no projeto.
5. **Confirmar se `pino` (ou outro logger) está em uso** no projeto antes de adicionar.
6. **Verificar `src/components/integracoes/`** — estrutura atual dos cards de Integrações para preservar padrão visual ao adicionar "Servidor MCP".
7. **Confirmar disponibilidade do submenu "Plugar MCPs" no Agente Nex** — onde fica essa parte do menu atualmente (procurar `src/components/agent/*` e `src/components/layout/sidebar.tsx`).
8. **Verificar `src/worker/odoo/client.ts`** — se já tem métodos `create`/`write`/`unlink` ou só `search_read`.

**Correção v3:** Adicionar §0.6 "Checklist de validação pré-plano" listando esses 8 itens; plano da Onda 0 começa por executar essas verificações.

---

## H. Ação consolidada para v3

### H.1. Mudanças estruturais

- A1: unificar endpoint `/api/mcp` com distinção por valor do Bearer.
- A2: §7.1 nova — coexistência de dois modelos de autorização (interno vs externo).
- A3: política de deprecation do `ApiKey.scopes` (rebatch para Onda 1 a remoção; TBD §22).

### H.2. Adições operacionais

- B1: §19.5 nova — setup de testes E2E com bootstrap key.
- B2: §3.4 nova — cache de ApiKeys em memória (LRU).
- B3: §25 expandido — `cache_freshness_seconds` no health check.
- B4: §10.4 atualizado — política de payload em denials.
- B5: novo subapêndice em §11 — comportamento sob falha do Redis.

### H.3. Cobertura de testes

- §19.3 ganha 7 cenários novos (C1-C7).

### H.4. Implementação

- D1: catálogo é código TypeScript (decidido).
- D2: snapshotAfter como object → JSON serializado em fila; fallback >500KB.
- D3: discovery confirma nome do campo `cnpj_cpf` antes da implementação da POC.
- D4: `If-Unmodified-Since` multi-tabela TBD para Onda 2.

### H.5. Segurança e operacional

- E1: §15.5 docs — token sempre em header; servidor recusa em URL/body.
- E2: §3.5 nova — política CORS (default fechado, opt-in por chave).
- E3: §3.6 nova — logging operacional (`pino`, opcional Sentry).

### H.6. Redação

- F1: nota verificando numeração da decisão canônica.
- F2: renomear §7 para "6 camadas + guard-rail".

### H.7. Validações pré-plano

- §0.6 nova — checklist de 8 verificações no código atual.

---

## I. Pronto para v3

Aplicar todos os achados acima na spec → produzir **v3**. A v3 é a versão **final** que vai virar plano. Se a v3 ainda esconder problemas materiais... eles vão aparecer no plan review #1 ou na própria execução. Padrão CLAUDE.md exige 2 reviews — feitas.

**Achados materiais nesta review:** 3 contradições + 5 gaps operacionais + 7 lacunas de teste + 4 ambiguidades + 3 itens de segurança + 2 ajustes de redação + 1 checklist de validação = **24 itens acionáveis**.

A v3 vai ser a base para o plano da Onda 0.
