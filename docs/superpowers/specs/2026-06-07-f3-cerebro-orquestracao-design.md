# F3 , Cérebro de Orquestração (spec v1)

> Reconstrução do Nex, Fase 3. Fonte de requisitos: `docs/superpowers/research/2026-06-06-dossie-MASTER.md` (seções 5.2 e 6, Fase 3). Fases 1 (métricas canônicas) e 2 (entidades/desambiguação) já em produção.
>
> Modo autônomo: esta spec passa por 2 reviews adversariais antes do plano.

---

## 1. Objetivo

Eliminar os dois maiores defeitos do agente hoje: **escolher a tool errada** e **alucinar/truncar**. O cérebro decide o(s) domínio(s), seleciona a(s) tool(s) certa(s) por recuperação semântica, classifica a intenção da pergunta e passa a resposta por um verificador determinístico antes de devolver. Tudo em TypeScript, reusando a infra existente.

Métrica de sucesso (alinhada à futura Fase 5 de evals): subir a acurácia de seleção de tool, zerar alucinação de número, e respeitar exaustiva/ranking/amostragem em vez de truncar arbitrariamente.

## 2. Decisões canônicas (já fixadas com o dono)

1. **Entrega:** spec única, plano executado em **3 ondas** (3a retrieval + router ativo; 3b intenção + verificador; 3c "Fora do Catálogo").
2. **Tool retrieval:** embedding por tool (descrição + exemplos) + router de domínio vira **active** (hoje roda em `shadow`). Reusa pgvector + `embed.ts`.
3. **Classificador de intenção:** determinístico leve (regex/keywords) → `exaustiva | ranking | amostragem | pontual`.
4. **Verificador:** consolidar o pipeline determinístico atual num módulo nomeado e estender com checagens faltantes; não reescrever do zero.
5. **Renomeação "Caminho 3" → "Fora do Catálogo".** Jargão opaco eliminado. Ramos renomeados:
   - **Falta Honesta** (era 3a): não temos o dado no escopo → resposta honesta de falta + log em `feature_requests`.
   - **Fora de Escopo** (era 3b): pergunta não é de negócio → recusa educada.
   - **Consulta BI Avançada** (era 3c): SQL sob demanda via `bi_consulta_avancada`, restrito a admin/super_admin.
   - O código (`mcp/tools/caminho3/` + referências) é renomeado na **onda 3c**.

## 3. Arquitetura e fluxo

Camada determinística em `src/lib/agent/`, entre a chegada da pergunta e o tool-calling do LLM. Orquestrador atual: `src/lib/agent/run-agent.ts` (loop até 3 iterações). O cérebro insere/fortalece passos sem trocar o motor.

Fluxo alvo:

```
pergunta
  → embed (router/embed-question.ts, cache LRU)
  → filtro RBAC (filter-catalog camada B + visibleTools no MCP)        [já existe]
  → RETRIEVAL de tools top-K (router/pick-tools.ts)                    [NOVO 3a]
  → classificação de intenção (router/classify-intent.ts)             [NOVO 3b]
  → LLM com catálogo enxuto + hint de intenção                        [ajuste]
  → executa tool (session.callTool)                                    [já existe]
  → VERIFICADOR determinístico (verifier/*)                           [consolida+estende 3b]
  → (retry 1x | Falta Honesta | Fora de Escopo | responde)           [3c]
```

**Princípio de raiz:** todo passo novo tem fallback seguro. Nenhuma camada nova pode piorar o estado atual: em baixa confiança/vazio, cai no comportamento de hoje (catálogo filtrado cheio, intenção `pontual`, verificador em modo aviso).

## 4. Onda 3a , Tool Retrieval + Router ativo

**Problema:** hoje o router escolhe **domínio** por embedding mas roda em `shadow` (manda o catálogo inteiro ao LLM, só loga a decisão). Não há ranking de tool individual.

