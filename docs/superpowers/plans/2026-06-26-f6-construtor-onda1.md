# F6 Construtor de Relatórios , Onda 1 , Plano de Implementação (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o construtor de relatórios de tela cheia mínimo ponta a ponta: o
super_admin/admin descreve em linguagem natural, um agente monta uma ficha declarativa via
ferramentas, o motor genérico renderiza contra o dado real de estoque, e o relatório é salvo
como rascunho pessoal.

**Architecture:** Config-driven. A ficha é um `ReportEntry` estendido (reusa o tipo da F3),
validado por Zod. Um **registry de fontes** mapeia `fato → query + adaptadores de shape`. Um
**motor genérico** (rota dinâmica nova) resolve cada seção e renderiza com os componentes da
F3. As **tools de construção** são uma biblioteca de handlers TS chamada pelo agente via
tool-calling (sem servidor MCP separado nesta onda). O agente reusa a infra LLM existente
(`src/lib/agent/llm`), com modelo selecionável numa config própria do construtor.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Prisma v7, Zod, Postgres
cache, infra LLM existente (`src/lib/agent/llm`, providers OpenAI/Anthropic/...), Jest.

## Global Constraints

- **Só local até aprovação** (regra de raiz, topo do `CLAUDE.md`): sem merge para `main`, sem
  deploy, migration só em dev local.
- **Sem travessão** (`—`) em qualquer texto/código/comentário/commit. Usar vírgula/parênteses/dois-pontos.
- **Config-driven, nunca code-gen:** o agente só emite `ReportEntry` validado; fonte sempre por
  referência a query auditada; nada de SQL/React livre em runtime.
- **TDD:** todo código testável nasce de um teste que falha primeiro.
- **`ui-ux-pro-max` obrigatório** em qualquer task de UI; consistência com o design da plataforma.
- **Modelo Opus** em qualquer subagente. Português brasileiro em tudo.
- **Migration da F6 só em dev local** (Postgres compartilhado; seguir protocolo de schema).
- **Catálogo de fontes da onda 1:** apenas estoque (queries comprovadas em `src/lib/reports/queries/estoque.ts`).
- **1 template nesta onda:** `DataTable` (o mais config-driven). KPIRow/Bar/Pie são onda 2.

---

## Bloco A , Persistência da ficha (`SavedReport`)

### Task A1: Modelo `SavedReport` + migration (dev local)

**Files:**
- Modify: `prisma/schema.prisma` (adicionar modelo)
- Create (gerado): migration em `prisma/migrations/`

**Interfaces:**
- Produces: modelo Prisma `SavedReport { id, tipo, titulo, entry Json, schemaVersion Int,
  status, criadoPor, visibilidadeConsumo String[], etag, criadoEm, atualizadoEm }` e enums
  `SavedReportTipo { tela_cheia, widget }`, `SavedReportStatus { rascunho, publicado }`.

- [ ] **Step 1:** Adicionar ao `prisma/schema.prisma`:
```prisma
enum SavedReportTipo { tela_cheia widget }
enum SavedReportStatus { rascunho publicado }

model SavedReport {
  id                  String            @id @default(cuid())
  tipo                SavedReportTipo   @default(tela_cheia)
  titulo              String
  entry               Json
  schemaVersion       Int               @default(1)
  status              SavedReportStatus @default(rascunho)
  criadoPor           String
  visibilidadeConsumo String[]          @default([])
  etag                String            @default(cuid())
  criadoEm            DateTime          @default(now())
  atualizadoEm        DateTime          @updatedAt
  @@index([criadoPor, status])
}
```
- [ ] **Step 2:** Avisar (regra de schema) e rodar migration **em dev local**:
  Run: `npx prisma migrate dev --name f6_saved_report`
  Expected: migration criada e aplicada no Postgres dev; `npx prisma generate` ok.
