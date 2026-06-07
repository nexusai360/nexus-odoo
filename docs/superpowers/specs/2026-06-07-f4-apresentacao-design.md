# F4 , Apresentacao (resultados que nao mentem) , spec v3

> Reconstrucao do Nex, Fase 4. Fonte: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` (secoes 5 e 6).
>
> **v3 = v1 + 2 reviews adversariais aplicadas.** As reviews acharam riscos criticos de regressao (z.object unico inviavel, chaves de array hardcoded no agente, guard de 24KB x paginacao 50, 35 testes quebram, humanizeName ja existe, _staleness na raiz nasce morto). Correcoes marcadas `[R]`.

---

## 1. Objetivo

Aplicar a politica de resultados (dossie secao 5) de forma **uniforme e humanizada** nas **tools de leitura** do MCP. Hoje: 3 fontes de envelope divergentes, so 47 tools chamam `enriquecerEnvelope`, paginacao 10/50, sem Title Case unificado, sem aviso de freshness>6h, dezenas de tools no formatador generico fraco. A F4 estabelece **um envelope BASE canonico que cada tool estende**, paginacao 50/50 **limitada pelo guard de 24KB**, ranking com desempate estavel, humanizacao consistente (reusando o que existe), e freshness>6h como **telemetria server-side**. Regra de ouro: **numero sempre de codigo; o LLM so redige.**

## 2. Numeros reais (verificados contra o codigo) `[R]`

- Catalogo: **102 tools de leitura** + **9 write tools** (`integration.test` fixa 102 visiveis; 111 brutas). 
- **As 9 WriteToolEntry estao FORA do escopo** , retornam `WriteToolResult { id, data, snapshotBefore, snapshotAfter }`, nunca passam por `withFreshness`/`enriquecerEnvelope`. Nao recebem o envelope de leitura.
- Hoje **47 tools de leitura** chamam `enriquecerEnvelope` (tem `_RESPOSTA`/`_DESTAQUE`); **~55 tools de leitura** so usam `withFreshness` (shape proprio sem KPI). A lista nominal exata das que faltam e levantada na Task de inventario (3.0 do plano), nao estimada.

## 3. Decisoes canonicas (dono + reviews)

1. **Paginacao 50/50 com teto de byte `[R]`:** `PAGINACAO_LIMIT_DEFAULT` 10 -> 50, MAS o limite efetivo por chamada e `min(50, cabe-em-24KB)`. Tools de **lista simples** usam 50; tools de **linha rica/detalhe** (notas, pedidos com sub-listas) usam teto menor calibrado para nao estourar o guard. `total`/`temMais`/`proximoOffset` sempre presentes; KPIs sobre o conjunto inteiro.
2. **Envelope BASE canonico + extensao por tool `[R]`:** um `z.object` BASE (estado + `dados` com `_RESPOSTA`/`_DESTAQUE`/`_agregado`/`_PAGINACAO`/avisos opcionais + `[k]:unknown` passthrough; `atualizadoEm`/`atualizadoHa`/`fonteStatus`) que cada tool **estende** (`.extend()`/`.merge()`) declarando suas chaves de array tipadas. NAO um schema chapado unico. Migrar as ~55 read-tools sem KPI para esse padrao.
3. **Humanizacao reusando o que existe `[R]`:**
   - **Title Case:** ESTENDER `humanizeName` em `src/lib/agent/text-normalize.ts` (ja maduro, regressoes de sigla/codigo resolvidas, ja importado por tools) , adicionar sufixos societarios (LTDA/ME/EPP/S.A./S/A/CIA/EIRELI) e UFs ao dicionario, com testes. **NAO** criar `mcp/lib/humanize.ts` paralelo. Aplicado so a campos de nome (whitelist de chaves), idempotente, nunca em codigo/CNPJ/token com digito/sigla.
   - **Escopo-empresa cross-dominio:** generalizar `montarEscopoEmpresa` (`_AVISO_ESCOPO`) **so para tools que JA filtram por empresa** (fiscal hoje + entregas da F1). Tool sem filtro real por empresa NAO recebe o aviso (seria mentira).
   - **Aviso de dado incompleto (`_AVISO_INCOMPLETO`):** helper `cobertura({consideradosComDado, totalConsiderado, campo, rotulo})`; conjunto inicial de metricas explicito (onda definida no plano, ex.: margem/ROI sobre `precoCusto` null), cada uma com denominador declarado e E2E que prova o %.
   - **Formatadores reais:** escrever `_RESPOSTA` para as tools hoje no `fmtGenerico` (completar `TOOLS_QUE_PRECISAM_FORMATADOR` ausentes no `FORMATADORES`).
4. **Freshness>6h = telemetria server-side `[R]`:** `withFreshness` calcula staleness (>6h) e **loga no servidor** (`McpAuditLog`/console estruturado), **NAO** poe no envelope que vai ao LLM (evita o LLM comentar "dado defasado" no corpo; o stripper nao conhece esse padrao). `ultimaSyncEm=null` (fonte nunca sincronizou) => `defasado=true` (pior caso). Sem corte de comportamento.

## 4. Envelope BASE canonico `[R]`

### 4.1 Estrutura
Em `mcp/lib/envelope.ts`: manter o **tipo `ToolEnvelope`** (importado pelo `auto-validator.ts` e `responder.ts` , NAO quebrar) e adicionar:
- `EnvelopeBaseShape` (ZodRawShape) com o nucleo discriminado por `estado` (igual ao `FreshnessEnvelope` real: `estado` externo + `dados` interno + `atualizadoEm`/`atualizadoHa`/`fonteStatus`).
- `dados` = `z.object({ _RESPOSTA, _DESTAQUE?, _agregado?, topPorParticipante?, _PAGINACAO?, _listaTruncada?, _AVISO_TRUNCAMENTO?, _AVISO_ESCOPO?, _AVISO_INCOMPLETO?, ambiguidade?, redirecionar? }).passthrough()` , `passthrough()` preserva as chaves de array proprias de cada tool (linhas/serie/familia/marca/contas/top/produtos/locais).
- Cada tool define `outputSchema = z.union([preparando, base.extend({ dados: dadosBase.extend({ <suas chaves de array> }) })])`. Helper `envelopePronto(dadosExtra)` para reduzir boilerplate.
- **Compat:** as 4 tools que fazem `outputSchema.safeParse`/`.parse` (detalhar-nota/pedido/conta, bi-consulta-avancada) continuam validas porque o base e superset e `dados` e passthrough; revisar o `parse` runtime do bi-consulta-avancada.

### 4.2 Chaves de array unificadas `[R]` (toca o motor , reconhecido)
Hoje 5 pontos do agente listam chaves de array fixas e **divergentes**: `guardToolResult` (run-agent), V2/V6 (auto-validator), `sanitize-tool-result`, `ARRAY_KEYS_PRIORITY` (freshness). Criar **uma constante compartilhada** `ARRAY_KEYS` (ex.: em `mcp/lib/array-keys.ts`, reexportada onde precisa) com o uniao de todas (`linhas, titulos, serie, top, topMaiores, contas, familia, marca, produtos, locais, ...`) e fazer os 5 pontos consumirem-na. Sem isso, tool migrada com chave nao-listada escapa do guard (estoura contexto) e do V6 (coerencia nunca checada) , regressao silenciosa.

### 4.3 Teste de contrato de envelope (rede nova) `[R]`
`integration.test` so conta tools/IDs/RBAC , NAO valida envelope. Criar um **teste de contrato** que itera o catalogo de leitura e, para cada tool, valida (com fixture mockada) que o output casa com o `EnvelopeBaseShape` e que `_RESPOSTA` nao e o `fmtGenerico` (via `ehFormatadorGenerico`). Essa e a rede que torna a migracao por dominio verificavel isoladamente.

## 5. Paginacao 50/50 real `[R]`

- `paginacao.ts`: `PAGINACAO_LIMIT_DEFAULT` 10 -> 50; `PAGINACAO_LIMIT_MAX` 50; **limite efetivo = `min(limitPedido ?? 50, tetoPorTool)`** onde `tetoPorTool` e calibrado para caber em ~24KB (lista simples: 50; linha rica: medir bytes/linha e fixar). Atualizar a `.describe()` do `paginacaoInputShape` (o LLM le isso no tools/list).
- **35 testes de paginacao** `[R]`: reescrever para importar `PAGINACAO_LIMIT_DEFAULT` (nao o literal 10) e usar fixtures > 50 itens para exercer a pagina real. Listados como escopo (1 task por dominio no plano).
- Fim do truncamento silencioso: toda tool que lista usa `resolverPaginacao` + `montarPaginacaoMeta` + expoe `_PAGINACAO`. KPIs sobre o conjunto inteiro.
- **Reconciliacao com o guard:** se mesmo com o teto a lista exceder 24KB, o guard amostra (e seta `_amostraReduzida`); nesse caso os KPIs continuam presentes e corretos (calculados sobre o conjunto), e o V6 pula (ja e o comportamento). Criterio E2E: para cada tool de lista, 50 linhas reais NAO devem ativar `_amostraReduzida` (se ativarem, baixar o teto da tool).

## 6. Ranking `[R]`

- **Universal (baixo risco):** desempate estavel por `odooId` + N exato. Aplicar a toda tool de ranking/top.
- **orderBy explicito SO onde ha ambiguidade real** (multiplos criterios). Tool de criterio unico mantem o criterio implicito documentado na descricao , NAO tornar `orderBy` obrigatorio (seria breaking change no inputSchema/tools-list e na selecao de tool do agente).

## 7. Freshness>6h , server-side (ver decisao 3.4). Sem campo no envelope ao LLM.

## 8. Baseline e verificacao do "numero identico" `[R]`

- **Baseline ANTES de migrar:** harness tsx contra `nexus_odoo_l1` que serializa, por tool + args representativos, os KPIs agregados (`_DESTAQUE`/`_agregado`/`total`) num snapshot versionado.
- **Invariante:** **KPI agregado identico** ao baseline; `linhasExibidas`/`_PAGINACAO` PODEM mudar (10->50, esperado).
- **Para tool que GANHA KPI novo** (nao tinha _RESPOSTA): E2E **positivo** , o numero do `_DESTAQUE`/`_agregado` bate com um `SELECT` independente no cache (regra de raiz). O V6 (soma das linhas x total) e gate obrigatorio por tool migrada , e o detector de KPI-novo-incoerente.

## 9. Reuso vs construcao `[R]`

| Reusar (nao reescrever) | Construir/estender |
|---|---|
| `with-responder.ts::enriquecerEnvelope`/`calcularExtras` | `envelope.ts`: `EnvelopeBaseShape` + `envelopePronto` (mantendo o tipo `ToolEnvelope`) |
| `paginacao.ts` (engine) | default 50 + teto-por-tool por byte; atualizar `.describe()` |
| `responder.ts` (FORMATADORES + calcs + `ehFormatadorGenerico`) | formatadores reais p/ tools no `fmtGenerico` |
| `src/lib/agent/text-normalize.ts::humanizeName` | estender com sufixos societarios + UF (com testes) |
| `fiscal/_escopo-empresa.ts::montarEscopoEmpresa` | generalizar so p/ tools que ja filtram empresa |
| `agrupador.ts::topPorParticipante`; `withFreshness` | `array-keys.ts` (constante unica) + atualizar os 5 consumidores; `cobertura()` |

## 10. Decomposicao em ondas (plano)

1. **Fundacao (toca o motor, com cuidado):** `ARRAY_KEYS` unica + 5 consumidores; `EnvelopeBaseShape`/`envelopePronto`; teste de contrato; baseline snapshot harness.
2. **Paginacao:** default 50 + teto-por-tool; reescrever os 35 testes; `.describe()`.
3. **Humanizacao:** estender `humanizeName`; `escopo` cross-dominio (so onde ha filtro); `cobertura()`/`_AVISO_INCOMPLETO` (conjunto inicial).
4. **Migracao das ~55 tools por dominio** (workflow Opus, 1 agente/dominio): cada tool -> `enriquecerEnvelope` + envelope base + formatador real + `_PAGINACAO`; E2E por tool (KPI x SELECT). Orquestrador integra barrels.
5. **Ranking:** desempate estavel + N exato (universal); orderBy so onde ambiguo.
6. **Verificacao final:** teste de contrato verde p/ 102 tools; E2E baseline (KPI identico); rebuild mcp; integration.test; tsc+jest.

## 11. Fora de escopo (YAGNI)

- 9 write tools (contrato `WriteToolResult` intacto).
- Golden/evals -> F5. Custo/latencia do 50/50 -> F6 (mas o teto-por-byte da F4 ja mitiga o pior caso).
- `_AVISO_ESCOPO` em tools sem filtro por empresa (dependem da F1; nao mentir).
- Telas/dashboard (Frente A). Reescrever o motor do agente alem da unificacao de `ARRAY_KEYS`.
- Exibir freshness/staleness no corpo (regra vigente).

## 12. Criterios de sucesso

- Envelope BASE canonico (Zod) que TODA tool de leitura estende; teste de contrato verde p/ 102 tools; `ToolEnvelope` (tipo) preservado.
- `ARRAY_KEYS` unica consumida pelos 5 pontos do agente; nenhuma chave de array de tool migrada escapa de guard/V2/V6/sanitize/freshness.
- Paginacao 50/50 com teto-por-byte; 50 linhas reais nao ativam `_amostraReduzida`; `total`/`temMais` sempre; 35 testes reescritos (constante importada).
- Humanizacao reusando `humanizeName` estendido; `_AVISO_ESCOPO` so onde ha filtro; `_AVISO_INCOMPLETO` com denominador comprovado por E2E; nenhum `_RESPOSTA` no generico fraco.
- Freshness>6h logado server-side; NAO vaza no texto.
- **KPI agregado identico ao baseline** (snapshot); KPI novo comprovado por `SELECT` (V6 gate). `linhasExibidas` pode mudar 10->50.
