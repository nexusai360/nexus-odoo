# F4 , Apresentacao , Implementation Plan (v3)

> **v3 = v1 + 2 reviews adversariais do plano aplicadas (workflow wm08wckr3).** As correcoes `[P]` abaixo TEM PRECEDENCIA sobre o corpo v1 onde houver conflito. Inventario real (Task 1.0 ja rodada): ver `docs/superpowers/plans/2026-06-07-f4-tools-a-migrar.md` , **100 read tools, 47 com envelope, 53 a migrar** (por arquivo; recontar por TOOL na execucao). Chaves de array distintas encontradas: `contas, eventos, familia, familias, linhas, marca, porEtapa, produtos`.

## CORRECOES v3 (aplicar na execucao) `[P]`

1. **6 consumidores de chaves de array, nao 5** , falta `mcp/lib/audit.ts::extractRowCount` (alem de run-agent guardToolResult [2 loops: ~147 e ~163], auto-validator V2 ~212 e V6 ~578, sanitize-tool-result ~89, freshness ARRAY_KEYS_PRIORITY ~153). Antes de tocar: `grep -rn "ARRAY_KEYS\|listaKey\|arrKey\|titulos.*linhas.*serie" src/lib/agent mcp/lib` para enumerar os reais.
2. **NAO unificar em lista plana** , as 6 listas divergem em CONTEUDO de proposito. A constante compartilhada e o VOCABULARIO (uniao de nomes); cada consumidor mantem seu SUBCONJUNTO/semantica: `ARRAY_KEYS_PRIORITY` (ordenada , freshness/audit/extractFirstArray decidem "primeiro array presente"); `ARRAY_KEYS_GUARD` (so listas grandes que estouram 24KB); `ARRAY_KEYS_VALOR` (V2). **V6 continua usando SO `dados.linhas`** (somar serie/titulos daria falso positivo de coerencia). Documentar o porque de cada subconjunto.
3. **Teste de caracterizacao ANTES da troca (1.2):** snapshot do output atual de guard/V2/V6/sanitize/freshness/audit sobre fixtures; apos trocar a fonte da lista, provar saida byte-a-byte identica. "Preserva comportamento" e verificavel, nao afirmacao.
4. **Task 1.0 conta por TOOL (id no catalogo), nao por arquivo** , ha arquivos com varias tools (financeiro/cobranca-bancaria.ts = 6 tools; comercial/cotacao-comissao.ts = 2). Iterar `visibleTools(catalogo, super_admin)` (102 ids) e detectar `_RESPOSTA` por id. Criterio: "N tools sem _RESPOSTA, listadas nominalmente"; sem aritmetica 102-47.
5. **Onda 4 = 1 task POR TOOL** (epico quebrado). A Task 1.0 emite a lista de sub-tasks, cada uma: arquivo-fonte, chave(s) de array, formatador esperado + `_RESPOSTA` de exemplo, o `SELECT` exato do KPI, e "remover <toolId> da allowlist". Integracao do `FORMATADORES` (responder.ts) e inline pelo orquestrador, com criterio por formatador (qual KPI o _RESPOSTA cita, comprovado por SELECT). Gargalo real: dezenas de formatadores novos.
6. **EnvelopeBaseShape = FreshnessEnvelope<ToolEnvelope>** (1.3): `dadosBaseShape` (Zod) corresponde a interface `ToolEnvelope` existente (manter o TIPO, auto-validator/responder importam); `EnvelopeBaseShape = { estado, dados: dadosBaseShape (passthrough), atualizadoEm, atualizadoHa, fonteStatus }`. Hoje so 4 tools tem outputSchema Zod , decidir na 1.3/1.4: o base Zod e (a) so a rede do teste de contrato (valida output em runtime no TESTE, sem cada tool declarar schema) OU (b) cada tool declara. Recomendado (a) , menos invasivo, evita mexer em 100 outputSchemas.
7. **Teto-por-byte deterministico (Onda 2):** budget liquido = `24576 - overhead_fixo_medido`; `tetoTool = floor(budget / bytesPiorCasoLinha)`. Fixture sintetica de PIOR CASO (linha com strings no maximo plausivel); teste unit FALHA se `teto*piorLinha > budget`. E2E contra cache = guarda extra. Adicionar task: guard ciente do `tetoPorTool` (uma fonte de verdade do slice).
8. **Baseline (1.5):** versionar a lista nominal tool+args. Serializar SOMENTE KPIs invariantes a paginacao (`total`, `_agregado`, `_DESTAQUE` sobre o conjunto) , NUNCA `linhasExibidas`/conteudo de linha. Dois conjuntos: (A) 47 com KPI -> baseline "identico"; (B) 53 que ganham KPI -> sem baseline, validacao = E2E positivo x SELECT. Confirmar ANTES que toda tool de lista calcula KPI sobre o conjunto (nao a pagina).
9. **Allowlist (1.4):** array nominal exportado `TOOLS_SEM_FORMATADOR_REAL` (comentario "deve chegar a [] na Onda 6"); cada sub-task da Onda 4 remove seu id; Onda 6 exige vazia.
10. **Onda 3.2 (escopo-empresa):** gate , `grep`/`SELECT` para confirmar quais tools REALMENTE filtram por empresa hoje (nao assumir F1). Dependencia 3.1 (humanizeName) -> Onda 4 (formatadores humanizam) explicita: migrar so apos humanizeName estendido, senao `_RESPOSTA` sai com nome cru.
11. **Onda 5 (ranking):** listar nominalmente as tools (grep `orderBy|top|ranking`); "ambiguidade" = >=2 linhas com mesmo valor do criterio primario; fixture com empate provando ordem deterministica (odooId) + N exato.
12. **4 tools com .parse/.safeParse** (detalhar-nota/pedido/conta, bi-consulta-avancada): confirmar que o base e superset (passthrough nao rejeita) e que bi-consulta-avancada valida em runtime apos a troca; E2E especifico.
13. **freshness>6h (1.6):** destino do log = escolher McpAuditLog OU console estruturado (nao "ou"); teste assere que o retorno de `withFreshness` NAO contem campo de staleness/defasado (so loga server-side).