**Entrega:**
- **Vetores de tool:** estender a infra de `router/embed-domains.ts` para vetorizar cada tool por `descricao` + `examples` (campos já presentes em `ToolEntry`). Índice em cache no startup, igual aos vetores de domínio. Embeddings: OpenAI `text-embedding-3-small` (1536d), mesmo pipeline de `rag/embed.ts`.
- **`router/pick-tools.ts`:** dado o embedding da pergunta e o conjunto já filtrado por RBAC+domínio, rankeia tools por cosseno e retorna **top-K** (K configurável, default a definir no plano). **Piso de segurança:** sempre inclui tools `sempreVisivel` e um núcleo mínimo do(s) domínio(s) escolhido(s), para nunca esconder a tool certa por ruído de embedding.
- **Router active:** `filter-catalog.ts` passa a entregar o catálogo enxuto (top-K) quando `routerEnabled=active`; mantém o catálogo filtrado cheio como fallback (confiança baixa, retrieval vazio, ou flag desligada). RBAC aplicado **antes** do retrieval (defesa estrutural, não por ranking).
- **Shadow-compare antes de virar a chave:** usar o log `AgentRouterDecision` para comparar, num período, a tool escolhida pelo LLM (catálogo cheio) vs a que o retrieval teria oferecido, garantindo que o active não regride.

**Reuso:** `pickDomains`, `filterCatalog`, `embed-question.ts`, `embed-domains.ts`, pgvector, `AgentRouterDecision`.

## 5. Onda 3b , Classificador de Intenção + Verificador

### 5.1 Classificador de intenção
- **`router/classify-intent.ts`:** função pura determinística (regex/keywords pt-br) → `exaustiva | ranking | amostragem | pontual` (dossie seção 5.2):
  - exaustiva: "todos", "todas", "lista completa", "quais são os..." → tool retorna até 50, reporta "exibindo X de Y; pagine/filtre".
  - ranking: "top N", "maiores", "N que mais..." → exige `orderBy` explícito, retorna exatamente N.
  - amostragem: "um exemplo", "alguns", "me mostra um" → retorna 3 a 5.
  - pontual (default): consulta de valor único/agregado.
- O modo classificado vira **hint** para a montagem do input da tool (limit/orderBy/sample) e para a expectativa do envelope. Incerto → `pontual`.

### 5.2 Verificador determinístico
- **Consolidar** o pós-processamento atual num módulo nomeado `src/lib/agent/verifier/` (hoje espalhado em `validation/auto-validator.ts`, guardrail factual em `run-agent.ts`, `quality/freshness-stripper.ts`, safety-net de gap em `run-agent.ts`).
- **Estender** com checagens faltantes, todas determinísticas sobre os `toolResult` (envelopes), nunca no LLM:
  - **Totais batem com itens:** soma das linhas == `_agregado`/total declarado (tolerância de arredondamento).
  - **Datas no período:** toda data retornada dentro do `[periodoDe, periodoAte]` pedido.
  - **Anti-JOIN-duplicado:** sinal quando contagem de itens sugere duplicação por join (ex.: cliente/fornecedor misturado).
  - **Freshness:** expõe `atualizadoHa`; avisa se sync > 6h.
- **Política de falha:** verificador falhou → **retry 1x** (reexecuta a tool / reformula) → se ainda falha → **Falta Honesta** (resposta honesta + log), **nunca inventa**. Sai do modo `shadow` onde o sinal for confiável; mantém shadow nas checagens novas até calibrar.

**Reuso:** `auto-validator.ts`, guardrail factual (`findInventedValues`/`detectsHallucinatedNonEmpty`), `freshness-stripper.ts`, safety-net de gap.

## 6. Onda 3c , "Fora do Catálogo" (renomeação + endurecimento)

**Renomeação (mecânica, tsc/jest verdes):** `mcp/tools/caminho3/` → `mcp/tools/fora-do-catalogo/`; atualizar imports, `tool-to-domain.ts`, comentários e qualquer rótulo de UI/prompt. Os ids das tools (`registrar_lacuna`, `bi_consulta_avancada`) **não mudam** (contrato externo estável); muda só a organização/nome interno e a terminologia.

