# Estado da arte em memória conversacional para agentes de IA (2025-2026)

> Pesquisa web realizada em 2026-06-12. Contexto: o Agente Nex é um agente TypeScript
> próprio (sem framework), cujo histórico hoje é o replay das últimas N mensagens da
> conversa armazenadas no Postgres, com tool results antigos podados. Sintoma relatado:
> o agente "esquece" o que foi falado. Este documento consolida as técnicas comprovadas,
> o que as APIs oferecem nativo, e a arquitetura recomendada em camadas para o nosso caso.

---

## 1. Achados principais (com fontes)

### 1.1 O consenso de 2025-2026: replay puro de N mensagens é a estratégia que TODOS abandonaram

Toda a literatura de produção converge no mesmo diagnóstico: mandar "as últimas N mensagens"
quebra rápido. Contexto importante do início da sessão se perde, o agente repete perguntas e a
experiência degrada ([Mem0, guia de sumarização, out/2025](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)).
Além da perda, há o problema de atenção: mesmo quando o histórico inteiro cabe na janela, LLMs
performam mal em contextos longos, se "distraem" e sofrem do efeito *lost in the middle*
([LangChain, Memory overview](https://docs.langchain.com/oss/python/concepts/memory);
[Anthropic, Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

O princípio guia da Anthropic (set/2025) virou o lema da área: **encontrar o menor conjunto
possível de tokens de alto sinal que maximiza o resultado desejado**. Contexto é um recurso
finito de atenção, não um log a ser despejado.

Números que sustentam a tese:
- Anthropic mediu **+29% de performance só com context editing** (limpeza de tool results velhos)
  e **+39% combinando com memory tool** persistente
  ([Claude docs, Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing);
  [Claude Cookbook, context engineering](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools)).
- Zep (knowledge graph temporal) reporta **+18,5% de acurácia com 90% menos latência** vs.
  replay de contexto completo no benchmark LongMemEval
  ([paper arXiv 2501.13956](https://arxiv.org/abs/2501.13956)).
- Mem0 reporta cortes de 80-90% em custo de token vs. replay bruto
  ([Mem0, guia 2025](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)).

### 1.2 Técnica 1: janela recente íntegra + resumo progressivo (a base de tudo)

O padrão dominante e comprovado é o **híbrido verbatim + resumo**: manter os últimos K turnos
literais (preserva números exatos, tom, e o fio imediato da conversa) e comprimir tudo que é
mais antigo em um **resumo progressivo** (rolling summary) que é atualizado incrementalmente,
nunca recalculado do zero
([Mem0](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025);
[Maxim AI](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/);
[CallSphere](https://callsphere.ai/blog/context-window-management-ai-agents-summarization-pruning-sliding-2026)).
Referência típica citada: resumir tudo acima de ~20 mensagens, manter as últimas ~10 literais.

A Anthropic chama a versão de "estouro" disso de **compaction** (é o que o Claude Code faz):
ao se aproximar do limite, o modelo resume o histórico preservando decisões, pendências e
detalhes de implementação, descartando tool outputs redundantes, e a sessão continua com o
resumo + os itens mais recentes. A arte está na seleção: compactação agressiva demais perde
contexto sutil cuja importância só aparece depois. A recomendação deles para calibrar o prompt
de resumo: **primeiro maximizar recall** (capturar tudo de relevante), depois iterar em
precisão (eliminar redundância)
([Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

O MemGPT/Letta formalizou isso como "sumarização recursiva" gerida pelo próprio agente, com
hierarquia inspirada em SO: contexto principal (RAM), recall storage (histórico pesquisável)
e archival storage (vetor)
([Letta, MemGPT legacy docs](https://docs.letta.com/guides/legacy/memgpt_agents_legacy)).

### 1.3 Técnica 2: working memory estruturada (o "foco atual") e memory blocks

A inovação mais copiável do Letta é o **memory block**: uma string rotulada, persistida em
banco, com limite de tamanho, que é SEMPRE recompilada para dentro do contexto a cada request
(o contexto é "compilado" do estado do banco a cada chamada, não é um log corrido)
([Letta, Memory Blocks, mai/2025](https://www.letta.com/blog/memory-blocks)).
Cada bloco tem: `label` (propósito), `value` (string), `limit` (tamanho máximo) e flag
read-only. Os blocos clássicos são "human" (fatos sobre o usuário) e "persona", mas o padrão
generaliza para qualquer estado de trabalho.

Para um agente de BI/dados como o Nex, o bloco que resolve o sintoma relatado é a **working
memory do foco analítico**: o que o usuário está analisando AGORA (produto/modelo, período,
métrica, filial/empresa, último resultado numérico relevante). Esse estado estruturado é
pequeno (centenas de tokens), determinístico de extrair (os argumentos das tool calls JÁ
contêm produto, período e métrica) e é exatamente o que torna "e do mês passado?" resolvível.

A pesquisa acadêmica confirma a direção: memória de entidades canonicalizadas (nome, cluster
de correferência, tipo) ligada a um índice de retrieval melhora recall factual e coerência de
discurso em até 18% sobre baselines RAG fortes
([Semantic Anchoring in Agentic Memory, arXiv 2508.12630](https://arxiv.org/pdf/2508.12630);
survey [From Human Memory to AI Memory, arXiv 2504.15965](https://arxiv.org/pdf/2504.15965)).

### 1.4 Técnica 3: resolução de anáfora ("isso", "ela", "e do mês passado?") via query rewriting

LLMs erram rotineiramente expressões como "esse aí parece bom" em diálogos com muitas
entidades ([survey multi-turn, arXiv 2504.04717](https://arxiv.org/pdf/2504.04717)). O padrão
de produção consagrado (usado por Bing e XiaoIce, e formalizado na literatura de
conversational search) é o **Contextual Query Rewriting (CQR)**: reescrever a pergunta de
follow-up em uma pergunta autocontida, livre de dêiticos, ANTES de rotear para tools/retrieval.
Ex.: "e do mês passado?" vira "qual o faturamento de esteiras em maio/2026?"
([CHIQ, arXiv 2406.05013](https://arxiv.org/pdf/2406.05013);
[Contextualizing Search Queries In-Context, arXiv 2502.15009](https://arxiv.org/html/2502.15009v1);
[Shekhar Gulati, Query Rewriting in RAG](https://shekhargulati.com/2024/07/17/query-rewriting-in-rag-applications/)).

As três dependências contextuais a cobrir: **correferência** (isso/ela/desse), **elipse**
("e em SP?" omite a métrica) e **context carryover** (a intenção persiste por vários turnos).
O insight prático para o nosso caso: com a working memory estruturada do item 1.3, a maior
parte da resolução vira **determinística** (shift de período sobre o período em foco; "ela" =
última entidade do tipo compatível mencionada), e o rewrite por LLM fica só para o resto.

### 1.5 Técnica 4: retrieval sobre o histórico da própria conversa

Para conversas de 30+ turnos (e para "lembra o que falamos semana passada?"), o padrão é
indexar o histórico (FTS e/ou embeddings) e injetar só os trechos relevantes ao turno atual,
em vez de replay ([Mem0](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025);
[Redis/LangGraph tutorial](https://redis.io/tutorials/what-is-agent-memory-example-using-langgraph-and-redis/)).
O MemGPT/Letta expõe isso como tool explícita do agente (`conversation_search` /
`archival_memory_search`): o agente decide quando buscar
([Letta docs](https://docs.letta.com/guides/legacy/memgpt_agents_legacy)).
O benchmark LoCoMo (memória conversacional de longuíssimo prazo) é a régua da área; soluções
com retrieval estruturado (Zep/Graphiti ~75-94% conforme a configuração) superam replay
([arXiv 2501.13956](https://arxiv.org/abs/2501.13956);
[Evaluating Very Long-Term Conversational Memory, arXiv 2402.17753](https://arxiv.org/html/2402.17753v1)).
Para nosso volume (conversas de dezenas de turnos, não milhares), **FTS no Postgres já
existente + pgvector quando chegar a F5/RAG** é suficiente; knowledge graph temporal (Zep) é
overkill documentado para esse estágio.

### 1.6 Técnica 5: poda de tool results com destilação, nunca silenciosa

A poda cega de tool results antigos (o que fazemos hoje) é apontada como causa direta de
"esquecimento": o usuário referencia "aquele número que você me mostrou" e o número já não
existe no contexto. O padrão correto, adotado pela Anthropic como feature de API
(`clear_tool_uses_20250919`) e recomendado em todos os guias, é **substituir o tool result
velho por um digest curto** (1-3 linhas com os números-chave e um marcador de que o resultado
completo foi resumido), preservando a âncora referencial
([Claude docs, Context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing);
[CallSphere](https://callsphere.ai/blog/context-window-management-ai-agents-summarization-pruning-sliding-2026)).

### 1.7 Taxonomia consolidada (LangGraph/LangMem) que vale adotar como vocabulário

A divisão canônica de memória em frameworks 2025-2026, útil como vocabulário mesmo sem adotar
framework ([LangChain Memory docs](https://docs.langchain.com/oss/python/concepts/memory);
[LangMem SDK](https://www.langchain.com/blog/langmem-sdk-launch)):
- **Short-term / thread-scoped**: estado da conversa atual (mensagens + resumo + working
  memory). No LangGraph vive no checkpointer; no nosso caso, nas tabelas da conversa.
- **Long-term / cross-thread**: fatos que sobrevivem à conversa, em 3 tipos:
  **semântica** (fatos sobre o usuário e o domínio: "o usuário chama esteira de 'TF50'"),
  **episódica** (resumos de conversas passadas com timestamp) e
  **procedural** (regras de comportamento aprendidas; para nós, fora de escopo agora).

---

## 2. O que a OpenAI oferece nativo hoje (e o que NÃO oferece)

Fonte primária: [OpenAI, Conversation state guide](https://developers.openai.com/api/docs/guides/conversation-state)
e [guia de migração para Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses).

| Recurso | O que faz | Limitações para nós |
|---|---|---|
| `previous_response_id` | Encadeia responses; o modelo enxerga todo o histórico da cadeia, incluindo reasoning items (ganho de performance em modelos de raciocínio) | **Todos os tokens anteriores da cadeia são cobrados como input a cada turno** (sem economia vs. replay manual). Response objects expiram em 30 dias. Instructions de topo NÃO são herdadas (reenviar a cada turno). Cadeia linear: difícil editar/podar o meio. |
| Conversation objects (`conversation=conv_...`) | Objeto durável que armazena items (mensagens, tool calls, tool outputs) **sem TTL de 30 dias**; persiste entre sessões/dispositivos | É só armazenamento + replay gerenciado. **Não resume, não comprime, não gerencia janela** (além de `truncation: "auto"`, que simplesmente DESCARTA itens do meio quando estoura: poda cega, exatamente o anti-padrão). Billing idêntico ao replay. Lock-in do histórico na OpenAI. |
| `store: false` | Desliga retenção | n/a |

**Conclusão objetiva:** o estado nativo da OpenAI resolve *transporte e persistência* do
histórico, não *memória*. Sumarização progressiva, working memory, memória de entidades,
retrieval e destilação de tool results **precisam ser construídos por nós** de qualquer forma.
Como já temos o histórico no Postgres (com RBAC, multi-canal WhatsApp/in-app e auditoria
próprios), **manter o estado self-managed é a decisão certa**; usar Conversations API
adicionaria lock-in sem eliminar nenhuma das construções acima. Análise de terceiros no mesmo
sentido: [Sean Goedecke sobre a Responses API](https://www.seangoedecke.com/responses-api/).

### Padrões do LangGraph / MemGPT / Letta que vale copiar SEM adotar o framework

1. **Memory blocks compilados do banco a cada request** (Letta): o prompt não é um log, é uma
   *view* montada do estado persistido. Copiar: blocos `perfil_usuario`, `resumo_conversa`,
   `foco_atual`, cada um com limite de tamanho ([Letta](https://www.letta.com/blog/memory-blocks)).
2. **Hierarquia em 3 camadas** (MemGPT): sempre-em-contexto / pesquisável-sob-demanda /
   arquivo frio. Copiar a hierarquia; NÃO copiar o self-editing pelo modelo em produção
   (agente editando a própria memória via tool é fonte de drift; preferir atualização
   determinística + extração assíncrona, ver §4 pitfall 6).
3. **Tool de busca no próprio histórico** (`conversation_search` do MemGPT): dar ao Nex uma
   tool `buscar_na_conversa(termo, periodo?)` sobre FTS do Postgres, para o caso raro em que
   nem janela nem resumo nem working memory contêm a referência.
4. **Hook de gestão de mensagens antes de cada chamada ao modelo** (LangGraph
   `SummarizationNode` / `pre_model_hook`): um único ponto no pipeline que decide trim +
   resumo + injeção, idempotente, testável isoladamente
   ([LangChain docs](https://docs.langchain.com/oss/python/concepts/memory)).
5. **Separação checkpointer vs. store** (LangGraph): estado da conversa (thread) separado de
   fatos do usuário (cross-thread). Já temos a separação natural em tabelas; formalizar.

---

## 3. Arquitetura recomendada em camadas para o Nex

### 3.1 Visão geral (5 camadas, da mais quente para a mais fria)

```
L0  System prompt + catálogo de tools          (estático, cacheável)
L1  Perfil do usuário (memória semântica)      (~100 tokens, muda raramente)
L2  Resumo progressivo da conversa             (~300-600 tokens, atualizado async)
L3  Janela recente VERBATIM (últimos K turnos) (~2.000-4.000 tokens)
    + digests de tool results podados          (1-3 linhas cada, no lugar do result)
L4  Working memory estruturada (foco atual)    (~150-250 tokens, recalculada por turno)
--- sob demanda ---
L5  Retrieval sobre histórico (FTS/pgvector)   (~0-800 tokens, só quando relevante)
```

Ordem de montagem do prompt (pensando em prompt caching por prefixo): L0 e L1 primeiro
(prefixo estável = cache hit), L2 em seguida (muda a cada poucos turnos), depois L3, e L4
por último como mensagem de sistema do turno (volátil por natureza, já fora do prefixo
cacheável). Resultado: o que muda todo turno fica no fim; o cache de prefixo continua valendo.

### 3.2 Schema concreto (Prisma, nomes ilustrativos alinhados ao padrão do projeto)

```prisma
// JÁ EXISTE (conversa + mensagens). Acrescentar:

model AgentConversation {
  // ... campos atuais ...
  resumoProgressivo   String?  @db.Text   // L2: rolling summary, cap ~600 tokens
  resumoAteMensagemId String?             // ponteiro: até onde o resumo cobre
  resumoAtualizadoEm  DateTime?
  focoAtual           Json?               // L4: working memory (ver shape abaixo)
}

model AgentMessage {
  // ... campos atuais ...
  toolDigest String? @db.Text  // L3: destilação 1-3 linhas quando o tool result for podado
  // índice FTS (L5): via migration SQL
  // CREATE INDEX agent_message_fts ON "AgentMessage"
  //   USING gin(to_tsvector('portuguese', content));
}

// L1 + 1.7 memória semântica cross-conversa (nova, pequena)
model AgentUserMemory {
  id        String   @id @default(cuid())
  userId    String
  tipo      String   // 'preferencia' | 'fato' | 'alias'  (alias: "TF50" => modelo X)
  chave     String
  valor     String
  fonte     String?  // messageId que originou
  criadoEm  DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  @@unique([userId, tipo, chave])
}

// Memória de entidades da conversa (resolução anafórica)
model ConversationEntity {
  id              String   @id @default(cuid())
  conversationId  String
  tipo            String   // 'produto' | 'cliente' | 'periodo' | 'metrica' | 'filial' | 'fornecedor'
  chaveCanonica   String   // ex.: product_id do cache, ou '2026-05' para período
  rotulo          String   // como o usuário chamou ("a esteira", "TF50")
  ultimoTurno     Int      // último turno em que foi mencionada (recência p/ desambiguar "ela")
  mencoes         Int      @default(1)
  @@unique([conversationId, tipo, chaveCanonica])
  @@index([conversationId, ultimoTurno])
}
```

**Shape do `focoAtual` (L4, working memory):**

```ts
type FocoAtual = {
  metrica?:   { nome: string; toolUsada: string };          // 'faturamento', 'estoque'...
  periodo?:   { inicio: string; fim: string; rotulo: string }; // '2026-05', "maio"
  entidades?: { tipo: string; chave: string; rotulo: string }[]; // produto/cliente/filial em foco
  ultimoResultado?: { resumo: string; valorChave?: string; messageId: string };
  // ex.: { resumo: "faturamento esteiras maio/2026", valorChave: "R$ 412.380,00", ... }
  turnoAtualizado: number;
};
```

### 3.3 O que PERSISTIR por turno (pipeline pós-resposta, assíncrono, fora do caminho crítico)

1. **Sempre (síncrono, já existe):** mensagens user/assistant + tool calls/results íntegros.
2. **Determinístico (síncrono, barato, sem LLM):** atualizar `focoAtual` e `ConversationEntity`
   a partir dos **argumentos das tool calls executadas** (período, produto, métrica já chegam
   estruturados no handler) + valor-chave da resposta da tool. É o coração da correção do
   "esquecimento" e não custa nenhum token.
3. **Assíncrono (job BullMQ, a cada turno ou a cada 2-3 turnos):**
   - se `mensagens não cobertas pelo resumo > K` (K=10 sugerido): atualizar
     `resumoProgressivo` com prompt incremental: entrada = resumo atual + delta de turnos
     novos; saída cap ~600 tokens; instrução de preservar decisões, números citados,
     perguntas em aberto e correções do usuário (recall primeiro, precisão depois, §1.2);
   - ao podar tool results velhos: gravar `toolDigest` (1-3 linhas com os números-chave)
     antes de remover o payload;
   - extração de memória semântica (L1): detectar preferências/aliases novos e fazer upsert
     em `AgentUserMemory` (LLM pequeno, com dedupe pela unique key).

### 3.4 O que INJETAR por turno (montagem do prompt) e custo em tokens

| Camada | Conteúdo | Custo típico/turno | Quando injeta |
|---|---|---|---|
| L0 | system prompt + tools | já existente (cacheável) | sempre |
| L1 | perfil/aliases do usuário (top ~10 entradas) | ~100-150 | sempre |
| L2 | `resumoProgressivo` | ~300-600 | quando conversa > K turnos |
| L3 | últimos K=8-12 mensagens verbatim (tool results recentes íntegros; antigos como `toolDigest`) | ~2.000-4.000 | sempre |
| L4 | `focoAtual` serializado compacto + 5 entidades mais recentes | ~150-250 | sempre |
| L5 | top-2/3 trechos via FTS quando o turno referencia algo fora de L2-L4 (ou via tool `buscar_na_conversa`) | 0-800 | sob demanda |

**Overhead total da memória sobre o replay atual: ~600-1.800 tokens/turno** (L1+L2+L4, mais
L5 eventual), em troca de PODER REDUZIR a janela verbatim (hoje N mensagens cruas) para K=8-12.
Em conversas longas o prompt fica MENOR e mais barato que o replay atual, com mais memória
efetiva. Resumo assíncrono: 1 chamada de modelo pequeno a cada 2-3 turnos (~1-2k tokens in,
~600 out), fora do caminho de latência do usuário.

### 3.5 Resolução anafórica por turno (antes do roteamento de tools)

Pipeline barato, na chegada da mensagem:
1. **Heurística determinística primeiro:** se a mensagem contém dêitico/elipse
   ("isso", "ela", "desse", "e em/do/de ...?", mensagem < ~6 palavras com interrogação),
   resolver contra `focoAtual` + `ConversationEntity` (recência por `ultimoTurno`):
   "e do mês passado?" = mesma métrica + mesmas entidades + `periodo - 1 mês`. Zero token.
2. **Fallback CQR:** se a heurística não fecha, 1 chamada de modelo pequeno com
   L4 + últimos 4 turnos: "reescreva como pergunta autocontida". Saída alimenta APENAS o
   roteamento de tools/retrieval; a mensagem original do usuário permanece no histórico.
   Logar a reescrita no audit (depuração de mal-entendidos).
3. O texto reescrito (ou os slots resolvidos) entra nos argumentos da tool; o `focoAtual`
   é atualizado com o resultado (fechando o ciclo).

---

## 4. Pitfalls (erros documentados a evitar)

1. **Poda silenciosa de tool results** (nosso bug atual): nunca deletar sem deixar digest.
   A referência "aquele número" precisa de âncora textual no contexto
   ([Claude context editing](https://platform.claude.com/docs/en/build-with-claude/context-editing)).
2. **Resumir tudo, inclusive o recente:** resumo destrói números exatos e nuance do fio
   imediato. A janela recente fica SEMPRE verbatim
   ([Mem0](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)).
3. **Drift de resumo recursivo:** re-resumir resumos degrada a cada iteração. Atualização
   sempre incremental (resumo atual + delta de turnos crus), com cap de tamanho e seção fixa
   de "fatos e números citados" que o prompt manda preservar literalmente
   ([Anthropic, recall antes de precisão](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
4. **Quebrar o prompt caching:** bloco volátil (working memory) no INÍCIO do prompt invalida
   o cache de prefixo a cada turno. Ordem: estável primeiro, volátil no fim (§3.1).
5. **`previous_response_id`/Conversations como "memória":** é só replay gerenciado; cobra
   todos os tokens do histórico a cada turno, TTL de 30 dias nos responses soltos, e
   `truncation: "auto"` é poda cega. Não substitui nenhuma camada
   ([OpenAI docs](https://developers.openai.com/api/docs/guides/conversation-state)).
6. **Self-editing de memória pelo modelo em produção** (padrão Letta): agente decidindo o que
   gravar via tool em loop aberto gera drift e lixo acumulado. Para dados estruturados de BI,
   a extração determinística dos argumentos de tool é mais confiável; LLM só no resumo e na
   extração semântica assíncrona, com dedupe e cap.
7. **Sumarização síncrona no caminho da resposta:** adiciona latência percebida. Sempre em job
   (BullMQ já existe na stack).
8. **Over-engineering de grafo:** knowledge graph temporal (Zep/Graphiti) ganha benchmark em
   memória de meses/milhares de turnos cross-sessão; para conversas de dezenas de turnos com
   domínio fechado, tabela de entidades + FTS entrega o mesmo resultado prático com fração da
   complexidade ([arXiv 2501.13956](https://arxiv.org/abs/2501.13956)).
9. **Lost in the middle:** não enterrar a informação crítica no meio de um histórico longo;
   resumo no topo, recente no fim, working memory adjacente à pergunta atual
   ([LangChain](https://docs.langchain.com/oss/python/concepts/memory)).
10. **Conflito entre memórias:** quando L1/L2 contradizem a janela recente, a mais recente
    vence; o prompt deve dizer isso explicitamente (conflict resolution por recência,
    [Mem0](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)).

---

## 5. Fontes

- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (set/2025)
- Anthropic, [Context editing (API)](https://platform.claude.com/docs/en/build-with-claude/context-editing) e [Cookbook: memory, compaction, tool clearing](https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools)
- OpenAI, [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) e [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- Letta, [Memory Blocks: The Key to Agentic Context Management](https://www.letta.com/blog/memory-blocks) e [MemGPT agents](https://docs.letta.com/guides/legacy/memgpt_agents_legacy)
- LangChain, [Memory overview](https://docs.langchain.com/oss/python/concepts/memory) e [LangMem SDK](https://www.langchain.com/blog/langmem-sdk-launch)
- Mem0, [LLM Chat History Summarization: Best Practices (out/2025)](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) e [Context Engineering Guide](https://mem0.ai/blog/context-engineering-ai-agents-guide)
- Zep, [A Temporal Knowledge Graph Architecture for Agent Memory (arXiv 2501.13956)](https://arxiv.org/abs/2501.13956); [Graphiti](https://github.com/getzep/graphiti)
- CHIQ, [Contextual History Enhancement for Query Rewriting (arXiv 2406.05013)](https://arxiv.org/pdf/2406.05013); [Conversational rewriting com LLMs (arXiv 2502.15009)](https://arxiv.org/html/2502.15009v1)
- [Semantic Anchoring in Agentic Memory (arXiv 2508.12630)](https://arxiv.org/pdf/2508.12630); [From Human Memory to AI Memory, survey (arXiv 2504.15965)](https://arxiv.org/pdf/2504.15965); [Beyond Single-Turn, survey (arXiv 2504.04717)](https://arxiv.org/pdf/2504.04717)
- [Evaluating Very Long-Term Conversational Memory (LoCoMo, arXiv 2402.17753)](https://arxiv.org/html/2402.17753v1)
- Guias de mercado: [Maxim AI](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/), [CallSphere](https://callsphere.ai/blog/context-window-management-ai-agents-summarization-pruning-sliding-2026), [Sean Goedecke sobre Responses API](https://www.seangoedecke.com/responses-api/), [Redis + LangGraph](https://redis.io/tutorials/what-is-agent-memory-example-using-langgraph-and-redis/)