---

# F4 , Apresentacao , Implementation Plan (corpo v1, ler com as correcoes v3 acima)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Steps usam checkbox `- [ ]`.
> Antes de editar `run-agent.ts` (volatil), re-confirmar ancoras por grep. Migrations: manual + `migrate deploy` (NUNCA `migrate dev`). NAO ha migration nesta fase (so codigo).

**Goal:** estabelecer um envelope BASE canonico que toda tool de leitura estende, paginacao 50/50 limitada por byte, ranking com desempate estavel, e humanizacao consistente , sem regredir nenhum numero (KPI agregado identico ao baseline).

**Spec:** `docs/superpowers/specs/2026-06-07-f4-apresentacao-design.md` (v3). Fatos-base verificados: 102 read tools, 9 write FORA do escopo, 47 ja com `enriquecerEnvelope`, ~55 a migrar.

**Tech Stack:** TypeScript, MCP SDK, Zod, Jest, Prisma (sem migration nesta fase).

---

## ONDA 1 , Fundacao (toca o motor com cuidado)

### Task 1.0 , Inventario exato (gate, sem codigo)
- [ ] `grep -rL "enriquecerEnvelope" mcp/tools/**/*.ts | grep -v test | grep -v index` cruzado com `isWriteToolEntry` para listar as ~55 read-tools SEM KPI. Salvar a lista nominal em `docs/superpowers/plans/2026-06-07-f4-tools-a-migrar.md` (1 linha por tool + dominio + chave de array que ela usa). Criterio: numero bate com 102 read - 47 com envelope.

### Task 1.1 , Constante `ARRAY_KEYS` unica
- **Files:** `mcp/lib/array-keys.ts` (novo) + `__tests__`.
- [ ] Teste: `ARRAY_KEYS` contem a uniao de todas as chaves de array hoje hardcoded (linhas, titulos, serie, top, topMaiores, contas, familia, marca, produtos, locais, funis, ...). Levantar a uniao real por grep nos 5 pontos.
- [ ] Impl: exporta `export const ARRAY_KEYS = [...] as const` + helper `primeiraListaDe(dados)` (retorna a 1a chave de array presente).
- [ ] Commit.

