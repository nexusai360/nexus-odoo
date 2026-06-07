# F3 , Cérebro de Orquestração (spec v3)

> Reconstrução do Nex, Fase 3. Fonte de requisitos: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` (seções 5.2 e 6). Fases 1 (métricas canônicas) e 2 (entidades/desambiguação) já em produção.
>
> **v3 = v1 + 2 reviews adversariais aplicadas** (arquitetura/viabilidade + completude/ambiguidade). As reviews derrubaram 4 premissas falsas da v1 (examples no embedding, pgvector, rename mecânico, shadow-compare/verificador genérico); todas corrigidas abaixo e marcadas com `[R]`.

---

## 1. Objetivo

Eliminar os dois maiores defeitos do agente: **escolher a tool errada** e **alucinar/truncar**. O cérebro decide o(s) domínio(s), seleciona a(s) tool(s) por recuperação semântica, classifica a intenção e passa a resposta por um verificador determinístico antes de devolver. TypeScript, reusando a infra existente.

Métrica norte (medível já na F3, não só na F5): **recall@K da tool correta** num mini-oráculo de perguntas anotadas (seção 9), **zero alucinação de número** nesse conjunto, e respeito a exaustiva/ranking/amostragem.

## 2. Decisões canônicas (fixadas com o dono + corrigidas pelas reviews)

1. **Entrega:** spec única, plano em **3 ondas** (3a retrieval + router ativo; 3b intenção + verificador; 3c "Fora do Catálogo"). Grafo de dependência explícito na seção 7.
2. **Tool retrieval:** embedding por tool a partir de um **`embeddingText` curado** (não de `examples`); router de domínio vira `active` com fallback. `[R]` Ver §4 para por que não é `descricao+examples`.
3. **Classificador de intenção:** determinístico leve (regex/keywords pt-br) → `exaustiva | ranking | amostragem | pontual` (`pontual` = default), com **tabela de precedência** e injeção em código dos argumentos (§5.1).
4. **Verificador:** **estender o `auto-validator` existente** (que já tem V1-V4 + shadow/active + retry cap=1), não criar módulo paralelo. Checks novos limitados ao que o envelope atual suporta (§5.2). `[R]`
5. **"Caminho 3" → "Fora do Catálogo" (só user-facing).** `[R]` Renomear rótulos visíveis (UI, texto de prompt, mensagens de recusa, docs) e o **diretório** `mcp/tools/caminho3/ → mcp/tools/fora-do-catalogo/`. **NÃO** renomear: a chave de domínio interna `caminho3` (identificador do router, igual a um id de tool), nomes de role SQL (`nexus_mcp_bi`), variáveis de env, paths de provisionamento. Ids de tool (`registrar_lacuna`, `bi_consulta_avancada`) estáveis. Ramos: **Falta Honesta** / **Fora de Escopo** / **Consulta BI Avançada**.

## 3. Arquitetura e fluxo

Camada determinística em `src/lib/agent/`, dentro do orquestrador `src/lib/agent/run-agent.ts` (loop `MAX_ITERATIONS=3`). O cérebro insere/fortalece passos sem trocar o motor nem o provider.

Fluxo alvo:

```
pergunta
  → embed (router/embed-question.ts, cache LRU)                         [reuso]
  → filtro RBAC (filter-catalog camada B + visibleTools no MCP)         [reuso]
  → RETRIEVAL de tools top-K (router/pick-tools.ts)                     [NOVO 3a]
  → classificação de intenção (router/classify-intent.ts)              [NOVO 3b]
  → LLM com catálogo enxuto                                             [ajuste 3a]
  → executa tool; intenção injeta/cap limit|orderBy|sample em código    [3b]
  → verificador (auto-validator estendido V1..Vn)                       [3b]
  → (retry compartilhado cap=1 | Falta Honesta | Fora de Escopo | ok)  [3b/3c]
