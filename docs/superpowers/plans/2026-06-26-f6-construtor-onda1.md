# F6 Construtor de Relatórios , Onda 1 , Plano de Implementação (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou
> superpowers:executing-plans. Steps em checkbox (`- [ ]`).
> **v3** incorpora 2 reviews adversariais do plano (verificadas no código). Mudanças-chave do
> v1→v3 na seção "Correções aplicadas".

**Goal:** Construtor de relatórios de tela cheia mínimo ponta a ponta: admin descreve em
linguagem natural, um agente monta uma ficha declarativa via ferramentas, o motor genérico
renderiza contra o dado real de estoque, salvo como rascunho pessoal.

**Architecture:** Config-driven. Ficha = `ReportEntry` estendido (Zod). Registry mapeia
`(fato, shapeDerivado) → produtor` (query + adaptador). Motor genérico (rota dinâmica nova)
resolve cada seção e renderiza com `DataTable`. Tools de construção = biblioteca de handlers TS
chamados pelo agente via `ProviderClient.chat({ tools })` (já uniformiza OpenAI/Anthropic). Sem
servidor MCP separado nesta onda (handlers in-app). Modelo selecionável via `BuilderLlmConfig`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript, Prisma v7, Zod, infra LLM
existente (`src/lib/agent/llm`: `buildLlmClient`, `ProviderClient.chat`, `logUsage`), Jest.

## Global Constraints

- **Só local até aprovação** (regra de raiz do `CLAUDE.md`): sem merge para `main`, sem deploy,
  migration só em dev local + `agente schema-changed`.
- **Sem travessão** (`—`) em qualquer texto/código/comentário/commit.
- **Config-driven, nunca code-gen.** Fonte sempre por referência a query auditada.
- **TDD** (teste que falha primeiro), commits atômicos por task.
- **`ui-ux-pro-max` obrigatório** em toda task de UI; consistência com o design da plataforma.
- **Onda 1: domínio estoque; 1 template renderizável (`DataTable`).** Shapes `kpis`/
  `agregacaoCategorica` são declarados no registry (alimentam `prever_dado`) mas **sem render
  nesta onda** (KPIRow/Pie são onda 2).

---

## Correções aplicadas (das 2 reviews do plano, verificadas no código)

1. **Config de modelo = card na Configuração do Agente Nex (DECISAO DO USUARIO 2026-06-26, substitui
   o BuilderLlmConfig):** o modelo do construtor e mais um CARD em `agente/configuracao`, guardado em
   campos novos do singleton `AgentSettings` (`builderModelProvider`/`builderModelId`), no mesmo padrao
   dos cards de audio/imagem/raciocinio (`resource-card.tsx`/`reasoning-card.tsx`). SEM `BuilderLlmConfig`
   separado, SEM tela propria. Migration aditiva MANUAL. Seletor de modelo do catalogo `effective-catalog`,
   credenciais `LlmCredential` ja cadastradas. Teto de consumo NAO foi pedido pelo usuario nesta rodada:
   manter so a medicao via `LlmUsage` (`origin:"construtor"`); o teto duro fica opcional/onda seguinte.
2. **Consumo isolado:** `logUsage({ origin: "construtor" })` (campo `origin` já existe em
   `LlmUsage`); `verificarQuota` soma `LlmUsage` filtrado por `origin="construtor"`. Sem coluna nova.
3. **Registry `(fato, shapeDerivado) → produtor`** (não `fato → query`): para `fato_estoque_saldo`,
   `tabela` usa `querySaldoProduto`; `agregacaoCategorica` usa `queryConcentracao`; `kpis` usa os
   escalares de `querySaldoProduto`. Cada shape declara seu produtor.