### Task 1.2 , Os 5 consumidores passam a usar `ARRAY_KEYS`
- **Files:** `src/lib/agent/run-agent.ts` (guardToolResult ~137-185), `src/lib/agent/validation/auto-validator.ts` (V2 ~212, V6 ~578), `src/lib/agent/quality/sanitize-tool-result.ts` (~89), `mcp/lib/freshness.ts` (ARRAY_KEYS_PRIORITY ~153).
- [ ] Para cada um: substituir a lista local pela importacao de `ARRAY_KEYS` (preservando ordem de prioridade onde importa , criar `ARRAY_KEYS_PRIORITY` derivada se a ordem for semantica). Re-confirmar ancoras por grep antes.
- [ ] Verificacao: `npx tsc --noEmit` + `npx jest src/lib/agent mcp/lib` verdes. Cuidado: nao mudar comportamento, so a fonte da lista.
- [ ] Commit (1 commit, "unifica chaves de array (motor)").

### Task 1.3 , `EnvelopeBaseShape` + `envelopePronto` (mantendo tipo `ToolEnvelope`)
- **Files:** `mcp/lib/envelope.ts` + `__tests__`.
- [ ] Confirmar importadores do tipo `ToolEnvelope` (`grep -rn "ToolEnvelope" src mcp`) , auto-validator e responder importam o TIPO; NAO remover/renomear o tipo.
- [ ] Teste: `EnvelopeBaseShape` (ZodRawShape) valida `{estado:preparando}` e `{estado:ok, dados:{_RESPOSTA,...}, atualizadoEm, atualizadoHa, fonteStatus}`; `dados` e passthrough (aceita chave de array extra); `envelopePronto({linhas:[...]})` produz shape valido.
- [ ] Impl: adicionar `EnvelopeBaseShape`, `dadosBaseShape` (com `.passthrough()`), `envelopePronto(extra)`; manter `ToolEnvelope`/`buildEnvelope` existentes.
- [ ] Commit.

### Task 1.4 , Teste de contrato de envelope (rede nova)
- **Files:** `mcp/__tests__/envelope-contract.test.ts` (novo).
- [ ] Itera o catalogo de leitura; para cada tool, com `withFreshness` mockado (estado ok), o output casa com `EnvelopeBaseShape` e `_RESPOSTA` NAO e o `fmtGenerico` (via `ehFormatadorGenerico`). Tools ainda nao migradas podem entrar numa allowlist temporaria que ESVAZIA conforme a onda 4 avanca (gate de progresso).
- [ ] Commit.

### Task 1.5 , Baseline snapshot harness
- **Files:** `src/lib/reports/__tests__/e2e/f4-baseline.e2e.ts` (tsx) + `f4-baseline.json` (gerado).
- [ ] Runner tsx: por tool de leitura + args representativos (reusar fixtures do dossie/mini-oraculo), chama o handler com prisma real (`.env.local`) e serializa os KPIs agregados (`_DESTAQUE`/`_agregado`/`total`) em `f4-baseline.json`. Guard `E2E=1`.
- [ ] Rodar 1x para gravar o snapshot ANTES de qualquer migracao. Commit do snapshot.

---

## ONDA 2 , Paginacao 50/50 com teto-por-byte

### Task 2.1 , default 50 + teto efetivo
- **Files:** `mcp/lib/paginacao.ts` + `__tests__`.
- [ ] Teste: `PAGINACAO_LIMIT_DEFAULT===50`; `limiteEfetivo(pedido, tetoTool)` = `min(pedido ?? 50, tetoTool ?? 50)`; `.describe()` reflete "default 50, max 50".
- [ ] Impl: trocar default; adicionar `tetoPorTool` opcional; atualizar `.describe()`.
- [ ] Commit.

### Task 2.2..2.N , reescrever os ~35 testes de paginacao (1 task por dominio)
- [ ] Por dominio: trocar `expect(take).toBe(10)` por `toBe(PAGINACAO_LIMIT_DEFAULT)` (import da constante); casos de offset com fixtures > 50 itens. Listar os arquivos (grep `default limit = 10`).
- [ ] Verificacao: `npx jest mcp/tools/<dominio>` verde por dominio.
- [ ] Commit por dominio.

### Task 2.3 , teto-por-byte por tool de linha rica
- [ ] Medir bytes/linha das tools pesadas (notas-emitidas, pedidos-listar-top-valor, produtos-faturados, detalhar-*). Fixar `tetoPorTool` para caber em 24KB. E2E: 50 (ou teto) linhas reais NAO ativam `_amostraReduzida`.
- [ ] Commit.

