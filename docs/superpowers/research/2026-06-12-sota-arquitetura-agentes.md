# SOTA em arquiteturas de agentes de IA para consulta de dados empresariais (2025-2026)

> Pesquisa web realizada em 2026-06-12. Foco: padrões de orquestração agêntica,
> tool use com catálogos grandes (100+ tools), roteamento por complexidade e
> arquiteturas comprovadas em produtos líderes (Databricks Genie, Snowflake
> Cortex Analyst, ThoughtSpot Spotter).
>
> Contexto do nosso sistema: agente TypeScript, OpenAI gpt-5.4-mini, 121 tools
> semânticas MCP sobre cache Postgres do ERP Odoo, validadores pós-resposta
> (números derivados do tool result), formatadores canônicos. Dor atual:
> respostas single-shot, sem planejamento multi-passo, modelo pequeno para
> perguntas compostas/explicativas.
>
> Convenção de confiabilidade usada em todo o documento:
> - **[COMPROVADO]** fonte primária (docs oficiais, paper revisado, produto em produção) e consenso entre fontes.
> - **[VENDOR]** afirmação de fornecedor sobre o próprio produto (benchmark interno, marketing). Direção provavelmente correta, números com sal.
> - **[ESPECULATIVO]** blog/benchmark de terceiros sem metodologia auditável, ou pesquisa ainda não validada em produção.

---

## 1. Padrões de orquestração agêntica: o que usar e quando

### 1.1 A hierarquia canônica (Anthropic) [COMPROVADO]

O guia "Building Effective Agents" da Anthropic continua sendo a referência de
consenso da indústria (citado por OpenAI, LangChain, Spring AI): **os sistemas
mais bem-sucedidos usam padrões simples e composáveis, não frameworks
complexos**. A regra de ouro: começar pela solução mais simples possível e só
adicionar complexidade quando o ganho medido justificar, porque todo padrão
agêntico troca latência e custo por qualidade.

Escada de complexidade (cada degrau só se o anterior falhar nos evals):

1. **Single-shot tool calling** (o que temos hoje): suficiente para perguntas
   diretas que mapeiam 1:1 para uma tool.
2. **Prompt chaining**: decompor em passos fixos quando a tarefa tem etapas
   previsíveis.
3. **Routing**: classificar a pergunta e despachar para fluxo/modelo
   especializado. A Anthropic cita explicitamente o caso de uso "perguntas
   fáceis/comuns para modelos menores, difíceis/incomuns para modelos mais
   capazes". É exatamente a nossa dor de "modelo pequeno para tudo".
4. **Parallelization** (sectioning/voting): sub-tarefas independentes em
   paralelo; guardrails em chamada separada da resposta principal (performa
   melhor do que a mesma chamada fazer os dois papéis).
5. **Orchestrator-workers**: um LLM central decompõe dinamicamente e delega,
   quando NÃO dá para prever as sub-tarefas de antemão.
6. **Evaluator-optimizer** (reflection): um LLM gera, outro critica em loop.
   A própria Anthropic delimita: **evitar** quando a qualidade de primeira
   tentativa já atende, quando o critério de avaliação é subjetivo, ou quando
   custo/latência pesam (aplicações em tempo real, orçamento de tokens curto).