**Endurecimento determinístico:**
- **Fora de Escopo:** quando o retrieval volta vazio acima do limiar **e** a intenção/embedding indica assunto fora dos domínios de negócio → caminho de **recusa educada** decidido em código, não só confiando no LLM (o LLM ainda redige o texto).
- **Falta Honesta:** dado dentro do escopo mas inexistente (ex.: RH/CRM/Produção vazios, produto sem custo) → resposta honesta + `registrar_lacuna` (já existe `formatarLacunaAmbiguidade` da F2 e o safety-net). Ligar ao caminho determinístico de gap.
- **Consulta BI Avançada:** `bi_consulta_avancada` (já existe, gated admin/super_admin, com `sql-guard`). O cérebro roteia pedido BI de admin para essa tool; não-admin nunca a vê (RBAC).

## 7. Reuso vs construção (resumo)

| Reusar (não reescrever) | Construir/estender |
|---|---|
| `pickDomains` + `filterCatalog` (router de domínio) | `router/pick-tools.ts` (retrieval de tool individual) |
| pgvector + `rag/embed.ts` + `embed-domains.ts`/`embed-question.ts` | vetores de tool + índice em cache |
| RBAC `visibleTools`/`assertToolAllowed` + `userDomainAccess` | router `shadow → active` com fallback |
| `auto-validator`, guardrail factual, `freshness-stripper`, safety-net gap | módulo `verifier/` (consolida) + checagens novas |
| `registrar_lacuna`, `bi_consulta_avancada`, `sql-guard` | `classify-intent.ts`; rename `caminho3 → fora-do-catalogo` |
| multi-LLM `buildLlmClient`; `AgentRouterDecision` (log/calibração) | shadow-compare de retrieval antes do active |

## 8. Erro e segurança (fallbacks, regra de raiz)

- Retrieval vazio/baixa confiança → catálogo filtrado por RBAC cheio (comportamento de hoje).
- Classificador incerto → `pontual`.
- Verificador falha → retry 1x → Falta Honesta; **nunca** resposta inventada.
- RBAC sempre **antes** do retrieval (defesa estrutural, não por ranking de embedding). Tool gated (ex.: BI, `contabil_detalhar_conta`) nunca aparece por similaridade.
- Toda flag nova (router active, checagens novas do verificador) é **config-gated** e começa em shadow até calibrar.

## 9. Testes e verificação

- **TDD por módulo:** `pick-tools`, `classify-intent`, cada checagem do `verifier` (unitário com fixtures).
- **E2E contra cache real** (regra de raiz): exercer retrieval + intenção + verificador contra `nexus_odoo_l1`, conferindo seleção de tool e ausência de alucinação num subconjunto das perguntas-ouro do dossie (as ~199 `[OK]`).
- **Shadow-compare:** rodar active em paralelo ao shadow e medir divergência via `AgentRouterDecision` antes de ligar de vez.
- **tsc raiz + `mcp/tsconfig.json` + jest** verdes por onda; rebuild dos containers afetados (app/mcp) por onda, da worktree, `--env-file .env.local`.

## 10. Fora de escopo (YAGNI)

- Golden dataset completo + métricas de eval formais → **Fase 5**.
- Otimização de custo/latência (alvo 1-2 centavos) → **Fase 6**.
- Apresentação/paginação 50/50 uniforme e humanização → **Fase 4** (o verificador só sinaliza; a apresentação canônica é F4).
- RH/CRM/Produção: continuam respondendo "Falta Honesta" até virarem onda de dados.
- Reescrever o motor do `run-agent` ou trocar provider de LLM.

## 11. Critérios de sucesso

- O LLM recebe um catálogo enxuto (top-K) coerente com a pergunta, não o catálogo inteiro; tool gated nunca vaza por similaridade.
- Intenção exaustiva/ranking/amostragem classificada em código e respeitada (sem truncar "top 10" em 3, sem despejar 5000 em "um exemplo").
- Verificador determinístico bloqueia número incoerente/alucinado e datas fora do período, com retry e gap honesto.
- "Fora do Catálogo" com nome compreensível e três ramos claros, decididos por código onde possível.
- Nenhuma regressão: shadow-compare prova que o active não piora a seleção antes de ligar.