---

## ONDA 3 , Humanizacao

### Task 3.1 , estender `humanizeName`
- **Files:** `src/lib/agent/text-normalize.ts` + `__tests__`.
- [ ] Testes (fixtures dos casos da review): LTDA/ME/EPP/S.A./S/A/CIA/EIRELI preservados; UF maiuscula; token com digito/sigla/maiuscula-interna intacto; idempotente; "JHT do Brasil"/"3R Fitness" nao corrompem.
- [ ] Impl: adicionar sufixos societarios + UF ao dicionario existente; aplicar so a campos de nome (whitelist).
- [ ] Commit.

### Task 3.2 , escopo-empresa cross-dominio (so onde ha filtro)
- **Files:** `mcp/lib/escopo.ts` (generaliza `fiscal/_escopo-empresa.ts`).
- [ ] Helper `montarEscopoEmpresa` reusavel; aplicar so nas tools que JA filtram por empresa (fiscal + entregas F1). Teste.
- [ ] Commit.

### Task 3.3 , `cobertura()` + `_AVISO_INCOMPLETO`
- **Files:** `mcp/lib/cobertura.ts` + conjunto inicial de metricas (definir: margem/ROI sobre precoCusto null).
- [ ] Helper `cobertura({consideradosComDado,totalConsiderado,campo,rotulo})` -> string; E2E que prova o % contra `SELECT`.
- [ ] Commit.

---

## ONDA 4 , Migracao das ~55 tools por dominio (workflow Opus)

### Task 4.x , 1 onda por dominio (estoque, financeiro, fiscal, comercial, contabil, cadastros)
- [ ] Workflow Opus: 1 agente por dominio migra suas tools sem KPI para `enriquecerEnvelope` + envelope base + formatador real (`_RESPOSTA` nao-generico) + `_PAGINACAO` quando lista. Agentes NAO editam barrels/index/responder (compartilhados) , retornam o diff por tool; o orquestrador integra `FORMATADORES` e barrels inline.
- [ ] Por tool: E2E positivo (KPI x `SELECT`); V6 verde; teste de contrato sai da allowlist.
- [ ] Verificacao por dominio: tsc + jest + teste de contrato; baseline E2E (KPI identico onde ja havia).
- [ ] Commit por dominio.

---

## ONDA 5 , Ranking

### Task 5.1 , desempate estavel + N exato (universal)
- [ ] Auditar tools de ranking/top; garantir orderBy com desempate por `odooId` e N exato. orderBy explicito SO onde ha ambiguidade real (nao tornar obrigatorio em criterio unico).
- [ ] Commit.

---

## ONDA 6 , Verificacao final

- [ ] Teste de contrato verde para 102 tools (allowlist vazia).
- [ ] E2E baseline: KPI agregado identico ao snapshot; `linhasExibidas` pode 10->50.
- [ ] `npx tsc --noEmit && npx tsc -p mcp/tsconfig.json --noEmit && npx eslint mcp src/lib/agent && npx jest` verdes.
- [ ] Rebuild mcp da worktree `--env-file .env.local`; provar envelope no `tools/list` do container.
- [ ] Code review adversarial do diff F4 + PR para main + merge (autorizacao duravel).

---

## Self-Review (cobertura da spec v3)
- §4 envelope base + ARRAY_KEYS + contrato -> Ondas 1.1-1.4. ✓
- §5 paginacao 50 + teto-byte -> Onda 2. ✓
- §3.3 humanizacao (humanizeName/escopo/cobertura/formatadores) -> Onda 3 + 4. ✓
- §3.4 freshness>6h server-side -> incluir na Onda 1 (withFreshness loga staleness, sem campo no envelope). [ADICIONAR como Task 1.6]
- §6 ranking -> Onda 5. ✓
- §8 baseline -> Task 1.5; invariante KPI identico -> Onda 6. ✓
- write tools fora do escopo; teste de contrato so leitura. ✓

### Task 1.6 , freshness>6h server-side (faltava no corpo)
- **Files:** `mcp/lib/freshness.ts`.
- [ ] `withFreshness` calcula staleness (>6h; `ultimaSyncEm=null` => defasado) e loga estruturado (server-side); NAO adiciona campo ao envelope. Teste unit do calculo. Commit.