- [ ] **Step 3:** Rodar `agente schema-changed` (protocolo multi-worktree).
- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(f6): modelo SavedReport (ficha de relatorio dinamico, rascunho/publicado)"
```

### Task A2: `ReportEntry` estendido + schema Zod

**Files:**
- Create: `src/lib/reports/builder/report-entry-schema.ts`
- Test: `src/lib/reports/builder/report-entry-schema.test.ts`

**Interfaces:**
- Consumes: `ReportEntry`, `ReportSection`, `ReportTemplate` de `src/lib/reports/types.ts`.
- Produces: `reportEntrySchema` (Zod) e tipo `BuilderReportEntry = ReportEntry & { tipo, parametros, schemaVersion }`;
  `validarReportEntry(input: unknown): { ok: true, entry } | { ok: false, erros: string[] }`.

- [ ] **Step 1: Teste que falha** , ficha mínima válida e ficha inválida:
```ts
import { validarReportEntry } from "./report-entry-schema";
test("aceita ficha minima de DataTable de estoque", () => {
  const r = validarReportEntry({
    id: "draft-1", titulo: "Saldo", dominio: "estoque", schemaVersion: 1, tipo: "tela_cheia",
    parametros: [], secoes: [{ id: "s1", template: "DataTable", fato: "fato_estoque_saldo",
      shapeDerivado: "tabela", config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] }, filtros: [] }],
  });
  expect(r.ok).toBe(true);
});
test("rejeita template fora do enum", () => {
  const r = validarReportEntry({ id: "x", titulo: "x", dominio: "estoque", schemaVersion: 1,
    tipo: "tela_cheia", parametros: [], secoes: [{ id: "s", template: "Hologram", fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: {}, filtros: [] }] });
  expect(r.ok).toBe(false);
});
```
- [ ] **Step 2:** Run `npx jest report-entry-schema -t "aceita ficha"` , Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `report-entry-schema.ts` com Zod: enums de `template` (só os 5 da F3),
  `shapeDerivado` (`kpis|tabela|agregacaoCategorica|serieTemporal`), `tipo`, `parametros[]`, `secoes[]`.
- [ ] **Step 4:** Run jest , Expected: PASS (ambos).
- [ ] **Step 5: Commit** `feat(f6): schema Zod do ReportEntry estendido (tipo, parametros, shapeDerivado)`

### Task A3: Repositório de `SavedReport` (CRUD rascunho com etag)

**Files:**
- Create: `src/lib/reports/builder/saved-report-repo.ts`
- Test: `src/lib/reports/builder/saved-report-repo.test.ts` (mock do Prisma como nos repos existentes)

**Interfaces:**
- Consumes: `validarReportEntry` (A2), PrismaClient.
- Produces: `criarRascunho(criadoPor, entry)`, `obterRascunho(id, userId)`, `atualizarRascunho(id, userId, entry, etag)`
  (rejeita etag divergente), `listarMeus(userId)`. Retornos com `{ id, etag, entry, ... }`.

- [ ] **Step 1: Teste que falha:** criar rascunho grava entry válido + etag; atualizar com etag
  errado lança `EtagConflitoError`; listarMeus filtra por `criadoPor`.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar repo (valida entry antes de gravar; gera novo etag a cada update).
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): repositorio de SavedReport (rascunho, etag otimista)`

---

## Bloco B , Registry de fontes + adaptadores de shape

### Task B1: Contrato de fonte + registry (estoque)

**Files:**
- Create: `src/lib/reports/builder/source-registry.ts`
- Test: `src/lib/reports/builder/source-registry.test.ts`

**Interfaces:**
- Consumes: as queries de `src/lib/reports/queries/estoque.ts` (`querySaldoProduto`, `queryValorArmazem`, etc.).
- Produces: tipo `SourceContract { fato, dominio, shapes: ShapeDerivado[], campos: Record<ShapeDerivado, CampoMeta[]> }`,
  `SOURCE_REGISTRY: Record<string, SourceEntry>` onde `SourceEntry = { contract, run(filtros): Promise<RawSourceData> }`,
  e `listarFontes(): SourceContract[]`, `obterFonte(fato): SourceEntry | undefined`.

