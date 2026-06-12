# SOTA 2025-2026: Precisão e confiabilidade de agentes de analytics/BI

> Pesquisa web (2026-06-12) sobre o estado da arte em (1) self-verification,
> (2) eval-driven development e (3) UX de confiança para agentes que respondem
> com números de banco de dados. Inclui delta concreto vs o que o Nex já tem
> (validadores determinísticos pós-resposta + golden de 171 casos em CI) e
> recomendações priorizadas por ROI.

---

## 1. Self-verification: o que funciona de verdade (e o que não funciona)

### 1.1 O consenso de 2025: self-correction intrínseca NÃO funciona; verificação ANCORADA funciona

O achado mais importante da literatura recente é uma divisão nítida:

- **Self-correction intrínseca (o modelo revisar a própria resposta sem sinal
  externo) é frágil e frequentemente piora o resultado.** Huang et al. (ICLR
  2024, "Large Language Models Cannot Self-Correct Reasoning Yet") mostraram
  que o modelo que gerou o erro compartilha o mesmo ponto cego com o modelo
  que avalia: a auto-crítica amplia a confiança sem adicionar informação (a
  "coherence trap", em que o agente se convence de respostas erradas cada vez
  mais polidas). Fonte: [Zylos Research, Agent Self-Correction: From Reflexion
  to PRM](https://zylos.ai/research/2026-05-12-agent-self-correction-reflexion-to-prm).
- **A Snorkel mediu o "self-critique paradox" (nov/2025):** ao pedir que o
  modelo critique a própria resposta, a acurácia agregada CAIU 10%, e a queda
  se concentra exatamente nas tasks difíceis (onde a verificação seria mais
  necessária). Fonte: [Snorkel, The Self-Critique Paradox](https://snorkel.ai/blog/the-self-critique-paradox-why-ai-verification-fails-where-its-needed-most/).
- **Verificação ancorada em sinal externo (execução, banco de dados, regra
  determinística) é onde os ganhos reais vivem.** "Verify Before You Fix"
  (arXiv 2604.10800, 2025): com feedback de verificação baseado em execução,
  agentes se autocorrigem em 70,3% dos 590 erros estudados. O campo convergiu:
  o crítico precisa ser "credivelmente externo" ao gerador.

**Implicação direta para o Nex:** nossos validadores determinísticos
pós-resposta (números devem derivar do tool result, anti-recusa, enquadramento
de lista) JÁ SÃO a forma de verificação que a literatura aponta como a única
confiável. Estamos no padrão certo. O próximo nível não é adicionar
"reflexão livre", é fechar o loop: usar o veredito do validador como crítica
direcionada para UMA tentativa de reparo, em vez de só bloquear/flagar.

### 1.2 Chain-of-Verification (CoVe): ganho real, custo real

- O paper original (Dhuliawala et al., [arXiv 2309.11495](https://arxiv.org/pdf/2309.11495),
  Meta AI) mede: redução de 50-70% em alucinação factual em QA e geração longa;
  +23% de F1 em closed-book QA (0.39 → 0.48); +8,4 p.p. em acurácia de cadeia
  de raciocínio. O truque que faz o CoVe funcionar (e que o distingue da
  auto-crítica ingênua): as perguntas de verificação são respondidas
  **isoladamente, sem ver a resposta original**, quebrando a correlação de
  erros. Fontes: [Learn Prompting, CoVe](https://learnprompting.org/docs/advanced/self_criticism/chain_of_verification),
  [EmergentMind, CoVe Framework](https://www.emergentmind.com/topics/chain-of-verification-cove).
- **Custo:** o CoVe completo multiplica chamadas (draft + plano + N perguntas +
  síntese), tipicamente 3-5x tokens/latência por resposta. Reviews de 2025
  ([Rohan Paul, Chain of Verification Review](https://www.rohan-paul.com/p/chain-of-verification-in-llm-evaluations))
  apontam que o overhead só compensa em respostas de alto risco ou quando um
  gate barato sinalizou problema, não em 100% do tráfego.
- **SETS** (Chen et al., jan/2025) combina amostragem paralela + verificação
  sequencial; a melhora é monotônica com mais compute de teste, ou seja, é
  um dial de qualidade × custo, não um booleano. Fonte: [EmergentMind,
  Self-Verification-Based LLMs](https://www.emergentmind.com/topics/self-verification-based-llms).

### 1.3 Padrões de produção: critic-in-the-loop com níveis de fidelidade

O padrão de consenso (LangGraph e afins) é o ciclo `agente → crítico →
[aceita | revisa → agente]` com retry máximo configurável, e o crítico em 4
níveis de fidelidade, escolhidos por custo × risco
([Zylos Research](https://zylos.ai/research/2026-05-12-agent-self-correction-reflexion-to-prm)):

| Nível | Crítico | Custo |
|---|---|---|
| Light | Heurística determinística (schema, bounds, regex) | ms |
| Medium | LLM-as-judge com rubrica estruturada | ~1 chamada |
| Heavy | Verificação ancorada em execução (rodar a query, comparar com o tool result) | segundos |
| Trained | PRM/critic dedicado com calibração aprendida | treino + infra |

**Self-correction budget** (padrão de produção): tentativa 1 normal; tentativa
2 com crítica direcionada ("a resposta anterior falhou na checagem X");
tentativa 3 troca de estratégia/modelo; depois, escalar ou responder com baixa
confiança declarada. Logar cada ciclo (crítica usada + desfecho) vira dataset
para melhorar agente e crítico. PRMs (Process Reward Models) são o estado da
arte acadêmico para diagnóstico por etapa, mas exigem anotação por step:
overkill para nosso caso (nossos validadores determinísticos já dão sinal por
etapa de graça).

### 1.4 Text-to-SQL/BI agents: o que os líderes fazem

- **ReFoRCE** (topo do Spider 2.0, [arXiv 2502.00675](https://arxiv.org/pdf/2502.00675)):
  self-refinement iterativo + **votação por maioria entre candidatos** +
  deferimento explícito de casos ambíguos. Spider 2.0 (queries enterprise
  reais com 100+ linhas) ainda estava em ~31% de execution accuracy no melhor
  modelo em abril/2025: o problema enterprise está longe de resolvido, o que
  reforça a estratégia de catálogo semântico fechado (nossa decisão canônica
  #3) em vez de SQL livre.
- **MARS-SQL** ([arXiv 2511.01008](https://arxiv.org/pdf/2511.01008)): geração
  passo a passo executando SQL parcial contra o banco vivo e aprendendo do
  feedback de execução (de novo: verificação ancorada, não introspecção).
- **Métrica que importa: Execution Accuracy (EX)**, a query retorna o dado
  correto, não string match. Fonte: [EmergentMind, Agentic Text-to-SQL
  Systems](https://www.emergentmind.com/topics/agentic-text-to-sql-systems).
- **Semantic layer como multiplicador de acurácia:** teste interno reportado
  pela VentureBeat mostrou acurácia de LLM saltando de ~40% (SQL contra schema
  cru) para 83-90%+ quando ancorado em definições governadas de métricas
  (semantic layer). É o argumento quantitativo definitivo a favor do nosso
  catálogo de tools semânticas + camada `fato_*`. Fontes:
  [VentureBeat, Headless vs native semantic layer](https://venturebeat.com/ai/headless-vs-native-semantic-layer-the-architectural-key-to-unlocking-90-text),
  [dbt Labs, open source MetricFlow](https://www.getdbt.com/blog/open-source-metricflow-governed-metrics).

---

## 2. Eval-driven development para agentes

### 2.1 O processo de referência

O paper de referência é "Evaluation-Driven Development and Operations of LLM
Agents" ([arXiv 2411.13768](https://arxiv.org/html/2411.13768v3)): evals
escritos antes/junto da feature, suíte verde como ship gate, e um loop
contínuo offline (golden) + online (produção). O fluxo canônico da indústria
em 2026 ([Braintrust, Agent observability guide
2026](https://www.braintrust.dev/articles/agent-observability-complete-guide-2026)):

1. Tracing de cada step do agente (tool calls, raciocínio, transições).
2. **Online scoring numa amostra do tráfego de produção.**
3. **Falhas recorrentes de produção viram casos de eval (o flywheel
   trace → golden).**
4. Os mesmos scorers rodam em CI como gate de release.

### 2.2 Golden datasets: como os melhores fazem

- Os melhores casos vêm do **tráfego real de produção**, não de casos
  sintéticos: representam a distribuição verdadeira de perguntas difíceis.
  Fonte: [Maxim, Building a Golden Dataset](https://www.getmaxim.ai/articles/building-a-golden-dataset-for-ai-evaluation-a-step-by-step-guide/).
- O golden é vivo: toda falha em produção (ou reclamação de usuário) vira caso
  novo com o veredito esperado. Nosso golden de 171 casos está certo em
  existir e rodar em CI; o gap é o pipeline que o alimenta a partir do uso
  real.
- A Databricks faz exatamente isso no Genie: feature "Benchmarks" = perguntas
  curadas com SQL esperado, rodadas continuamente contra o espaço. Fonte:
  [Databricks, AI/BI Genie GA](https://www.databricks.com/blog/aibi-genie-now-generally-available).

### 2.3 LLM-as-judge: só vale calibrado

- Receita da LangChain ([How to Calibrate LLM-as-Judge with Human
  Corrections](https://www.langchain.com/resources/llm-as-a-judge)): começar
  com ~50 falhas reais, um especialista de domínio grada binário (pass/fail)
  com crítica escrita, e o prompt do judge é calibrado contra esses vereditos
  até concordância alta. Sem essa calibração, o judge é ruído que bloqueia CI
  à toa ou deixa passar erro real.
- Judges que bloqueiam release precisam de reruns de controle/bandas de
  confiança (jitter do próprio judge), senão o gate flapa. Fonte:
  [FutureAGI, CI/CD LLM Eval with GitHub Actions](https://futureagi.com/blog/ci-cd-llm-eval-github-actions-2026/).
- **Custo do judge em produção:** modelos avaliadores pequenos e dedicados
  (ex.: Galileo Luna-2) avaliam 100% do tráfego com latência sub-200ms e ~97%
  menos custo que LLM-as-judge convencional; alternativa pragmática: judge só
  na amostra + determinístico em 100%. Fonte: [Braintrust, AI observability
  buyer's guide](https://www.braintrust.dev/articles/best-ai-observability-tools-2026).

### 2.4 Métricas que importam para agente de números

- **Answer/Execution accuracy:** o número final bate com o ground truth.
- **Faithfulness por decomposição de claims** (Ragas/DeepEval): a resposta é
  quebrada em claims atômicos e cada claim é verificado contra o contexto
  (no nosso caso, o tool result); o score é a proporção de claims suportados.
  É a generalização formal do nosso validador "números devem derivar do tool
  result" para TODOS os claims (rankings, comparações, percentuais, períodos).
  Fontes: [Ragas, available metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/),
  [Confident AI, RAG evaluation metrics](https://www.confident-ai.com/blog/rag-evaluation-metrics-answer-relevancy-faithfulness-and-more).
- **Consistência:** mesma pergunta (ou mesma métrica em turnos diferentes) =
  mesmo número. Benchmarks multi-turn (MTRAG, [arXiv 2501.03468](https://arxiv.org/pdf/2501.03468))
  mostram que a degradação multi-turno é um modo de falha próprio, não coberto
  por evals single-turn.
- **Métricas de abstenção:** AURCC/AUACC (curva risco × cobertura) medem se o
  agente sabe QUANDO não responder; o "não sei" correto conta como acerto.
  Fonte: [TACL, Know Your Limits: A Survey of Abstention in LLMs](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00754/131566/Know-Your-Limits-A-Survey-of-Abstention-in-Large).
- **Gate de regressão em CI:** o PR gate prova que a mudança não regride no
  golden curado; em produção, queda sustentada da média móvel (2-3 p.p. por
  15-60 min) dispara rollback. Fonte: [FutureAGI, LLM Regression
  Testing](https://futureagi.com/glossary/llm-regression-testing/).

---

## 3. Como transmitir confiança na resposta

### 3.1 Proveniência: declarar fonte, critério e recorte

- O padrão dos produtos líderes de BI conversacional é **mostrar o trabalho**:
  Databricks Genie cita as conclusões e dá um clique para escrutinar a query e
  os passos ([Databricks Genie docs](https://docs.databricks.com/aws/en/genie/));
  ThoughtSpot Spotter vende "accurate, explainable answers" com cada passo
  checado ([ThoughtSpot Agents](https://www.thoughtspot.com/product/agents)).
- A receita mínima por resposta numérica: **fonte** (qual tool/tabela fato),
  **critério** (definição da métrica usada), **recorte** (período, filtros,
  moeda/unidade) e **frescor** (nosso "atualizado há Xs", que já é decisão
  canônica #2). Isso transforma a resposta de "um número" em "um número
  auditável", que é o que gera confiança em quem decide.
- Atenção ao anti-padrão: motores de busca com IA citam mal e isso destrói
  confiança ([estudo do Tow Center via busca](https://arxiv.org/pdf/2507.10587)
  e crítica geral de citação). Citação tem que ser verificável (a tool/tabela
  que de fato foi consultada), nunca decorativa.

### 3.2 Quando dizer "não sei": abstenção calibrada é feature, não falha

- O paper da OpenAI "Why Language Models Hallucinate"
  ([arXiv 2509.04664](https://arxiv.org/pdf/2509.04664)) formaliza: modelos
  alucinam porque os benchmarks binários premiam o chute; a correção é
  **recompensar a abstenção apropriada**, incluindo casos ambíguos no
  treino/eval e tratando "não sei" como sucesso quando a informação realmente
  falta.
- O nosso Caminho 3a (lacuna honesta + log de gap) e os casos de "módulo
  inexistente citando a fonte" já implementam isso. O refinamento SOTA: o
  "não sei" deve vir com (a) o motivo concreto ("o cache não tem o módulo X",
  "o período pedido antecede o primeiro registro"), (b) o que existe de mais
  próximo, e (c) o que destravaria a resposta. Recusa seca destrói confiança;
  recusa explicada e acionável aumenta.
- Incerteza composta em agentes multi-step é fronteira aberta (a confiança
  do agente precisa agregar incertezas de múltiplas tools/turnos), ver
  [Agentic Confidence Calibration, arXiv 2601.15778](https://arxiv.org/pdf/2601.15778).

### 3.3 UX de incerteza: como apresentar importa tanto quanto calcular

- Estudo de AI-assisted decision-making ([arXiv 2401.05612](https://arxiv.org/pdf/2401.05612)):
  apresentar incerteza como **frequência natural calibrada** ("em condições
  como esta, o dado fecha com o contábil 9 em 10 vezes") levou usuários a
  calibrar a confiança MUITO melhor que percentuais abstratos ou hedging
  verbal vago.
- Hedging genérico ("talvez", "aproximadamente", "pode ser que") em TODA
  resposta corrói a percepção de competência; o padrão SOTA é **assertividade
  por default quando a verificação passou, e incerteza explícita e específica
  só quando há incerteza real** (dado parcial, sync atrasada, métrica
  aproximada). Verbalized uncertainty mal feita é pior que nenhuma
  ([arXiv 2507.10587](https://arxiv.org/pdf/2507.10587)).
- Clínica/risco: o perigo real é excesso de confiança não calibrado, não o
  erro em si ([PMC, A crisis of overconfidence](https://pmc.ncbi.nlm.nih.gov/articles/PMC12874690/)).
  Tradução para BI: errar 1 número com tom assertivo custa mais confiança do
  que 10 "não sei" honestos.

---

## 4. Delta concreto vs o que o Nex já tem

| O que já temos | Veredito vs SOTA | O gap (próximo nível) |
|---|---|---|
| Validadores determinísticos pós-resposta (números derivam do tool result, anti-recusa, enquadramento de lista) | **Alinhado com o SOTA.** É exatamente a "verificação ancorada/heavy critic" que a literatura aponta como a única confiável (vs auto-crítica intrínseca, que falha) | Validador hoje só flaga/bloqueia. SOTA fecha o loop: veredito do validador vira crítica direcionada para 1 retry de reparo antes de entregar (critic-in-the-loop com budget) |
| Cobertura "números derivam do tool result" | Boa base de faithfulness | SOTA verifica **todos os claims**, não só números literais: percentuais calculados, somas, rankings ("o maior é X"), comparações ("cresceu vs mês anterior"), unidades/escala (R$ mil vs milhões), períodos citados |
| Golden de 171 casos em CI | Alinhado (PR gate sobre golden curado é o padrão) | Falta o flywheel: amostrar tráfego real de produção, rodar scorers online, converter falha de produção em caso golden novo. Golden estático envelhece |
| Caminho 3a/3b (lacuna honesta, recusa educada) | Conceitualmente SOTA (abstenção como feature) | "Não sei" precisa ser sempre acionável: motivo concreto + alternativa mais próxima + o que destravaria. E o golden deve ter casos onde o acerto É abstster-se (medir cobertura × risco, não só acurácia) |
| Timestamp "atualizado há Xs" | Alinhado (frescor é parte da proveniência) | Falta o restante do contrato de proveniência em toda resposta numérica: fonte (tool/fato), critério (definição da métrica) e recorte (período/filtros/unidade) declarados |
| Nada equivalente | , | **Consistência entre turnos:** nenhum mecanismo garante que a mesma métrica/período citada em turnos diferentes da mesma conversa dê o mesmo número (modo de falha próprio de multi-turn, MTRAG) |
| LLM-as-judge (se usado nos goldens) | , | Judge sem calibração contra vereditos humanos é ruído; calibrar com ~50 falhas reais gradadas por humano antes de deixá-lo bloquear CI |

O que o SOTA diz para **NÃO** fazer (economia de esforço):

- **Não** adicionar loop de "reflexão livre" ("revise sua resposta") sem sinal
  externo: degrada justamente nos casos difíceis (Snorkel, Huang et al.).
- **Não** rodar CoVe completo em 100% das respostas: 3-5x custo/latência;
  reservar verificação multi-pass para quando o validador determinístico
  flagar ou para perguntas de alto risco.
- **Não** treinar PRM/critic dedicado: nossos validadores determinísticos já
  dão sinal por etapa de graça; PRM é para quem não tem ground truth executável.
- **Não** expor "score de confiança" numérico cru ao usuário final: a
  literatura de UX mostra que percentual abstrato calibra mal; proveniência +
  assertividade condicional funcionam melhor.

---

## 5. Recomendações priorizadas por ROI

### P0, alto ganho, baixo custo (dias)

1. **Contrato de proveniência na resposta** (prompt + validador): toda resposta
   numérica declara fonte (tool/fato consultado), critério (definição da
   métrica), recorte (período/filtros/unidade) e frescor (já existe). Validador
   determinístico novo confere a presença e a veracidade (a tool citada é a que
   rodou). É a alavanca número 1 de confiança percebida e custa ~zero latência.
2. **Repair loop com budget 1** : quando um validador determinístico falha, em
   vez de só bloquear, reinjetar o veredito como crítica direcionada ("o número
   X não deriva do tool result; reescreva usando apenas os valores retornados")
   e tentar UMA regeneração; se falhar de novo, degradar para resposta com
   abstenção explicada. Captura o ganho do critic-in-the-loop sem o custo do
   CoVe; +1 chamada só nos casos que já estavam errados.
3. **"Não sei" acionável como padrão**: template de abstenção com motivo
   concreto + alternativa mais próxima + o que destravaria. Atualizar os casos
   golden de 3a/3b para exigir os 3 componentes.

### P1, alto ganho, custo médio (1-2 semanas)

4. **Faithfulness por decomposição de claims**: estender os validadores para
   claims derivados, percentuais e variações calculadas (recomputar a partir do
   tool result e comparar com tolerância), rankings e superlativos ("o maior",
   "o pior") conferidos contra a ordenação real, unidade/escala (heurística de
   magnitude: valor citado dentro de 10x do valor da fonte), e período citado =
   período consultado.
5. **Consistência entre turnos**: cache por conversa de (métrica, recorte) →
   número entregue; validador compara nova resposta com respostas anteriores da
   mesma sessão e, em divergência, exige que o agente explicite o porquê
   ("número mudou porque o recorte agora exclui X") ou corrige.
6. **Casos golden de consistência e de abstenção**: pares de perguntas
   reformuladas que devem dar o mesmo número; perguntas cujo gabarito é
   abster-se. Medir acurácia E taxa de abstenção correta (risco × cobertura).

### P2, ganho composto no tempo, custo médio (2-4 semanas)

7. **Online evals + flywheel produção → golden**: rodar os validadores
   determinísticos em 100% do tráfego de produção (são baratos) com logging
   estruturado; amostrar ~10% para um judge calibrado; toda falha vira
   candidato a caso golden (fila de curadoria). É o mecanismo que faz o golden
   de 171 crescer com a distribuição real de perguntas da Matrix.
8. **Calibração do LLM-as-judge** (se/quando usado nos goldens subjetivos):
   ~50 vereditos humanos binários com crítica escrita, medir concordância
   judge × humano antes de deixá-lo bloquear CI; rerun de controle para medir
   o jitter do próprio judge.

### P3, refinamento (quando houver folga)

9. **UX de incerteza calibrada**: nos raros casos de dado parcial/sync
   atrasada, frasear como frequência/condição concreta ("a sync de financeiro
   está 40 min atrasada; este número pode não incluir lançamentos de hoje") em
   vez de hedging vago; manter assertividade total quando a verificação passou.
10. **Votação por maioria para o Caminho 3c (BI avançado)**: gerar 2-3
    candidatos de SQL e aceitar só em consenso de resultado (padrão ReFoRCE);
    deferir para abstenção em divergência. Só vale no 3c, onde não há tool
    semântica garantindo o critério.

---

## Fontes principais

- [Zylos Research, Agent Self-Correction: From Reflexion to Process Reward Models (mai/2026)](https://zylos.ai/research/2026-05-12-agent-self-correction-reflexion-to-prm)
- [Snorkel, The Self-Critique Paradox (nov/2025)](https://snorkel.ai/blog/the-self-critique-paradox-why-ai-verification-fails-where-its-needed-most/)
- [Dhuliawala et al., Chain-of-Verification Reduces Hallucination in LLMs (arXiv 2309.11495)](https://arxiv.org/pdf/2309.11495)
- [Rohan Paul, Chain of Verification in LLM Evaluations: A Comprehensive Review](https://www.rohan-paul.com/p/chain-of-verification-in-llm-evaluations)
- [EmergentMind, Self-Verification-Based LLMs (SETS e correlatos)](https://www.emergentmind.com/topics/self-verification-based-llms)
- [ReFoRCE: A Text-to-SQL Agent (arXiv 2502.00675, SOTA Spider 2.0)](https://arxiv.org/pdf/2502.00675)
- [MARS-SQL: Multi-Agent RL para Text-to-SQL (arXiv 2511.01008)](https://arxiv.org/pdf/2511.01008)
- [EmergentMind, Agentic Text-to-SQL Systems](https://www.emergentmind.com/topics/agentic-text-to-sql-systems)
- [VentureBeat, Headless vs native semantic layer: 90%+ text-to-SQL accuracy](https://venturebeat.com/ai/headless-vs-native-semantic-layer-the-architectural-key-to-unlocking-90-text)
- [dbt Labs, Open source MetricFlow: governed metrics for trustworthy AI](https://www.getdbt.com/blog/open-source-metricflow-governed-metrics)
- [arXiv 2411.13768, Evaluation-Driven Development and Operations of LLM Agents](https://arxiv.org/html/2411.13768v3)
- [Braintrust, Agent observability: the complete guide for 2026](https://www.braintrust.dev/articles/agent-observability-complete-guide-2026)
- [LangChain, How to Calibrate LLM-as-Judge with Human Corrections](https://www.langchain.com/resources/llm-as-a-judge)
- [FutureAGI, CI/CD LLM Eval with GitHub Actions (2026)](https://futureagi.com/blog/ci-cd-llm-eval-github-actions-2026/) e [LLM Regression Testing](https://futureagi.com/glossary/llm-regression-testing/)
- [Maxim, Building a Golden Dataset for AI Evaluation](https://www.getmaxim.ai/articles/building-a-golden-dataset-for-ai-evaluation-a-step-by-step-guide/)
- [Ragas, métricas disponíveis (faithfulness, answer accuracy, tool call accuracy)](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [Confident AI, RAG Evaluation Metrics](https://www.confident-ai.com/blog/rag-evaluation-metrics-answer-relevancy-faithfulness-and-more)
- [MTRAG: benchmark multi-turn para RAG (arXiv 2501.03468)](https://arxiv.org/pdf/2501.03468)
- [OpenAI, Why Language Models Hallucinate (arXiv 2509.04664)](https://arxiv.org/pdf/2509.04664)
- [TACL, Know Your Limits: A Survey of Abstention in LLMs](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00754/131566/Know-Your-Limits-A-Survey-of-Abstention-in-Large)
- [arXiv 2401.05612, Designing for Appropriate Reliance (apresentação de incerteza)](https://arxiv.org/pdf/2401.05612)
- [arXiv 2507.10587, Anthropomimetic Uncertainty (verbalized uncertainty)](https://arxiv.org/pdf/2507.10587)
- [arXiv 2601.15778, Agentic Confidence Calibration](https://arxiv.org/pdf/2601.15778)
- [Databricks, AI/BI Genie GA (Benchmarks, citações, escrutínio da query)](https://www.databricks.com/blog/aibi-genie-now-generally-available) e [Genie Spaces docs](https://docs.databricks.com/aws/en/genie/)
- [ThoughtSpot, Agents for BI (Spotter)](https://www.thoughtspot.com/product/agents)
- [PMC, A crisis of overconfidence: confidence, not accuracy, is the real risk](https://pmc.ncbi.nlm.nih.gov/articles/PMC12874690/)