```

**Regra de raiz (não regredir):** todo passo novo é config-gated e tem fallback para o comportamento atual (retrieval vazio/baixa confiança → catálogo filtrado cheio; intenção incerta → `pontual`; check novo do verificador → modo aviso até calibrar). Nenhuma flag nova nasce `active`.

## 4. Onda 3a , Tool Retrieval + Router ativo

**Problema:** hoje o router escolhe **domínio** por embedding mas roda em `shadow` (manda o catálogo inteiro ao LLM, só loga). Não há ranking de tool individual.

### 4.1 Fonte do texto de embedding `[R]` (corrige premissa falsa da v1)
- **Fato do código:** o agente (`run-agent.ts:453`, `session.listTools()`) recebe das tools apenas `{name, description, inputSchema}`. O campo `examples` do `ToolEntry` **não cruza** o protocolo MCP (`mcp/server.ts` só publica `descricao` como `description`), e só **9 de 123** tools têm `examples` (todas write). Logo "descricao + examples" da v1 é inviável.
- **Decisão:** cada tool recuperável ganha um **`embeddingText` canônico** = descrição rica + frases-gatilho pt-br (derivadas das perguntas-ouro `[OK]` do dossie). Esse texto é a fonte do vetor **e** melhora a escolha do próprio LLM.
- **Transporte:** o `embeddingText` é definido no lado do MCP (onde `ToolEntry` vive) e exposto ao agente **dobrando-o na `description`** publicada em `tools/list` (canal que já cruza a fronteira) — ou, se a descrição ficar grande demais para o prompt, via um endpoint interno de metadados (decisão de implementação no plano; default: enriquecer `description`). Não há novo protocolo MCP.
- **Curadoria é trabalho NOVO, não reuso:** a onda inclui escrever `embeddingText` para as ~35-40 read-tools recuperáveis. Critério de pronto: **toda tool registrada tem `embeddingText` não-trivial**; um check de startup/CI **falha** se faltar (evita tool invisível).
- **Tools externas (MCP de terceiros):** sem `embeddingText`/domínio → **sempre incluídas** no piso (não dependem de ranking).

### 4.2 Vetores de tool `[R]` (corrige "reusa pgvector")
- **Fato:** o router de domínio NÃO usa pgvector; `embed-domains.ts` guarda os vetores em **cache de processo** (recalculado por `VOCABULARY_VERSION`). O único `vector(1536)` do schema é do `KbDocument` (RAG).
- **Decisão:** vetores de tool ficam em **cache de processo**, mesmo padrão de `embed-domains.ts` (~40 tools × 1536 floats ≈ 245 KB, trivial). **Sem migration de pgvector, sem coluna nova de vetor.** Reuso real: `rag/embed.ts` (chamada OpenAI `text-embedding-3-small`) + o padrão de cache de `embed-domains.ts`.

### 4.3 `router/pick-tools.ts` (novo)
- Dado o embedding da pergunta e o conjunto já filtrado por RBAC+domínio, rankeia tools por cosseno → **top-K**.
- **Núcleo mínimo garantido (piso):** `[R]` o catálogo enxuto SEMPRE contém **todas as tools dos domínios escolhidos pelo router** + as tools dos domínios `excludeFromFiltering` (transversal, `dominios-vazios`, `caminho3`) + tools externas. O top-K só **adiciona** candidatas de outros domínios. Assim uma tool nunca some por ruído de embedding nem por falta de curadoria. (Derivação no agente por `getToolDomain(name)`, que já existe; não depende de `sempreVisivel`, que não cruza a fronteira.)
- **K e limiar:** a spec fixa o **método**, não o número. Calibrar contra as ~199 perguntas `[OK]` do dossie medindo **recall@K** (a tool certa está no top-K?) e **taxa de falso-fora-de-escopo**, em shadow, antes do active. Faixa inicial sugerida: **K ∈ [5,8]**; **critério de aceite: recall@K ≥ 98%** no mini-oráculo (§9). Como o piso já inclui o domínio inteiro, K rege só candidatas cross-domínio.

### 4.4 Router shadow → active
- `filter-catalog.ts` passa a entregar o catálogo enxuto quando `routerEnabled=active`; mantém o catálogo filtrado cheio como fallback (confiança baixa, retrieval vazio, flag off). RBAC aplicado **antes** do retrieval (defesa estrutural; tool gated nunca entra por similaridade).

### 4.5 Shadow-compare instrumentado `[R]` (corrige "reusa AgentRouterDecision")
- **Fato:** `AgentRouterDecision` é **domain-level** (`pickedDomains`, `scores`, `toolsActuallyUsed`); não há campo para o top-K do retrieval nem para o rank da tool escolhida pelo LLM.
- **Decisão:** **migração** (`prisma migrate deploy`, manual) adicionando ao `AgentRouterDecision`: `retrievalOfferedTools String[]`, `retrievalScores Json?`, `chosenToolRank Int?` (posição da tool usada pelo LLM no ranking do retrieval; null se fora do top-K). Popular em **shadow**.
- **Gate numérico de go-live:** virar `active` só quando, no período de shadow, **≥ 98% dos turnos** tiverem a tool usada dentro do top-K (`chosenToolRank` não-nulo). Métrica explícita, não "achismo".

**Reuso:** `pickDomains`, `filterCatalog`, `embed-question.ts`, `embed-domains.ts` (padrão de cache), `rag/embed.ts`, `getToolDomain`, `AgentRouterDecision` (estendido).

## 5. Onda 3b , Classificador de Intenção + Verificador

### 5.1 Classificador de intenção (`router/classify-intent.ts`)
- Função pura determinística (regex/keywords pt-br) → `exaustiva | ranking | amostragem | pontual`. `pontual` é o **default** (alinha com as 3 classes explícitas do dossie 5.2 + default).
- **Tabela de precedência** `[R]` (resolve colisão "quais são os 5 maiores": tem sinal de exaustiva e de ranking): **ranking > amostragem > exaustiva > pontual** (N explícito é o sinal mais forte).
- **Mecanismo (em código, não só prompt)** `[R]`: entre `tc.arguments` (vindos do LLM) e `session.callTool` (`run-agent.ts:~1214`), o código **injeta/limita** argumentos conforme a intenção:
  - exaustiva → `limit=50` (cap), resposta reporta "exibindo X de Y; pagine/filtre";
  - ranking → exige `orderBy` (se o LLM não mandou e a tool suporta, mantém o do LLM; se a tool **não** suporta `orderBy`, **degrada para `pontual` + aviso**);
  - amostragem → `limit` 3-5;
  - pontual → default da tool.
  - **Precedência de args:** o cap de `limit` da intenção vence o do LLM; `orderBy` do LLM é preservado. Conflito intenção×tool → degrada para `pontual` com aviso, nunca quebra.
- **Testes-semente** (critério de pronto): variantes coloquiais ("me lista tudo", "quero ver todos", "top dez", "top 10", "dá um exemplo", número por extenso).

### 5.2 Verificador `[R]` (estende o `auto-validator`, não cria paralelo)
- **Fato:** `src/lib/agent/validation/auto-validator.ts` já roda **V1-V4** com modo shadow/active e retry cap=1 (anti-invenção, anti-truncamento, anti-recusa, coerência frouxa). A v1 ignorava isso.
- **Decisão:** as checagens novas entram como **V5+ dentro do `auto-validator`** (mesmo modo shadow/active, mesmo retry cap=1 compartilhado), e o diretório `validation/` é o lar canônico (sem criar `verifier/` concorrente). Opcional: renomear `validation/ → verifier/` só se for limpo (decisão do plano; não obrigatório).
- **Checks novos, limitados ao que o envelope atual suporta** `[R]` (o envelope canônico único é da **F4**, não desta fase):
  - **V5 totais×itens:** só nas tools cujo shape **já** expõe total/`_agregado` + linhas com campo de valor conhecido (listar quais no plano). Ausência do campo → "não verificável" (aviso), nunca falso positivo.
  - **V6 datas no período:** só quando o envelope expõe `periodoDe/periodoAte` e datas por linha em formato conhecido; senão "não verificável". (Padronização ampla fica para a F4.)
  - **V7 anti-JOIN-duplicado:** sinal quando a contagem sugere duplicação (heurística conservadora, modo aviso).
- **Freshness** `[R]`: o verificador sinaliza `atualizadoHa`/sync > 6h **internamente/log**; a apresentação no texto continua governada pela F4 e pelo `freshness-stripper.ts` atual (regra vigente: não exibir tempo de atualização no corpo). Sem regressão.
- **Retry** `[R]`: **um único** ponto de retry corretivo por turno, **cap total = 1**, reusando o retry já existente do `auto-validator` (não somar um novo). Esclarecer no plano se reexecuta a tool (conta contra `MAX_ITERATIONS`) ou só reformula o texto (como hoje). Falha após o retry → **Falta Honesta**, nunca inventa.

## 6. Onda 3c , "Fora do Catálogo" (renomeação user-facing + endurecimento)

### 6.1 Renomeação `[R]` (escopo corrigido: NÃO é mecânica total)
- **Renomear (user-facing):** rótulos de UI (`router-decision-drilldown.tsx`, `router-decisions-table.tsx`), texto de mensagens de recusa (`mcp/lib/recusa.ts`), prompt/identidade, docs ativos. Diretório `mcp/tools/caminho3/ → mcp/tools/fora-do-catalogo/` + imports/`tool-to-domain.ts`.
- **NÃO renomear (estabilidade de contrato/dados):** a **chave de domínio interna `caminho3`** (`domain-vocabulary.ts`, `excludeFromFiltering=true`) , ela é gravada em `AgentRouterDecision.pickedDomains` (linhas históricas), participa de `computeVocabularyHash()/VOCABULARY_VERSION` (renomear invalidaria cache de embeddings + baseline de calibração do router) e é literal em `queries.ts`/UI. Tratada como identificador estável, igual a um id de tool. Nomes de role SQL (`nexus_mcp_bi`), env vars e paths de `provision-mcp.sql` também permanecem.
- **Critério de pronto:** zero ocorrência de "Caminho 3"/"caminho 3" em superfície **user-facing** (UI, recusa, prompt, docs ativos); a chave técnica `caminho3` pode permanecer no código com um comentário explicando que é identificador estável. `tsc`/`jest` verdes.

### 6.2 Endurecimento determinístico
- **Fora de Escopo:** retrieval vazio acima do limiar **e** sinal de assunto fora dos domínios de negócio → caminho de **recusa educada** decidido em código (o LLM só redige o texto), reusando `mcp/lib/recusa.ts`.
- **Falta Honesta:** dado no escopo mas inexistente (RH/CRM/Produção vazios, produto sem custo) → resposta honesta + `registrar_lacuna` (reusa `formatarLacunaAmbiguidade` da F2 + o safety-net atual de `run-agent.ts`). É a **política de falha do verificador (§5.2)** , por isso o caminho de gap é fundação compartilhada com a 3b (ver grafo §7).
- **Consulta BI Avançada:** `bi_consulta_avancada` (existe, gated admin/super_admin, `sql-guard`). O cérebro roteia pedido BI de admin; não-admin nunca a vê (RBAC).

## 7. Grafo de dependência entre ondas `[R]`

```
3a (retrieval + limiar)  ─┬─> 3c "Fora de Escopo" usa o limiar/score do 3a
                          └─> habilita catálogo enxuto