- [ ] **Step 1: Teste que falha:** `listarFontes()` inclui `fato_estoque_saldo` com shapes
  `["kpis","tabela","agregacaoCategorica"]`; `obterFonte("inexistente")` é `undefined`.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar o registry para as fontes de estoque comprovadas (mapear cada
  `fato` para a query e declarar os shapes que ela oferece + os campos de cada shape).
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): registry de fontes de estoque com contrato de shapes`

### Task B2: Adaptadores de shape (extraídos das derivações dos wrappers)

**Files:**
- Create: `src/lib/reports/builder/shape-adapters.ts`
- Test: `src/lib/reports/builder/shape-adapters.test.ts`

**Interfaces:**
- Consumes: `RawSourceData` (B1).
- Produces: `adaptarTabela(raw): LinhaTabela[]`, `adaptarKpis(raw): Kpi[]`,
  `adaptarAgregacaoCategorica(raw, { topN }): { rotulo, valor }[]`. Cada adaptador puro e testável.

- [ ] **Step 1: Teste que falha** , dado um `raw` de saldo, `adaptarAgregacaoCategorica` devolve
  top-N por valor com `{ rotulo, valor }`; `adaptarKpis` devolve os escalares esperados.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar os adaptadores (portar a lógica de top-N/kpis que hoje vive nos
  wrappers de `report-data.ts`, agora como funções puras nomeadas por shape).
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): adaptadores de shape (tabela, kpis, agregacaoCategorica)`

### Task B3: Resolver de fonte (run + adapta + freshness)

**Files:**
- Create: `src/lib/reports/builder/resolve-source.ts`
- Test: `src/lib/reports/builder/resolve-source.test.ts`

**Interfaces:**
- Consumes: `SOURCE_REGISTRY` (B1), shape-adapters (B2), `estadoDoFato`/freshness existente.
- Produces: `resolveSecao(secao, filtros, ctx): Promise<{ dado, estado, erro? }>` , executa a fonte,
  aplica o adaptador do `secao.shapeDerivado`, anexa freshness.

- [ ] **Step 1: Teste que falha:** `resolveSecao` de uma seção DataTable/`tabela` sobre `fato_estoque_saldo`
  devolve `dado` no formato de linhas + `estado` de freshness; fonte inexistente devolve `{ erro }`.
- [ ] **Step 2:** Run jest (mock das queries) , Expected: FAIL.
- [ ] **Step 3:** Implementar `resolveSecao`.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): resolveSecao (executa fonte + aplica shape + freshness)`

---

## Bloco C , Motor de render genérico

### Task C1: Guard de domínio no resolver (consumo)

**Files:**
- Modify: `src/lib/reports/builder/resolve-source.ts` (injeta guard)
- Test: `src/lib/reports/builder/resolve-source.test.ts` (novo caso)

**Interfaces:**
- Consumes: `visibleDomains`/`guardDominio` de `src/lib/reports/domains.ts`, `UserContext`.
- Produces: `resolveSecao` passa a receber `user` e nega com `{ erro: "sem_acesso_dominio" }` quando
  o domínio da fonte não é visível ao usuário.

- [ ] **Step 1: Teste que falha:** usuário sem acesso a `estoque` recebe `{ erro: "sem_acesso_dominio" }`.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Injetar o guard no início de `resolveSecao`.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): guard de dominio reavaliado no consumo da ficha`

### Task C2: Componente motor `<ReportRenderer entry>`

**Files:**
- Create: `src/components/reports/builder/report-renderer.tsx`
- Test: `src/components/reports/builder/report-renderer.test.tsx`

**Interfaces:**
- Consumes: `resolveSecao` (B3/C1), `DataTable` de `src/components/charts/data-table.tsx`,
  `validarReportEntry` (A2).
- Produces: `ReportRenderer({ entry, dados })` , para cada seção mapeia `template` ao componente,
  injeta `dados[secao.id]`, e renderiza estados loading/erro/vazio padronizados.

- [ ] **Step 1: Teste que falha:** dado um `entry` com 1 seção DataTable e `dados` resolvidos,
  renderiza a `DataTable` com as colunas; seção com `erro` renderiza o aviso padronizado.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar `ReportRenderer` (nesta onda só o caso `DataTable`; `default` mostra
  "template ainda não suportado" sem quebrar). **Usar `ui-ux-pro-max` para os estados visuais.**
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): ReportRenderer generico (DataTable + estados)`

### Task C3: Rota dinâmica `/relatorios/d/[savedId]`

**Files:**
- Create: `src/app/(protected)/relatorios/d/[savedId]/page.tsx`
- Test: `src/app/(protected)/relatorios/d/[savedId]/page.test.tsx`

**Interfaces:**
- Consumes: `obterRascunho` (A3), `validarReportEntry` (A2), `resolveSecao` (C1), `ReportRenderer` (C2),
  sessão/usuário do padrão existente.
- Produces: página que carrega a ficha salva, valida contra o catálogo atual, resolve as seções e
  renderiza; ficha órfã (fonte/template removido) mostra erro explícito (não 404 silencioso).

- [ ] **Step 1: Teste que falha:** savedId inexistente → notFound; ficha válida → renderiza;
  ficha com fonte órfã → estado de erro explícito.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar a page (server component): carrega, valida, resolve seções (com `user`),
  passa para `ReportRenderer`.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): rota dinamica de relatorio /relatorios/d/[savedId]`