4. **Tipos definidos explicitamente** (Task B0): `ShapeDerivado = "kpis"|"tabela"|"agregacaoCategorica"|"serieTemporal"`;
   `CampoMeta = { key, label, tipo }`; `RawSourceData = { linhas: Record<string,unknown>[], kpis?: Record<string,number>, freshness: Date|null }`;
   `SourceContract = { fato, modeloFonte, dominio, shapes: ShapeDerivado[], campos: Record<ShapeDerivado, CampoMeta[]> }`.
5. **`ReportEntry` do construtor:** entry ganha `+tipo +parametros +schemaVersion`; section ganha
   `+shapeDerivado`. `descricao`/`icone`/`modeloFonte` viram **opcionais com default gerado** no
   schema do builder (decisão tomada). `icone` restrito ao enum de `resolveReportIcon`
   (`Boxes|Coins|ArrowLeftRight|Clock|TrendingUp|PieChart`), nome inválido = erro.
6. **`ReportTemplate` tem 6 membros** (KPICard, KPIRow, DataTable, BarChart, LineChart, PieChart);
   o builder valida todos no enum mas só `DataTable` renderiza na onda 1.
7. **Guard via sessão:** usar `guardDominio(dominio)` (lê a sessão internamente); não inventar
   `UserContext`. Caminho real das derivações: `src/lib/actions/report-data.ts`.
8. **Freshness por fato:** registry expõe `modeloFonte` por fato; criar `freshnessPorFato({fato, modeloFonte})`
   (extrair de `report-data.ts`), não passar `ReportEntry`.
9. **Tool-calling:** `ProviderClient.chat({ messages, tools })` já devolve `toolCalls` uniformes.
   Task E1b só converte `BUILDER_TOOLS` (Zod) para o formato `tools` do `chat` e despacha.
10. **Casca de chat própria** (não refatorar `chat-panel`/`agent-bubble` do Playground, acoplados
    a SSE): reconstruir um chat leve reusando a estética da bubble.
11. **Recusa honesta:** registrar em `FeatureRequest` (modelo existe).
12. **Épicos quebrados:** D3→D3a/b/c/d; E2→E1b/E2a/E2b; F2→F2a/b/c/d; G2→G2a/b/c.
13. **Critério de aceite reformulado** (1 template só → "template plausível" não mede): ver G2.

---

## Bloco A , Persistência

- **A1 , Modelo `SavedReport` + migration dev local.** `prisma/schema.prisma` (modelo + enums
  `SavedReportTipo`, `SavedReportStatus`, campos `entry Json`, `schemaVersion`, `status`, `criadoPor`,
  `visibilidadeConsumo String[]`, `etag`). Steps: editar schema → `prisma migrate dev --name f6_saved_report`
  → `agente schema-changed` → commit. (Sem teste de código; verificação = migration aplica e `prisma generate` ok.)
- **A2 , Tipos base do builder + enums** (`src/lib/reports/builder/types.ts`). Define `ShapeDerivado`,
  `CampoMeta`, `RawSourceData`, `SourceContract`, `BuilderReportEntry` (entry +tipo/parametros/schemaVersion),
  `BuilderSection` (+shapeDerivado), enum de ícone. Teste: tipos compilam + um type-guard mínimo. TDD.
- **A3 , Schema Zod `validarReportEntry`** (`builder/report-entry-schema.ts`). Aceita ficha mínima de
  DataTable/`tabela` (com `descricao`/`icone`/`modeloFonte` opcionais); rejeita template fora do enum-6 e
  ícone fora do set. Testes: 1 positivo + 2 negativos (template inválido, ícone inválido). TDD.
- **A4 , Repo `SavedReport`** (`builder/saved-report-repo.ts`). `criarRascunho(criadoPor, entry)`,
  `obterRascunho(id, { userId, role })` (libera super_admin), `atualizarRascunho(id, userId, entry, etag)`
  (lança `EtagConflitoError` se etag diverge), `listarMeus({ userId, role })`. Testes (mock Prisma):
  criar grava entry válido; etag errado conflita; super_admin vê de outro dono. TDD.