Fontes: [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents), [PDF de padrões de arquitetura](https://resources.anthropic.com/hubfs/Building%20Effective%20AI%20Agents-%20Architecture%20Patterns%20and%20Implementation%20Frameworks.pdf).

### 1.2 ReAct vs Plan-Execute (planner-executor) [COMPROVADO na direção, números ESPECULATIVOS]

Consenso entre as fontes de 2026:

- **ReAct** (raciocinar-agir-observar em loop): melhor para tarefas
  exploratórias/adaptativas onde o próximo passo depende do resultado do
  anterior. Custo: cada ciclo soma tokens e latência sequencial; custo por
  tarefa imprevisível.
- **Plan-Execute**: o modelo (ou um modelo forte) gera um plano completo
  upfront, executores (que podem ser baratos) executam os passos, com síntese
  no final. Melhor para tarefas multi-passo com caminho previsível, que é o
  caso típico de perguntas analíticas compostas ("compare faturamento Q1 vs Q2
  e explique a variação por cliente"). Permite paralelizar passos
  independentes. Limitação: replanejar custa caro se o plano inicial estiver
  errado.
- Números circulando (benchmark LangChain 2026 citado em blog, sem metodologia
  auditável, tratar como [ESPECULATIVO]): Plan-Execute com ~92% de task
  completion vs ~85% do ReAct e redução de até 30% de tokens; ReAct típico
  2000-3000 tokens e 3-5 chamadas por tarefa.
- Sistemas de produção maduros **combinam os dois**: plano upfront para
  estrutura e paralelismo, com micro-loops ReAct curtos dentro de passos que
  exigem adaptação.
- Pesquisa recente (RP-ReAct, arXiv dez/2025) propõe separar um
  Reasoner-Planner de Proxy-Executors para tarefas enterprise complexas;
  resultado de paper, ainda não validado amplamente em produção
  [ESPECULATIVO].

Fontes: [Agent Architectures: ReAct vs Plan-Execute vs Graph Agents](https://dasroot.net/posts/2026/04/agent-architectures-react-plan-execute-graph-agents/), [RP-ReAct (arXiv 2512.03560)](https://arxiv.org/html/2512.03560v1), [Plan-and-Execute agents (Ema)](https://www.ema.ai/additional-blogs/addition-blogs/build-plan-execute-agents), [Union.ai planner com execução paralela](https://www.union.ai/blog-post/build-a-planner-agent-system-with-parallel-execution-flyte-2-0-multi-agent-orchestration-with-union-ai).

### 1.3 Reflection/self-critique: a evidência é CONTRA o self-critique puro [COMPROVADO]

Achado crítico e contraintuitivo, com implicação direta para nós:

- O paper "Large Language Models Cannot Self-Correct Reasoning Yet" (Huang et
  al., ICLR 2024) e o survey "When Can LLMs Actually Correct Their Own
  Mistakes?" (TACL 2024) mostram que **self-correction intrínseca (o modelo
  re-avaliar a própria resposta sem feedback externo) não melhora e
  frequentemente DEGRADA o resultado** em raciocínio aritmético, QA e geração
  de planos. O modelo que errou na primeira tentativa não tem sinal novo para
  acertar na segunda.
- O que funciona é **self-correction extrínseca**: feedback de ferramenta
  externa, executor de código, validador determinístico ou verificador com
  acesso a ground truth (linha CRITIC e sucessores). Quando o erro é apontado
  por uma fonte externa confiável, o retry do modelo melhora de verdade.
- Tradução para o nosso stack: **nossos validadores pós-resposta (números
  derivados do tool result) são exatamente o mecanismo certo segundo a
  literatura**. O upgrade comprovado não é adicionar um "critique seu próprio
  texto" no prompt, e sim **fechar o loop: quando o validador reprova, devolver
  o erro estruturado ao modelo para retry com o feedback** (hoje, se o fluxo
  apenas bloqueia/reformata, estamos usando metade do valor do validador).

Fontes: [LLMs Cannot Self-Correct Reasoning Yet (arXiv 2310.01798)](https://arxiv.org/abs/2310.01798), [Survey de self-correction (TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177/When-Can-LLMs-Actually-Correct-Their-Own-Mistakes), [CRITIC: correção via feedback de ferramenta](https://beancount.io/bean-labs/research-logs/2026/04/26/critic-llm-self-correct-tool-interactive-critiquing).

### 1.4 Quando single-shot ainda é o certo [COMPROVADO]

Tanto Anthropic quanto OpenAI ("A Practical Guide to Building Agents")
convergem: para pergunta simples que mapeia para uma tool, single-shot com
modelo barato é o ótimo de custo/latência, e a maioria das perguntas de um
sistema analítico é desse tipo. O erro de arquitetura não é ter single-shot;
é ter **só** single-shot, sem rota de escalada para perguntas compostas.
OpenAI recomenda começar com agente único e evoluir para multi-agente
(manager pattern: orquestrador chama agentes especializados como tools) apenas
quando a complexidade comprovadamente exigir.

Fontes: [A Practical Guide to Building Agents (OpenAI, PDF)](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf), [página do guia](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/).

---

## 2. OpenAI GPT-5.x: tool use com catálogos grandes e parâmetros da Responses API

### 2.1 Catálogos grandes degradam a seleção de tools [COMPROVADO]

- Injetar muitas definições de tool no contexto causa "prompt bloat": consome
  contexto, degrada a escolha da tool e aumenta alucinação de parâmetros. O
  paper RAG-MCP mediu seleção por retrieval (indexar descrições de tools e
  injetar só o top-k relevante) em 43,13% de acerto vs 13,62% do baseline que
  injeta todos os schemas, com menos da metade dos tokens [COMPROVADO no
  benchmark do paper; magnitude varia por modelo/setup].
- Números de degradação citados pela indústria (Writer.com): de ~87% de acerto
  com 500 tools para ~65% com 2.000; e degradação perceptível já a partir de
  ~10-20 tools simultâneas em modelos menores [ESPECULATIVO nos números exatos,
  direção consensual].
- **121 tools injetadas de uma vez está bem acima do regime saudável,
  especialmente para um modelo mini.** Esse é provavelmente um dos maiores
  ganhos disponíveis para nós.

Fontes: [RAG-MCP (arXiv 2505.03275)](https://arxiv.org/html/2505.03275v1), [When too many tools become too much context (Writer)](https://writer.com/engineering/rag-mcp/), [HumanMCP benchmark de tool retrieval](https://arxiv.org/html/2602.23367).

### 2.2 O que a OpenAI recomenda oficialmente para muitos tools [COMPROVADO]

- **`tool_search` nativo (gpt-5.4 e posteriores)**: declarar tools com
  `defer_loading: true`; o modelo busca tools relevantes sob demanda, carrega
  no contexto e usa. Recomendação oficial para "many functions or large
  schemas". Nosso modelo (gpt-5.4-mini) está na família suportada; confirmar
  suporte do mini na prática.
- **Namespaces**: agrupar tools por domínio (`crm`, `billing`...; no nosso
  caso `estoque`, `financeiro`, `comercial`, `fiscal`...). A descrição do
  namespace ajuda o modelo a escolher o que carregar; a descrição da function
  ajuda a usar corretamente depois de carregada.
- **Descrição da tool é prompt**: guidance específica da tool (quando usar,
  inputs obrigatórios, modos de erro, idempotência) vive na descrição da
  própria tool, não no system prompt.
- A Anthropic converge com guidance própria: consolidar tools (uma tool
  significativa em vez de N wrappers finos de API), nomes/descrições lapidados
  por evals, respostas de tool com paginação/limites de tokens e mensagens de
  erro que ensinam o agente a corrigir a chamada.

Fontes: [Function calling (OpenAI)](https://platform.openai.com/docs/guides/function-calling), [Using GPT-5.5 (OpenAI)](https://developers.openai.com/api/docs/guides/latest-model), [Writing effective tools for agents (Anthropic)](https://www.anthropic.com/engineering/writing-tools-for-agents), [Advanced tool use (Anthropic)](https://www.anthropic.com/engineering/advanced-tool-use).

### 2.3 Parâmetros da Responses API que importam para nós [COMPROVADO]

- **Responses API em vez de Chat Completions para fluxo agêntico**: o
  raciocínio é persistido entre tool calls (via `previous_response_id`),
  resultando em decisões melhores e menos tokens re-raciocinados a cada passo.
  Recomendação explícita da OpenAI para "agentic and tool calling flows".
- **`reasoning_effort`**: controla o quão fundo o modelo pensa e o quão
  disposto fica a chamar tools. Default `medium`. Guidance oficial: `low`
  antes de `none` quando ainda há tool use/planejamento; `none` só para
  classificação e retrieval leve; `high`/`xhigh` apenas quando evals mostram
  ganho mensurável. **Aviso oficial importante: effort alto com acesso
  open-ended a tools causa overthinking e busca desnecessária** (relevante
  para 121 tools: subir effort sem podar catálogo piora).
- **`verbosity`**: controla o tamanho da resposta final separado do tamanho do
  raciocínio. Para respostas WhatsApp/chat curtas: `verbosity: low` global +
  override por instrução natural onde precisar de detalhe.
- **Eagerness/persistência são controláveis por prompt**: blocos
  `<context_gathering>` com critérios de parada explícitos e **tool budgets**
  ("no máximo N tool calls para esta pergunta"), e blocos `<persistence>`
  para o modelo não devolver a pergunta ao usuário no meio da tarefa.
- **Tool preambles**: o modelo é treinado para anunciar plano e progresso
  entre tool calls; útil para UX de chat com latência multi-passo.
- **Insight oficial pouco conhecido**: "observamos pico de performance quando
  tarefas distintas e separáveis são quebradas em múltiplos turnos de agente,
  um turno por tarefa", endosso direto do padrão planner-executor pela própria
  OpenAI.

Fontes: [GPT-5 prompting guide (OpenAI Cookbook)](https://cookbook.openai.com/examples/gpt-5/gpt-5_prompting_guide), [GPT-5 new params and tools](https://cookbook.openai.com/examples/gpt-5/gpt-5_new_params_and_tools), [Building with the GPT-5 series (PDF)](https://cdn.openai.com/pdf/47c0215b-8976-4f60-8e13-d69c2ddbc15e/a-practical-guide-to-building-with-gpt-5.pdf), [Using GPT-5.5](https://developers.openai.com/api/docs/guides/latest-model).

### 2.4 Roteamento por complexidade (modelo barato vs modelo forte) [COMPROVADO no padrão, números VENDOR/ESPECULATIVOS]

- Padrão validado pela Anthropic (workflow Routing) e amplamente adotado:
  classificar a pergunta na entrada e rotear "fácil/comum" para modelo barato
  e "difícil/composta" para modelo forte.
- Números da literatura de routing (direção consensual, números de blogs):
  40-60% das requests de produção não precisam de modelo frontier; routers
  bem treinados mantêm ~95% da qualidade usando o modelo caro em ~26% das
  chamadas; economia típica de 45-85% [ESPECULATIVO nos percentuais].
- Guidance prática consensual: **começar com routing por regras** (3-4 tiers
  com critérios explícitos), medir, e só depois evoluir para
  classificador-LLM. **Default conservador**: na ambiguidade, rotear para o
  tier mais forte; o custo de escalar à toa é muito menor que o custo de uma
  resposta errada do modelo pequeno.
- Cascata (tentar barato, escalar se falhar) funciona, mas exige um detector
  de falha confiável; no nosso caso os validadores pós-resposta podem cumprir
  esse papel (reprova do validador = sinal de escalada).

Fontes: [Building Effective Agents (Anthropic)](https://www.anthropic.com/research/building-effective-agents), [LLM Routing em produção (TianPan)](https://tianpan.co/blog/2025-10-19-llm-routing-production), [Routing e cascades (TianPan)](https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades), [Survey de dynamic routing/cascading (arXiv 2603.04445)](https://arxiv.org/pdf/2603.04445).

---

## 3. Como os produtos líderes fazem (arquitetura comprovada vs hype)

### 3.1 Databricks Genie [COMPROVADO em produção]

- **Multi-agente especializado, não modelo único**: agente de planejamento
  interpreta a pergunta, agente de geração SQL produz a query, a query RODA
  no warehouse, um **verifier checa o resultado e pode disparar re-execução
  ou pedir esclarecimento**, e um summarizer escreve a leitura em linguagem
  natural e escolhe a visualização.
- **Self-reflection durante a geração de SQL** (release notes 2025): o modelo
  revisa a query antes de executar, reduzindo erros de filtro e de sintaxe.
  Nota: isso é reflection com feedback externo iminente (a query vai rodar),
  não self-critique puro.
- A nova geração é "powered by the latest reasoning models", e expõe os
  passos de raciocínio (tabelas consultadas, SQL exemplo) para auditabilidade.
- Curiosamente, o Research Agent deles CONSOLIDOU de multi-agente para "um
  único agente de raciocínio que gera hipóteses e SQL" por latência e
  aderência a instruções: evidência de que mais agentes nem sempre é melhor.

Fontes: [The next generation of Databricks Genie](https://www.databricks.com/blog/next-generation-databricks-genie), [Genie release notes 2025](https://docs.databricks.com/aws/en/ai-bi/release-notes/2025), [Como o Genie funciona (DEV)](https://dev.to/lucy1/how-databricks-genie-turns-plain-english-into-sql-code-3fa9), [Supervisor Agent Architecture (Databricks)](https://www.databricks.com/blog/multi-agent-supervisor-architecture-orchestrating-enterprise-ai-scale).

### 3.2 Snowflake Cortex Analyst [COMPROVADO em produção; benchmarks VENDOR]

- O pilar é o **modelo semântico** (YAML leve): medidas, dimensões, sinônimos
  e **filtros nomeados que capturam jargão da empresa** ("North America" =
  `region in (US, Canada, Mexico)`), aplicados de forma garantida no SQL
  gerado. É a mesma filosofia das nossas tools semânticas: vocabulário de
  negócio congelado em código, não inferido a cada pergunta.
- Workflow agêntico com múltiplos agentes e **guardrails em cada etapa**
  contra alucinação.
- Benchmark interno [VENDOR]: 90%+ de acurácia SQL em casos reais, ~2x mais
  preciso que GPT-4o single-prompt; "agentic semantic model improvement"
  rendeu +20% de acurácia.
- Evolução de abril/2026 digna de nota: Cortex Agents passaram a **gerar SQL
  direto das semantic views, com MENOS passos intermediários**, ganhando
  acurácia e latência. Segunda evidência (junto com o Research Agent do
  Genie) de que o pêndulo está voltando de "mais agentes" para "menos passos
  com contexto semântico melhor".

Fontes: [Cortex Analyst: accuracy para BI real (Snowflake)](https://www.snowflake.com/en/blog/engineering/cortex-analyst-text-to-sql-accuracy-bi/), [Cortex Analyst behind the scenes](https://www.snowflake.com/en/engineering-blog/snowflake-cortex-analyst-behind-the-scenes/), [Agentic semantic model improvement](https://www.snowflake.com/en/blog/engineering/agentic-semantic-model-text-to-sql/), [Release note 2026-04-13](https://docs.snowflake.com/en/release-notes/2026/other/2026-04-13-cortex-agents-agentic-analyst), [Inside Snowflake Intelligence](https://www.snowflake.com/en/blog/engineering/inside-snowflake-intelligence-enterprise-agentic-ai/).

### 3.3 ThoughtSpot Spotter [parte COMPROVADO, parte HYPE]

- Comprovado: camada semântica agêntica (knowledge graph com lógica de
  negócio, regras de segurança e definições de métricas em formato legível
  por máquina) + geração determinística via "search tokens" patenteados (eles
  fazem questão de dizer que NÃO é text-to-SQL puro por LLM). Spotter faz
  multi-step reasoning, testa premissas e re-roda análises.
- Hype a descontar: "100% da plataforma é agêntica", agentes para tudo
  (SpotterModel/SpotterViz/SpotterCode) é narrativa de marketing de
  plataforma; não há evidência pública de arquitetura auditável como nos
  blogs de engenharia de Databricks/Snowflake.

Fontes: [Spotter (ThoughtSpot)](https://www.thoughtspot.com/product/agents/spotter), [Spotter Semantics press release](https://www.thoughtspot.com/press-releases/thoughtspot-introduces-spotter-semantics-to-bring-trust-and-context-to-enterprise-ai), [TechTarget sobre Spotter](https://www.techtarget.com/searchbusinessanalytics/news/366615693/ThoughtSpot-AI-agent-Spotter-enables-conversational-BI).

### 3.4 O padrão comum dos três (o que é arquitetura comprovada)

1. **Camada semântica explícita** (medidas, filtros, jargão de negócio em
   artefato versionado), nunca inferência livre de schema. Nós já temos isso
   nas 121 tools semânticas; é nossa maior vantagem estrutural.
2. **Verificação por feedback EXTERNO** (rodar a query, verifier separado,
   validador determinístico), nunca self-critique puro.
3. **Decomposição multi-passo só para perguntas compostas**, com tendência
   recente de REDUZIR passos quando o contexto semântico é bom.
4. **Transparência dos passos** (mostrar plano, tools usadas, frescor do dado)
   para confiança do usuário.

---

## 4. Recomendações concretas para o nosso stack

Ordenadas por relação ganho/esforço estimada. Todas pressupõem evals golden
antes/depois (nosso gate de cobertura já existe; estender para estes casos).

### R1. Roteador de complexidade na entrada (maior ganho imediato)

- Classificar cada pergunta em 3 tiers ANTES do loop principal:
  - **T1 simples** (1 métrica, 1 período, mapeia para 1 tool): fluxo atual,
    gpt-5.4-mini single-shot, `reasoning_effort: low` ou `none`.
  - **T2 composta** (comparações, múltiplas métricas, "e por quê?",
    multi-domínio): modelo forte (gpt-5.4 full ou superior),
    `reasoning_effort: medium`, loop multi-passo (R3).
  - **T3 explicativa/investigativa** ("explica a queda", "o que mudou"):
    modelo forte, `reasoning_effort: high`, padrão planner-executor (R4).
- Implementação inicial **por regras** (sinais lexicais: "compare", "por que",
  "evolução", número de métricas/períodos detectados) + fallback: na dúvida,
  tier acima. Evoluir para classificador só se as regras errarem nos evals.
- O classificador pode ser uma chamada `reasoning_effort: none` do próprio
  mini (custo marginal) ou puramente determinístico.

### R2. Podar o catálogo por pergunta (retrieval de tools)

- Parar de injetar 121 tools em toda chamada. Duas opções, em ordem de
  preferência:
  a. **`tool_search` nativo da OpenAI** com `defer_loading: true` +
     namespaces por domínio (estoque, financeiro, comercial, fiscal,
     compras...). Requer gpt-5.4+; validar no mini.
  b. **Retrieval próprio** (estilo RAG-MCP): embeddings das descrições das
     tools, shortlist top-10/15 por pergunta + as N tools mais usadas sempre
     presentes. Funciona com qualquer modelo e dá controle total (inclusive
     de RBAC: o filtro por perfil já acontece hoje, vira mais um estágio do
     mesmo pipeline).
- Esperado pela literatura: melhora direta na escolha de tool do modelo mini
  e corte grande de tokens de entrada por chamada.

### R3. Loop multi-passo com Responses API (substituir o single-shot para T2/T3)

- Migrar o fluxo agêntico para Responses API com `previous_response_id`
  (raciocínio persistido entre tool calls), se ainda em Chat Completions.
- Loop com **tool budget explícito no prompt** (ex.: máximo 6 tool calls) e
  critérios de parada (`<context_gathering>` e `<persistence>` do prompting
  guide), para não pagar overthinking.
- **Paralelizar tool calls independentes** (perguntas compostas quase sempre
  decompõem em métricas independentes: emitir as N tool calls num turno só).

### R4. Planner-executor para T3 (não ReAct profundo para tudo)

- Para perguntas explicativas: um turno de PLANO (modelo forte lista as
  sub-perguntas e as tools candidatas), execução das tools (paralela onde
  possível, com micro-ajuste ReAct de no máximo 2-3 passos quando um
  resultado condiciona o próximo), e um turno de SÍNTESE com os resultados.
- Endosso direto da OpenAI: pico de performance com "um turno por tarefa
  separável". E é o desenho do Genie (plan, generate, verify, summarize).
- NÃO criar multi-agente com handoffs por enquanto: tanto OpenAI (começar
  single agent) quanto os movimentos recentes de Genie/Cortex (consolidação
  de passos) indicam que orquestrador + tools resolve nosso escopo.

### R5. Fechar o loop dos validadores (retry com feedback externo)

- A literatura é inequívoca: self-critique intrínseco não funciona; feedback
  externo funciona. Nossos validadores pós-resposta são o ativo certo, mas o
  valor completo aparece quando a reprova **volta ao modelo como mensagem de
  erro estruturada para UMA nova tentativa** (apontando qual número divergiu
  do tool result), com fallback canônico se a 2a tentativa reprovar.
- O mesmo sinal de reprova serve de gatilho de **cascata**: reprova no tier
  T1 (mini) = re-executar a pergunta no tier T2 (modelo forte).

### R6. Higiene de parâmetros e de tools (rápido, baixo risco)

- `verbosity: low` global (respostas de chat/WhatsApp), override textual onde
  precisa de detalhe; manter formatadores canônicos como estão.
- Revisar descrições das 121 tools como se fossem prompts (quando usar, quando
  NÃO usar, exemplos de pergunta que mapeiam), iterando contra os golden
  cases; é a prática que Anthropic reporta como maior ganho por esforço.
- Consolidar tools sobrepostas se o retrieval do R2 revelar confusão entre
  vizinhas (a literatura aponta overlap como principal causa de misseleção).
- Tool preambles curtos nos fluxos T2/T3 para o usuário ver progresso
  durante os passos (latência percebida).

### R7. Evals de roteamento e de multi-passo antes de ligar em produção

- Estender os golden cases com: casos rotulados por tier (mede o roteador),
  perguntas compostas com resposta de referência (mede o planner-executor) e
  casos de reprova de validador (mede o retry do R5).
- Subir `reasoning_effort` ou trocar modelo SÓ quando o eval mostrar ganho
  (guidance oficial OpenAI; effort alto sem necessidade degrada).

---

## 5. Mapa rápido: comprovado vs especulativo

| Afirmação | Status |
|---|---|
| Padrões simples e composáveis batem frameworks complexos | COMPROVADO (Anthropic, OpenAI, consenso) |
| Routing barato/forte por complexidade economiza muito mantendo qualidade | COMPROVADO no padrão; percentuais exatos ESPECULATIVOS |
| Catálogo grande de tools degrada seleção; retrieval de tools resolve | COMPROVADO (RAG-MCP, docs OpenAI `tool_search`) |
| Responses API com raciocínio persistido melhora fluxo agêntico | COMPROVADO (docs oficiais OpenAI) |
| Self-critique intrínseco melhora respostas | REFUTADO (Huang et al.; survey TACL) |
| Validação por feedback externo + retry melhora respostas | COMPROVADO (CRITIC e linha de pesquisa; Genie verifier em produção) |
| Planner-executor reduz tokens ~30% e melhora completion vs ReAct | direção COMPROVADA; números ESPECULATIVOS (blog) |
| Camada semântica explícita é o que sustenta acurácia de data agents | COMPROVADO (Snowflake, ThoughtSpot, Databricks convergem) |
| Acurácia 90%+ / 2x GPT-4o do Cortex Analyst | VENDOR (benchmark interno) |
| "100% agentic platform" (ThoughtSpot) e afins | HYPE de marketing |
| Multi-agente com handoffs para escopo analítico nosso | NÃO recomendado agora (tendência 2026 é consolidar passos) |

---

## 6. Fontes completas

**Oficiais (alta confiança)**
- https://www.anthropic.com/research/building-effective-agents
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/advanced-tool-use
- https://cookbook.openai.com/examples/gpt-5/gpt-5_prompting_guide
- https://platform.openai.com/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/latest-model
- https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- https://cdn.openai.com/pdf/47c0215b-8976-4f60-8e13-d69c2ddbc15e/a-practical-guide-to-building-with-gpt-5.pdf

**Produtos (engenharia de vendor)**
- https://www.databricks.com/blog/next-generation-databricks-genie
- https://docs.databricks.com/aws/en/ai-bi/release-notes/2025
- https://www.databricks.com/blog/multi-agent-supervisor-architecture-orchestrating-enterprise-ai-scale
- https://www.snowflake.com/en/blog/engineering/cortex-analyst-text-to-sql-accuracy-bi/
- https://www.snowflake.com/en/engineering-blog/snowflake-cortex-analyst-behind-the-scenes/
- https://www.snowflake.com/en/blog/engineering/agentic-semantic-model-text-to-sql/
- https://docs.snowflake.com/en/release-notes/2026/other/2026-04-13-cortex-agents-agentic-analyst
- https://www.snowflake.com/en/blog/engineering/inside-snowflake-intelligence-enterprise-agentic-ai/
- https://www.thoughtspot.com/product/agents/spotter
- https://www.thoughtspot.com/press-releases/thoughtspot-introduces-spotter-semantics-to-bring-trust-and-context-to-enterprise-ai

**Pesquisa acadêmica**
- https://arxiv.org/abs/2310.01798 (LLMs Cannot Self-Correct Reasoning Yet)
- https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00713/125177 (survey self-correction)
- https://arxiv.org/html/2505.03275v1 (RAG-MCP)
- https://arxiv.org/html/2512.03560v1 (RP-ReAct)
- https://arxiv.org/pdf/2603.04445 (survey routing/cascading)
- https://arxiv.org/html/2602.23367 (HumanMCP, tool retrieval)

**Terceiros (confiança média; números com sal)**
- https://dasroot.net/posts/2026/04/agent-architectures-react-plan-execute-graph-agents/
- https://writer.com/engineering/rag-mcp/
- https://tianpan.co/blog/2025-10-19-llm-routing-production
- https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades
- https://www.ema.ai/additional-blogs/addition-blogs/build-plan-execute-agents
- https://www.union.ai/blog-post/build-a-planner-agent-system-with-parallel-execution-flyte-2-0-multi-agent-orchestration-with-union-ai
- https://beancount.io/bean-labs/research-logs/2026/04/26/critic-llm-self-correct-tool-interactive-critiquing
- https://dev.to/lucy1/how-databricks-genie-turns-plain-english-into-sql-code-3fa9