---

## Bloco D , Catálogo de componentes + tools de construção

### Task D1: Catálogo de componentes (DataTable) documentado

**Files:**
- Create: `src/lib/reports/builder/component-catalog.ts`
- Test: `src/lib/reports/builder/component-catalog.test.ts`

**Interfaces:**
- Produces: `ComponentEntry { chave, nome, paraQueServe, quandoUsar, quandoNaoUsar,
  shapeDerivadoExigido, parametros, interacao, tokensVisuais }` e `COMPONENT_CATALOG: ComponentEntry[]`
  (onda 1: só `DataTable`), `listarComponentes()`, `descreverComponente(chave)`.

- [ ] **Step 1: Teste que falha:** `descreverComponente("DataTable")` retorna `shapeDerivadoExigido: "tabela"`
  e os parâmetros; `descreverComponente("inexistente")` é `undefined`.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar o catálogo com a entrada `DataTable` no formato documentado da spec §6.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): catalogo de componentes documentado (DataTable)`

### Task D2: Validação de compatibilidade template x shape

**Files:**
- Create: `src/lib/reports/builder/compat.ts`
- Test: `src/lib/reports/builder/compat.test.ts`

**Interfaces:**
- Consumes: `COMPONENT_CATALOG` (D1), `SOURCE_REGISTRY` (B1).
- Produces: `checarCompatibilidade(secao): { ok: true } | { ok: false, motivo }` , confere que o
  `shapeDerivado` da seção é oferecido pela fonte E é o exigido pelo template.

- [ ] **Step 1: Teste que falha:** DataTable+`tabela`+`fato_estoque_saldo` → ok; DataTable+`serieTemporal` → erro.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar `checarCompatibilidade`.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): checagem de compatibilidade template x shape x fonte`

### Task D3: Biblioteca de handlers de construção

**Files:**
- Create: `src/lib/reports/builder/tools/index.ts` (catálogo de tools)
- Create: `src/lib/reports/builder/tools/handlers.ts`
- Test: `src/lib/reports/builder/tools/handlers.test.ts`

**Interfaces:**
- Consumes: A2 (validar), B1 (fontes), D1 (componentes), D2 (compat).
- Produces: `BUILDER_TOOLS` (catálogo com `name`, `descricao`, `inputSchema` Zod, `handler`) cobrindo
  `listar_componentes`, `descrever_componente`, `listar_fontes`, `prever_dado`, `criar_relatorio`,
  `adicionar_secao`, `editar_secao`, `remover_secao`, `definir_filtro`, `validar`. Cada handler recebe
  e devolve a ficha (estado imutável), validando a cada passo.

- [ ] **Step 1: Teste que falha:** `criar_relatorio` devolve ficha vazia válida; `adicionar_secao`
  com seção incompatível é rejeitado por `validar`/`checarCompatibilidade`; `prever_dado` de `fato_estoque_saldo`
  retorna os campos do shape.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar os handlers (cada um puro: `(ficha, args) => ficha'`), com enums fechados
  derivados de B1/D1.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): biblioteca de handlers de construcao (tools do construtor)`

---

## Bloco E , Agente construtor

### Task E1: Config de modelo do construtor

**Files:**
- Modify: `prisma/schema.prisma` (config própria do construtor) + migration dev local
- Create: `src/lib/reports/builder/agent/model-config.ts`
- Test: `src/lib/reports/builder/agent/model-config.test.ts`

**Interfaces:**
- Consumes: infra `src/lib/agent/llm` (`get-client`, `effective-catalog`, `LlmCredential`).
- Produces: `obterConfigModeloConstrutor()` e `definirConfigModeloConstrutor(provider, model)` , análogo
  ao `get-active-config` do Nex, porém com `uso: "construtor"`; resolve client por `get-client`.

- [ ] **Step 1: Teste que falha:** definir e obter a config do construtor; default sugerido openai/gpt-5-mini
  quando não configurado.
- [ ] **Step 2:** Migration dev local (`f6_builder_llm_config`) + jest , Expected: FAIL → implementar → PASS.
- [ ] **Step 3:** Implementar (reusar credenciais existentes; não duplicar chave).
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): config de modelo do construtor (reusa infra LLM do Nex)`