## Bloco B , Registry de fontes + adaptadores

- **B1 , Adaptadores de shape puros** (`builder/shape-adapters.ts`). `adaptarTabela(raw): LinhaTabela[]`,
  `adaptarKpis(raw): Record<string,number>`, `adaptarAgregacaoCategorica(raw,{topN}): {rotulo,valor}[]`.
  Testes com **fixtures concretos** (linhas de saldo reais + valores esperados exatos). TDD.
- **B2 , Freshness por fato** (`builder/freshness-por-fato.ts`). Extrair `estadoDoFato` de
  `src/lib/actions/report-data.ts` para função exportada `freshnessPorFato({fato, modeloFonte})`. Teste:
  retorna data de sync por fato (mock). TDD.
- **B3 , Registry de fontes (estoque)** (`builder/source-registry.ts`). `SOURCE_REGISTRY` com
  `(fato, shape) → produtor`: `fato_estoque_saldo`/`tabela`→`querySaldoProduto`+`adaptarTabela`;
  `.../agregacaoCategorica`→`queryConcentracao`+`adaptarAgregacaoCategorica`; `.../kpis`→`querySaldoProduto`+`adaptarKpis`.
  `listarFontes(): SourceContract[]`, `obterProdutor(fato, shape)`. Testes: contrato lista shapes; produtor inexistente undefined. TDD.
- **B4 , `resolveSecao`** (`builder/resolve-source.ts`). `resolveSecao(secao, filtros): Promise<{dado, estado, erro?}>`
  via produtor (B3) + freshness (B2). Testes (mock queries): DataTable/`tabela` retorna linhas+estado; fonte inexistente `{erro}`. TDD.

## Bloco C , Motor de render genérico

- **C1 , Guard de domínio no resolver.** Modifica `resolveSecao` para chamar `guardDominio(contract.dominio)`
  no início (lê sessão); nega com `{erro:"sem_acesso_dominio"}`. Teste: usuário sem estoque é negado. TDD.
- **C2 , `<ReportRenderer entry dados>`** (`components/reports/builder/report-renderer.tsx`). Recebe `entry`
  + `dados` JÁ resolvidos (não chama resolveSecao); mapeia `DataTable`; `default` mostra "template ainda não
  suportado"; estados loading/erro/vazio. `ui-ux-pro-max`. Teste: renderiza DataTable + estado de erro. TDD.
- **C3 , Rota `/relatorios/d/[savedId]`** (`app/(protected)/relatorios/d/[savedId]/page.tsx`). Carrega ficha
  (A4), valida contra catálogo (A3 + checagem de fonte órfã → erro explícito, não 404), resolve seções (B4/C1),
  passa ao `ReportRenderer`. Registra **auditoria de abrir**. Teste: inexistente→notFound; válida→render; órfã→erro. TDD.

## Bloco D , Catálogo de componentes + tools de construção

- **D1 , Catálogo de componentes** (`builder/component-catalog.ts`). `ComponentEntry` (formato spec §6) +
  `COMPONENT_CATALOG` (só `DataTable`), `listarComponentes()`, `descreverComponente(chave)`. Teste: descreve
  DataTable (`shapeDerivadoExigido:"tabela"`); inexistente undefined. TDD.
- **D2 , Compatibilidade** (`builder/compat.ts`). `checarCompatibilidade(secao): {ok}|{ok:false,motivo}` (shape
  da seção é oferecido pela fonte E exigido pelo template). Testes: DataTable+tabela+saldo ok; DataTable+serieTemporal erro. TDD.
- **D3a , Tools de leitura** (`builder/tools/read-tools.ts`). `listar_componentes`, `descrever_componente`,
  `listar_fontes` (puras sobre catálogos). 1 teste por tool. TDD.