caminho de gap (Falta Honesta)  ── fundação compartilhada ──┬─> 3b (falha do verificador cai aqui)
                                                            └─> 3c (Falta Honesta é um ramo)
```
- **Ordem de execução sugerida:** 3a → (caminho de gap + rename do 3c) → 3b (verificador usa o gap) → restante do 3c (Fora de Escopo usa o limiar do 3a). Cada onda tem critério de aceite verificável sozinha, com stub do que a outra fornece.

## 8. Erro e segurança (fallbacks, regra de raiz)

- Retrieval vazio/baixa confiança → catálogo filtrado por RBAC cheio (comportamento de hoje).
- Classificador incerto, ou intenção incompatível com a tool → `pontual` + aviso.
- Verificador falha → retry compartilhado cap=1 → Falta Honesta; **nunca** resposta inventada.
- RBAC sempre **antes** do retrieval. Tool gated (BI, `contabil_detalhar_conta`) nunca aparece por similaridade.
- Toda flag nova (router active, V5-V7, injeção de intenção) nasce em **shadow**, vira active só com gate numérico (§4.5).
- Tool nova sem `embeddingText` → check de startup/CI falha (não fica invisível); e o piso já garante o domínio inteiro.

## 9. Testes e verificação

- **TDD por módulo:** `pick-tools`, `classify-intent` (com a tabela de precedência), cada check novo do `auto-validator` (V5-V7) , unitário com fixtures.
- **Mini-oráculo da F3** `[R]` (não é o golden da F5): **30-50 perguntas** com **tool-esperada anotada à mão** (derivadas das `[OK]` do dossie), vivendo como fixture da F3. Mede **recall@K** e **acurácia de seleção de tool**. Deixa explícito que é subconjunto-semente, não o golden formal (que é F5).
- **E2E contra cache real** (`nexus_odoo_l1`): exercer retrieval + intenção + verificador, conferindo seleção de tool e ausência de alucinação no mini-oráculo. Runner via tsx quando precisar do client Prisma (mesmo padrão da F2).
- **Shadow-compare:** rodar active em paralelo ao shadow e medir `chosenToolRank` no `AgentRouterDecision` estendido; só virar a chave com recall@K ≥ 98% (§4.5).
- **tsc raiz + `mcp/tsconfig.json` + jest** verdes por onda; rebuild dos containers afetados (app/mcp) por onda, da worktree, `--env-file .env.local`; worker via `build app`.

## 10. Fora de escopo (YAGNI)

- Golden dataset completo + métricas formais de eval → **Fase 5** (a F3 usa só o mini-oráculo-semente).
- Envelope canônico único + paginação 50/50 uniforme + humanização → **Fase 4** (o verificador da F3 só checa o que o shape atual já expõe).
- Custo/latência (alvo 1-2 centavos) → **Fase 6**.
- RH/CRM/Produção: continuam em "Falta Honesta" até virarem onda de dados.
- Reescrever o motor do `run-agent`, trocar provider de LLM, ou migrar a chave de domínio `caminho3`.

## 11. Critérios de sucesso

- LLM recebe catálogo enxuto (top-K + núcleo do domínio) coerente; tool gated nunca vaza por similaridade; nenhuma tool registrada fica sem `embeddingText`.
- Intenção exaustiva/ranking/amostragem classificada em código, com precedência definida, injetada nos args (não só no prompt), degradando com segurança.
- Verificador (V1-V7 no `auto-validator`) bloqueia número incoerente/alucinado e datas fora do período **onde o envelope suporta**, com retry compartilhado cap=1 e Falta Honesta.
- "Fora do Catálogo" com nome compreensível no user-facing; chave técnica `caminho3` preservada (sem quebrar calibração/histórico).
- **Gate numérico:** shadow-compare prova recall@K ≥ 98% no mini-oráculo antes de ligar o active. Sem regressão.