### Task E2: Loop do agente (tool-calling, teto, reparo, recusa)

**Files:**
- Create: `src/lib/reports/builder/agent/run-builder.ts`
- Test: `src/lib/reports/builder/agent/run-builder.test.ts`

**Interfaces:**
- Consumes: `BUILDER_TOOLS` (D3), `obterConfigModeloConstrutor` (E1), client LLM, `LlmUsage`/usage-logger.
- Produces: `runBuilder({ prompt, fichaAtual, user }): Promise<{ ficha, mensagem, recusa? }>` , loop
  agente↔tools com `MAX_ITER`, valida a ficha a cada passo, em erro devolve feedback ao modelo (até `MAX_REPAIR`),
  e em pedido sem fonte devolve `recusa` honesta + registra gap (`feature_requests`).

- [ ] **Step 1: Teste que falha (LLM mockado):** prompt simples gera ficha válida com 1 DataTable;
  prompt sem fonte gera `recusa` + chama registrar lacuna; estouro de `MAX_ITER` para com mensagem.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar o loop (mockar o provider nos testes; billing real via usage-logger).
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): loop do agente construtor (teto, reparo de ficha, recusa honesta)`

### Task E3: Teto de consumo de IA (bloqueio)

**Files:**
- Create: `src/lib/reports/builder/agent/quota.ts`
- Test: `src/lib/reports/builder/agent/quota.test.ts`

**Interfaces:**
- Consumes: `LlmUsage` (billing existente), config do construtor (E1).
- Produces: `verificarQuota(user): Promise<{ ok } | { bloqueado, motivo }>` , soma uso do período via
  `LlmUsage` e compara com o teto configurado; `runBuilder` chama antes de iniciar.

- [ ] **Step 1: Teste que falha:** uso acima do teto → `bloqueado`; abaixo → `ok`.
- [ ] **Step 2:** Run jest , Expected: FAIL → implementar → PASS.
- [ ] **Step 3:** Ligar `verificarQuota` no início de `runBuilder`.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): teto de consumo de IA do construtor (reusa LlmUsage)`

---

## Bloco F , Tela do construtor (chat + preview)

> **UI: usar `ui-ux-pro-max` em todas as tasks deste bloco. Reusar a mecânica de chat do
> Playground do Nex (`agente/playground`) e a animação de pensando da bubble. Consistência total
> com o design da plataforma. Sem mostrar mockups para validação (decisão do usuário).**

### Task F1: Server action `construirRelatorio`

**Files:**
- Create: `src/lib/actions/builder.ts`
- Test: `src/lib/actions/builder.test.ts`

**Interfaces:**
- Consumes: `runBuilder` (E2), `saved-report-repo` (A3), sessão/RBAC (gate super_admin/admin).
- Produces: action `construirRelatorio({ prompt, savedId? })` , gate de papel, chama `runBuilder`,
  persiste rascunho, devolve `{ ficha, mensagem, savedId, recusa? }`.

- [ ] **Step 1: Teste que falha:** papel sem acesso é rejeitado; admin gera e persiste rascunho.
- [ ] **Step 2:** Run jest , Expected: FAIL → implementar → PASS.
- [ ] **Step 3:** Implementar action.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): server action construirRelatorio (gate + persiste rascunho)`

### Task F2: Tela do construtor (layout split chat + preview)

**Files:**
- Create: `src/app/(protected)/relatorios/construtor/page.tsx`
- Create: `src/components/reports/builder/builder-chat.tsx`
- Create: `src/components/reports/builder/builder-preview.tsx`
- Test: `src/components/reports/builder/builder-chat.test.tsx`

**Interfaces:**
- Consumes: `construirRelatorio` (F1), `ReportRenderer` (C2), componentes de chat do Playground.
- Produces: tela com conversa à esquerda (mensagens + animação pensando) e preview à direita
  (valida estrutura barato; render sob demanda). Botão de salvar/abrir o relatório.

- [ ] **Step 1: Teste que falha:** enviar prompt chama `construirRelatorio` e renderiza a resposta +
  atualiza o preview; estado de "pensando" aparece durante a chamada.
- [ ] **Step 2:** Run jest , Expected: FAIL.
- [ ] **Step 3:** Implementar a UI com `ui-ux-pro-max` (reusando chat do Playground + bubble).
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): tela do construtor (chat + preview ao vivo)`