- **D3b , `prever_dado`** (`builder/tools/prever-dado.ts`). `prever_dado({fato, shapeDerivado}): {campos: CampoMeta[]}`
  do contrato (B3). Teste: campos de `fato_estoque_saldo`/`tabela`. TDD.
- **D3c , Mutadores de ficha** (`builder/tools/mutators.ts`). Cada `(ficha, args) => ficha'`, args declarados:
  `criar_relatorio({titulo})`, `adicionar_secao({template, fato, shapeDerivado, config})`,
  `editar_secao({secaoId, patch})`, `remover_secao({secaoId})`, `definir_filtro({secaoId, filtro})`. Validam +
  `checarCompatibilidade` a cada passo. Testes: criar vazia válida; adicionar incompatível rejeitado; remover. TDD.
- **D3d , Catálogo `BUILDER_TOOLS` + `validar`** (`builder/tools/index.ts`). Junta D3a-c num catálogo
  `{name, descricao, inputSchema (Zod), handler}` + tool `validar(ficha)`. Teste: catálogo tem as 10 tools com inputSchema. TDD.

## Bloco E , Agente construtor

- **E1a , campos no `AgentSettings` + `model-config.ts`** (migration MANUAL aditiva: `builderModelProvider`
  e `builderModelId` em `AgentSettings`). `obterConfigModeloConstrutor()` le de `AgentSettings` (default
  openai/gpt-5-mini se vazio); `definirConfigModeloConstrutor({provider,model})` grava em `AgentSettings`.
  TDD (mock prisma). (NAO criar `BuilderLlmConfig`; ver Correcao #1.)
- **E1b , Ponte tool-format** (`builder/agent/tool-bridge.ts`). Converte `BUILDER_TOOLS` (Zod) → formato `tools`
  do `ProviderClient.chat`; `despachar(toolCall): Promise<resultado>` roteia para o handler. Teste (mock): converte 1 tool; despacha chama handler. TDD.
- **E2a , Loop do agente** (`builder/agent/run-builder.ts`). `runBuilder({prompt, fichaAtual, user})`:
  `verificarQuota` (E3) → loop `client.chat({tools})` até `MAX_ITER=8`, despacha toolCalls (E1b), agrega ficha;
  retorna `{ficha, mensagem}`. Constantes nomeadas. Teste (mock provider determinístico): prompt simples gera ficha
  válida com 1 DataTable; estouro de MAX_ITER para com mensagem. TDD.
- **E2b , Reparo + recusa honesta** (mesmo arquivo). Ficha inválida volta como feedback (`MAX_REPAIR=2`); pedido sem
  fonte → `recusa` + `FeatureRequest.create` (log de gap). `logUsage({origin:"construtor"})` a cada chamada. Testes:
  ficha inválida dispara reparo; pedido sem fonte registra FeatureRequest + recusa. TDD.
- **E3 , Quota** (`builder/agent/quota.ts`). `verificarQuota(user): {ok}|{bloqueado,motivo}` soma `LlmUsage` por
  `origin="construtor"` no período de `BuilderLlmConfig` vs `tetoTokensPeriodo`. Testes: acima→bloqueado; abaixo→ok. TDD.

## Bloco F , Tela do construtor (UI , `ui-ux-pro-max` obrigatório, sem mostrar mockup)

- **F1 , Action `construirRelatorio`** (`lib/actions/builder.ts`). Gate super_admin/admin → `runBuilder` →
  persiste rascunho (A4); registra **auditoria de criar/editar**. Retorna `{ficha, mensagem, savedId, recusa?}`. Testes:
  papel barrado; admin gera e persiste. TDD.
- **F1b , Action `previsualizarSecoes`** (`lib/actions/builder.ts`). `previsualizarSecoes(ficha)` resolve seções com
  amostra/limit (sem persistir), para o preview ao vivo. Teste: resolve 1 seção com amostra. TDD.
- **F2a , `builder-chat.tsx`** (casca própria). Props `{ mensagens, pensando, onEnviar(prompt) }`; estética da bubble
  (animação pensando). Teste: enviar chama `onEnviar`; `pensando` mostra animação. `ui-ux-pro-max`. TDD.
- **F2b , `builder-preview.tsx`.** Props `{ ficha }`; valida estrutura (barato) + chama `previsualizarSecoes` (sob
  demanda) e renderiza via `ReportRenderer`. Teste: ficha válida renderiza preview; inválida mostra aviso. TDD.
- **F2c , Página construtor** (`app/(protected)/relatorios/construtor/page.tsx`). Layout split (chat F2a + preview F2b),
  liga em `construirRelatorio`/`previsualizarSecoes`. Teste: enviar prompt atualiza chat e preview. TDD.
- **F2d , Salvar/abrir.** Botão salvar (persistido por F1) + abrir `/relatorios/d/[savedId]`. Teste: salvar navega. TDD.
- **F3 , Cards de relatórios do usuário** (`app/(protected)/relatorios/page.tsx` , aba "Meus relatórios";
  test `relatorios-meus.test.tsx`). Lista `listarMeus` + botão "Novo relatório" → construtor. `ui-ux-pro-max`. TDD.

## Bloco G , Config (tela) + verificação E2E

- **G1 , Card de modelo do construtor na `agente/configuracao`** (adicionar um card no padrao de
  `resource-card.tsx`/`reasoning-card.tsx` na tela JA EXISTENTE; server action que grava
  `builderModelProvider`/`builderModelId` em `AgentSettings`). Seletor provider+model de `effective-catalog`;
  so super_admin. `ui-ux-pro-max`. NAO criar tela nova. TDD.
- **G2a , Fixar os 8 prompts-alvo** (`docs/superpowers/plans/_f6-onda1-prompts.md`). Rodar contra o cache real e
  congelar 8 prompts de estoque com fonte 100% disponível (saldo/valor por armazém/família) + 2 sem fonte. Define os
  golden cases `{prompt, shapeEsperado, colunasPlausiveis}`. (Pré-requisito da G2c.)
- **G2b , Gates determinísticos** (`builder/agent/__tests__/gates.test.ts`). Com provider mockado: recusa honesta
  registra FeatureRequest; teto bloqueia; ficha inválida repara. Asserções exatas. TDD.
- **G2c , Corrida E2E com LLM real** (`scripts/e2e-f6-construtor.ts`). Stack local atualizado; rodar os 8 prompts:
  **>=7/8** geram ficha válida que renderiza; shape/colunas conferem com o golden (asserção tolerante); registrar
  evidências em `_f6-onda1-aceite.md`. `tsc` raiz+mcp 0, `jest` verde.

---

## Self-review (v3)

- **Cobertura spec v3:** A (§4.4 persistência), B (§4.2 registry/adaptadores + §4.1 freshness), C (§4.1 motor + §5
  guard), D (§6 catálogo + §4.6 tools), E (§4.5 agente + §4.8 config + §9 teto/billing), F (§4.7 tela + preview 2 níveis
  + auditoria §5), G (§4.8 config tela + §11 aceite). Recusa honesta (§3.7) em E2b; versionamento/órfão (§10) em C3.
- **Épicos quebrados:** D3 (4), E2 (3), F2 (4), G2 (3). Cada task = 1 deliverable testável.
- **Tipos:** A2 fixa `ShapeDerivado/CampoMeta/RawSourceData/SourceContract/BuilderReportEntry`; usados consistentes em B/C/D/E.
- **Premissas verificadas no código:** `ProviderClient.chat`→toolCalls; `DataTable` colunas dinâmicas; `LlmUsage.origin`;
  `FeatureRequest`; `queryConcentracao` para agregação; `guardDominio` lê sessão.
- **Ordem:** A→B→C→D→E→F→G; dentro de E, E3 (quota) é consumida por E2a (declarada antes na escrita, implementável junto).