### Task F3: Seção Relatórios , cards dos rascunhos do usuário

**Files:**
- Modify: `src/app/(protected)/relatorios/page.tsx` (ou criar aba "Meus relatórios")
- Test: correspondente

**Interfaces:**
- Consumes: `listarMeus` (A3).
- Produces: lista de cards clicáveis dos relatórios do usuário, levando a `/relatorios/d/[savedId]`,
  e botão "Novo relatório" indo para `/relatorios/construtor`.

- [ ] **Step 1: Teste que falha:** lista mostra os rascunhos do usuário; clique navega para a rota dinâmica.
- [ ] **Step 2:** Run jest , Expected: FAIL → implementar (com `ui-ux-pro-max`) → PASS.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): cards de relatorios do usuario + entrada do construtor`

---

## Bloco G , Config de modelo (tela) + verificação E2E

### Task G1: Tela de configuração de modelo do construtor

**Files:**
- Create: `src/app/(protected)/relatorios/construtor/configuracao/page.tsx`
- Test: correspondente

**Interfaces:**
- Consumes: `obterConfigModeloConstrutor`/`definirConfigModeloConstrutor` (E1), catálogo de modelos
  (`effective-catalog`), credenciais (`agente/chaves`).
- Produces: tela no padrão visual da `agente/configuracao` (cards), com seleção de provedor+modelo e
  o teto de consumo; só super_admin.

- [ ] **Step 1: Teste que falha:** super_admin salva provedor+modelo e teto; não-super_admin é barrado.
- [ ] **Step 2:** Run jest , Expected: FAIL → implementar (com `ui-ux-pro-max`, espelhando o padrão do Nex) → PASS.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run jest , Expected: PASS.
- [ ] **Step 5: Commit** `feat(f6): tela de config de modelo do construtor (padrao do Agente Nex)`

### Task G2: Verificação E2E contra o dado real (critério de aceite)

**Files:**
- Create: `scripts/e2e-f6-construtor.ts` (8 prompts-alvo de estoque)
- Create: `docs/superpowers/plans/_f6-onda1-aceite.md` (registro do resultado)

**Interfaces:**
- Consumes: `runBuilder` (E2) com o LLM real configurado, dado real do cache (estoque), `ReportRenderer`.

- [ ] **Step 1:** Definir os 8 prompts-alvo (confirmar antes quais cortes de estoque existem; usar
  saldo/valor por armazém/família, que são comprovados; "por estado" só se houver fato).
- [ ] **Step 2:** Subir o stack local atualizado (rebuild se tocou caminho do `mcp`/`worker`).
- [ ] **Step 3:** Rodar o script: cada prompt deve gerar ficha válida que renderiza; medir 7/8 válidas,
  6/8 com template plausível, 2 pedidos sem fonte com recusa honesta, teto bloqueando.
- [ ] **Step 4:** Registrar evidências no doc de aceite. `tsc` raiz+mcp 0, `jest` verde.
- [ ] **Step 5: Commit** `test(f6): E2E do construtor contra dado real + criterio de aceite onda 1`

---

## Self-review (a fazer após v1, antes das reviews adversariais)

- Cobertura da spec v3: A (persistência §4.4), B (registry/adaptadores §4.2), C (motor §4.1),
  D (catálogo/tools §6/§4.6), E (agente §4.5/§4.8/§9), F (tela §4.7), G (config §4.8 + aceite §11).
- Placeholders: nenhuma task com "TBD"; cada uma tem arquivos, interfaces e steps testáveis.
- Consistência de tipos: `ReportEntry` estendido (A2) é o tipo usado por B/C/D; `shapeDerivado` é o
  vocabulário comum entre B1/B2/D1/D2.
- Pontos a endurecer nas reviews: detalhar o corpo de implementação de C2/F2 (UI), o formato exato do
  `prever_dado`, e os 8 prompts-alvo do E2E.
