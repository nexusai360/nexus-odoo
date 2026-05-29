# Roteamento contextual do Router + Janela de contexto configurável + migração de config

> SPEC v2, 2026-05-29. Sub-projeto R2-ctx (entra antes/junto do R2 Discovery).
> Modo autônomo: SPEC v1 -> review #1 -> v2 -> review #2 -> v3 -> PLAN ... -> execução.
> Frontend obrigatoriamente via `ui-ux-pro-max`, mantendo a identidade dos blocos existentes.

---

## 0. Histórico de versões e achados de review

### Review #1 (v1 -> v2): achados materiais aplicados

| # | Achado (gap real na v1) | Resolução na v2 |
|---|---|---|
| R1.1 | **Segurança:** o fast-path de recusa RBAC v2 (`run-agent.ts`) roda sobre a decisão da Camada 1 e só dispara sem fallback. Com 3 camadas, o re-embedding (Camada 3) pode escolher um domínio fora do acesso do usuário sem passar pela checagem de permissão. | §4.2: a checagem RBAC (fast-path de recusa e `filterCatalog`) roda **sobre a decisão FINAL** (Camada 3 quando houve reformulação; senão Camada 1). |
| R1.2 | Ordem de `createDecision`/`updateDecision` indefinida com 3 camadas (hoje cria antes do `filterCatalog` para ter `routerDecisionId`). | §4.2 + §5: **uma** linha por turno. Cria após decidir qual decisão é a final; os campos de origem (`originalFallback`, `usedReformulation`, `reformulatedQuestion`) preservam a Camada 1. `routerDecisionId` continua disponível para o fast-path porque a criação precede o `filterCatalog` final. |
| R1.3 | Credencial de embedding com duas verdades (AppSetting `embedding_credential_id` do RAG vs campo novo). | §7.1: **fonte única**. O bloco Embeddings edita a MESMA credencial que router+RAG já usam (o `AppSetting`/resolver atual); `routerEmbeddingModel` guarda só a escolha de modelo. Sem campo de credencial duplicado. |
| R1.4 | Não dizia o que a Camada 2 faz quando o router está em **shadow** (catálogo não é filtrado). | §4.3: em shadow, a Camada 2 pode rodar para **logar/calibrar** mas não altera o catálogo (não há filtro). Em active, altera de fato. Gating por `routerEnabled` + checkpoint. |
| R1.5 | Faltava o resolver do modelo de reformulação, timeout, algoritmo do modo "sem sistema" e concretude do Backtest. | §4.4 (resolver + timeout 2.5s alinhado ao sugeridor), §6.1 (algoritmo do filtro de papéis), §5.1 (Backtest: investigação dirigida no plano + contrato mínimo). |

Critério de saída do review #1: achados materiais endereçados; nenhum buraco de segurança/ordem em aberto. Segue para review #2.

---

## 1. Objetivo

Hoje o **router de catálogo** (embedding) decide quais tools entregar ao agente olhando
**somente a pergunta atual, isolada**. Perguntas dependentes de contexto ("valeu, e do mês
passado?", "e do produto X?") não têm sinal de domínio próprio e caem em **fallback** (catálogo
inteiro). Este sub-projeto torna o router **contextual** sem jogar fora o motor de embedding
validado (98% Top-K), e expõe a **janela de contexto** da resposta como configuração de produto.

Entregamos três coisas amarradas:
1. **Router contextual em 3 camadas** (embedding -> LLM de reformulação só no fallback -> re-embedding), backend, padrão, sem UI própria de decisão.
2. **Bloco "Janela de contexto"** na Configuração do Agente Nex: controla quantas mensagens e quais tipos o agente puxa para responder, valendo nas 3 superfícies.
3. **Bloco "Configuração de Router"** na Configuração: migra a credencial de embedding (hoje no Monitoramento) e adiciona o modelo de "Construção da pergunta", com escopo (Desativado/Playground/Produção), padrão de caixa de chave novo e atalho para o painel.

Telemetria de TUDO (chamadas extras de LLM e re-embedding) nos painéis de Consumo, Router e Backtest é **requisito de primeira classe**.

---

## 2. Estado atual (verificado no código, 2026-05-29)

- **Resposta da IA já tem contexto, mas cru.** `run-agent.ts:504` chama `loadHistory(conversationId, 20)`: últimas **20 mensagens** da conversa, **todos os papéis** (`user`, `assistant`, `tool`), ordem cronológica, enviadas ao LLM. Mensagens de tool e assistant-intermediário (com `toolCalls`) **contam** no orçamento de 20. `DEFAULT_HISTORY_BUDGET = 20` em `conversation.ts:19`. Não é "pares"; é janela de mensagens.
- **Router é cego a contexto.** `run-agent.ts:423` chama `pickDomains(args.userMessage, ...)` — só a frase atual. `pickDomains` (em `router/pick-domains.ts`) embeda a pergunta (`embedQuestion`, `text-embedding-3-large@0.30`, 3072d, cache LRU 200), faz cosseno vs centróides de domínio + regras de palavra-chave (`forceIncludeOn`) + fallback por `topScore < threshold`.
- **Infra de pares pronta e ociosa.** `getLastNPairs(conversationId, n=5)` em `conversation.ts:377` retorna os últimos N pares `user -> finalAssistant` (ignora tool/intermediárias). Hoje só `intelligence/contextual-suggester.ts` usa, via **chamada LLM** sobre os pares (timeout 2.5s, fallback). É o "modelo dos 5 pares".
- **Uma única porta de entrada.** As 3 superfícies passam pelo MESMO `runAgent`: Playground (`app/api/agent/playground/stream/route.ts:176`), bubble in-app (`app/api/agent/stream/route.ts:148`), WhatsApp (`worker/agent/processor.ts:180`). `loadHistory` tem **um único call site** (`run-agent.ts:504`). `runAgent` conhece `args.isPlayground`.
- **Credencial de embedding hoje vive no Monitoramento** (aba Router, bloco "Credencial OpenAI para embeddings") com dropdown + "Trocar credencial". Ao lado, bloco "Configuração" com Router ativo / Threshold / Top-K / Retry expand / Retry expandido / Salvar.
- **Telemetria existente:** `AgentRouterDecision` registra cada decisão (pergunta, pickedDomains, scores, topScore, fallbackTriggered, mode, catalogSizeOffered/Full, toolsDomains, pickDurationMs, conversationId). Consumo (`LlmUsage`) já usa tags de origem (`router`, `router_calibracao`). `FeatureCheckpoint` enum = `OFF | PLAYGROUND | PRODUCTION`; `AgentSettings` já tem `audioCheckpoint`, `suggestionsCheckpoint`, `maxSuggestions`, `anexo*`, credenciais de áudio etc.

---

## 3. Decisões canônicas desta feature (travadas com o usuário)

1. **Manter a resposta como está por padrão** (20 mensagens, todos os papéis): ver as tools chamadas ajuda o LLM a ser assertivo (parte dos 95%). Só passa a ser **configurável**.
2. **Router em 3 camadas com a LLM gated no fallback** (ver §4). LLM NÃO substitui o embedding; só reformula a pergunta quando o embedding não consegue classificar.
3. **Tuning do router (Threshold/Top-K/Retry/Router ativo) permanece no Monitoramento.** Só migra o que está listado aqui. O que não está, não muda.
4. **Tudo rastreado** nos painéis de Consumo, Router e Backtest (§5). Requisito de primeira classe.
5. **Frontend via `ui-ux-pro-max`**, consistente com os blocos existentes.
6. **Sem em dash** em nenhum texto (regra de raiz do projeto).

---

## 4. Router contextual em 3 camadas (backend)

Fluxo dentro de `runAgent`, substituindo a chamada única de `pickDomains`:

```
Camada 1  embedding direto na pergunta crua  (igual hoje)
          |-- topScore >= threshold e sem fallback -> ROTEIA (fim, custo zero de LLM)
          |
Camada 2  fallback disparado (gatilho parametrizado)
          E "Construção da pergunta" ativa para a superfície (checkpoint)
          E há contexto (getLastNPairs(N) > 0)
          -> chama LLM barata (ex. GPT-5.4-nano) com os N pares + pergunta atual
          -> retorna SOMENTE a pergunta reformulada/enriquecida (prompt apertado, mín. tokens)
          |
Camada 3  re-embedding da pergunta reformulada -> classifica -> ROTEIA
          |-- se ainda assim cair em fallback -> mantém catálogo inteiro (seguro)
```

**Gatilho da Camada 2 (parametrizado):** o sinal é o `fallback.triggered` da decisão de embedding da Camada 1 (já existe em `RouterDecision`). Sem fallback, nunca chama LLM. Primeiro turno (sem pares) também não chama. Isso mantém o custo de LLM perto de zero (só na cauda que hoje falha).

**Componentes novos (backend):**
- `src/lib/agent/router/contextualize.ts` (novo): `reformulateQuestion({ conversationId, currentQuestion, nPairs, llmConfig, ... }) -> { reformulated: string | null, used: boolean, usage: UsageInfo | null }`. Reusa `getLastNPairs`, monta prompt curto (ver §4.1), chama `buildLlmClient`, timeout (default ~3s), fallback para `null` em erro/timeout. Espelha o padrão de `contextual-suggester.ts`.
- Integração em `run-agent.ts`: após a Camada 1, se `decision.fallback.triggered` e a feature está ativa para a superfície, chama `reformulateQuestion`; se vier texto, re-roda `pickDomains(reformulated)` (Camada 3) e usa essa decisão.
- O `pickDomains` não muda de assinatura; recebe a pergunta reformulada como string.

**Pesos / nº de pares:** `N` configurável (default 5, igual ao sugeridor). Os pares entram no prompt em ordem cronológica com marcação "Par i: Usuário / Agente" (mesmo formato do sugeridor). A LLM faz o trabalho de contexto; não há média ponderada de vetores nesta versão (decisão: LLM reformula, embedding classifica).

### 4.1 Prompt da "Construção da pergunta" (rascunho, vai para o plano)

Sistema (resumo): "Você recebe os últimos pares (Usuário/Agente) e a última pergunta do usuário.
Reescreva APENAS a última pergunta numa versão **autossuficiente e curta**, resolvendo referências
('e do mês passado?', 'e esse produto?') com base no contexto. Não responda, não explique, não use
markdown. Devolva só a pergunta reformulada em uma linha. Se a pergunta já é autossuficiente,
devolva-a como está." Saída: 1 linha, mín. tokens. Modelo barato configurável (default sugerido GPT-5.4-nano).

### 4.2 Ordem de execução e RBAC (resolve R1.1 e R1.2)

Sequência exata dentro de `runAgent`, substituindo o trecho atual (`pickDomains` -> `createDecision` -> fast-path RBAC -> `filterCatalog`):

```
1. decisaoL1 = pickDomains(perguntaCrua)
2. decisaoFinal = decisaoL1
   perguntaParaResposta = perguntaCrua   (a resposta do agente NUNCA usa a reformulada; ver nota)
3. SE decisaoL1.fallback.triggered E reformAtiva(superficie) E getLastNPairs>0:
      reformulada = reformulateQuestion(...)
      SE reformulada != null:
         decisaoL3 = pickDomains(reformulada)
         decisaoFinal = decisaoL3
4. createDecision(decisaoFinal, mode, originalFallback=decisaoL1.fallback.triggered,
                  usedReformulation=(reformulada!=null), reformulatedQuestion=reformulada)
      -> routerDecisionId
5. fast-path RBAC v2 roda sobre **decisaoFinal** (não a L1)
6. filterCatalog(decisaoFinal, routerEnabled, userAllowedDomains)
7. agente responde com o catálogo filtrado + histórico (perguntaCrua + janela de contexto)
```

**Nota crítica (R1.1):** a reformulação serve **só para rotear** (escolher tools). A pergunta que o
agente responde continua sendo a **pergunta crua do usuário** + a janela de contexto (§6). Não
trocamos a fala do usuário; só usamos a reformulada como chave de classificação do catálogo. Isso
evita responder a uma paráfrase que distorça a intenção.

**RBAC (R1.1):** como o fast-path de recusa decide com base nos domínios escolhidos, ele DEVE usar
`decisaoFinal`. Caso contrário, uma pergunta que cai em fallback (hoje não dispara o fast-path) seria
reformulada para um domínio proibido e entregaria tools fora do acesso. A checagem em `decisaoFinal`
fecha isso.

### 4.3 Interação com shadow/active (resolve R1.4)

- **Router em shadow (`routerEnabled=false`):** o catálogo não é filtrado (agente vê tudo). A Camada 2/3
  pode rodar para **logar** a decisão contextual (calibragem/telemetria), mas não muda o comportamento.
  Para não gastar LLM à toa em shadow, a Camada 2 em shadow é **opcional** e controlada por flag de
  calibragem (default: não chama LLM em shadow; só Camada 1 loga). Em **active**, a Camada 2 altera o
  catálogo de fato.
- **Checkpoint da Construção da pergunta (`routerReformCheckpoint`)** decide a superfície; `routerEnabled`
  decide se o efeito é real (active) ou só log (shadow).

### 4.4 Resolver do modelo de reformulação e timeout (resolve R1.5)

- Config resolvida de `AgentSettings.routerReform{Provider,Model,CredentialId}` via helper análogo a
  `getActiveLlmConfig` (`get-reform-config.ts` ou reuso parametrizado). Se não configurado e a feature
  estiver ON, faz fallback para o LLM ativo do projeto (como o sugeridor faz) e loga aviso.
- **Timeout 2.5s** (alinhado a `contextual-suggester.ts`). Em timeout/erro -> `null` -> mantém Camada 1.
- `reasoningEffort` mínimo (tarefa rápida), `maxTokens` baixo (a saída é uma linha).

---

## 5. Telemetria e painéis (requisito de primeira classe)

Cada turno que passa pela Camada 2/3 gera **chamadas adicionais** que precisam aparecer:

- **Consumo (`LlmUsage`):**
  - A chamada da LLM de reformulação loga com origem nova **`router_reformulacao`**.
  - O re-embedding da Camada 3 loga com origem **`router`** (já existe), distinguível do embedding da Camada 1.
- **Painel do Router (`AgentRouterDecision`):** estender o registro do turno para contar a história completa. Campos novos (nullable, retrocompatíveis):
  - `reformulatedQuestion String?` — a pergunta reformulada (null se Camada 2 não disparou).
  - `usedReformulation Boolean @default(false)` — se a Camada 2 rodou.
  - `originalFallback Boolean` — se a Camada 1 caiu em fallback (o gatilho).
  - A decisão final gravada reflete a Camada 3 (pickedDomains/scores da pergunta reformulada); os campos acima preservam a origem.
  - A tabela "Requisições do Router" passa a indicar visualmente (badge/coluna) quando houve reformulação, mostrando original -> reformulada.
- **Backtest:** as decisões com reformulação entram no mesmo fluxo de decisões; o Backtest deve refletir o domínio final e marcar reformulação quando aplicável (sem quebrar o cálculo existente).

Sem essa amarração, o painel mente sobre o que aconteceu no turno; por isso é bloqueante para a entrega.

### 5.1 Contrato mínimo do Backtest (resolve R1.5)

O Backtest hoje lê decisões/conversas para reavaliar. Contrato mínimo desta feature: o Backtest **não
pode quebrar** com os campos novos (nullable) e deve refletir o **domínio final** (Camada 3 quando
houve reformulação). Exibir a reformulação no Backtest é desejável, não bloqueante. O plano faz uma
**investigação dirigida** do Backtest (arquivos, query, colunas) antes de tocar, com uma task própria
para garantir retrocompatibilidade. Critério: rodar o Backtest após a migration sem erro e com o
domínio final correto.

---

## 6. Janela de contexto (backend: `loadHistory` configurável)

`loadHistory(conversationId, budget)` ganha um terceiro parâmetro de **filtro de papéis** e passa a
ler os valores efetivos do `AgentSettings`, resolvidos em `runAgent` conforme a superfície e o checkpoint:

- `contextWindowSize` (int, **trava 10 a 50**, default 20): vira o `budget`.
- `contextWindowIncludeSystem` (bool, default `true`):
  - `true` (atual): todos os papéis (`user`, `assistant`, `tool`), comportamento de hoje.
  - `false`: só `user` + assistant **final** (texto). Exclui `role=tool` e assistant-só-com-`toolCalls`. **Cuidado:** ao remover tools, é preciso **limpar referências de tool nas mensagens do assistant** que sobrarem, senão a API quebra (hoje `sanitizeHistoryPairs` trata pares incompletos; o modo "sem sistema" exige um passo de limpeza explícito). Detalhe que vai para o plano com teste dedicado.
- `contextWindowCheckpoint` (`FeatureCheckpoint`, default `PRODUCTION`): controla onde a janela configurada vale. `OFF` = sem histórico (turno isolado); `PLAYGROUND` = só playground; `PRODUCTION` = bubble + WhatsApp + playground. `runAgent` resolve via `args.isPlayground`.

Como `loadHistory` tem **um único call site** e as 3 superfícies passam por `runAgent`, ligar a config aqui é **implacável**: um ponto de mudança cobre tudo.

### 6.1 Algoritmo do filtro de papéis (modo "Usuário + IA", resolve R1.5)

Quando `includeSystem=false`, `loadHistory` deve devolver um histórico **válido para a API** (sem
referências de tool órfãs):
1. Buscar as últimas `budget` mensagens (todos os papéis), como hoje.
2. Descartar `role = "tool"`.
3. Para `role = "assistant"` que tenha `toolCalls`, **remover o campo `toolCalls`** (mantendo o texto
   final, se houver) ou descartar a mensagem se ela não tiver texto (era só chamada de tool).
4. Resultado: sequência só de `user` + `assistant` (texto), sem `tool_use`/`tool_result` pendentes.
5. `sanitizeHistoryPairs` continua rodando depois como salvaguarda.

Quando `includeSystem=true` (default), comportamento atual intacto. Teste dedicado cobre: conversa com
tool calls em ambos os modos não gera payload inválido (sem 400 da API).

---

## 7. Modelo de dados (`AgentSettings`, campos novos)

Migration aditiva (sem quebrar nada; defaults preservam comportamento atual):

```prisma
// Janela de contexto (resposta)
contextWindowCheckpoint   FeatureCheckpoint @default(PRODUCTION) @map("context_window_checkpoint")
contextWindowSize         Int               @default(20)        @map("context_window_size")      // clamp 10..50 na borda
contextWindowIncludeSystem Boolean          @default(true)      @map("context_window_include_system")

// Construção da pergunta (Camada 2 do router)
routerReformCheckpoint    FeatureCheckpoint @default(OFF)       @map("router_reform_checkpoint") // começa OFF: ativa após validar
routerReformProvider      String?           @map("router_reform_provider")
routerReformModel         String?           @map("router_reform_model")
routerReformCredentialId  String?  @db.Uuid @map("router_reform_credential_id")
routerReformNPairs        Int               @default(5)         @map("router_reform_n_pairs")

// Embeddings do router: SÓ a escolha de modelo. A credencial continua na
// fonte única compartilhada com o RAG (ver §7.1), sem campo duplicado.
routerEmbeddingProvider String? @map("router_embedding_provider")
routerEmbeddingModel    String? @map("router_embedding_model")
```

`AgentSettings.routerReformCheckpoint` default **OFF**: a Camada 2 entra desligada e só liga após a validação empírica (§9). Os blocos da UI permitem ligar.

### 7.1 Fonte única da credencial de embedding (resolve R1.3)

A credencial de embedding hoje é resolvida via `AppSetting embedding_credential_id` (usada por router
**e** RAG). Para **não criar duas verdades**, o bloco Embeddings da UI **edita exatamente essa fonte**
(o mesmo `AppSetting`/resolver que `embed()` já consome). Não há `routerEmbeddingCredentialId` separado.
Consequência: trocar a credencial no bloco afeta router e RAG juntos, que é o comportamento atual do
painel de Monitoramento (a migração só move a UI de lugar, não duplica o dado). `routerEmbeddingModel`
guarda apenas a escolha de modelo (ex.: `text-embedding-3-large`), também já existente hoje na config
do embedding. A migração da UI é, portanto, **sem data-migration de credencial** (a fonte é a mesma);
o risco de "perder credencial ativa" some.

---

## 8. Frontend (Configuração do Agente Nex) — via `ui-ux-pro-max`

Princípio mestre: **consistência** com os blocos existentes (mesmo chrome: ícone Lucide + título + descrição curta + pílulas Desativado/Playground/Produção no topo direito). Sem emoji. Tokens semânticos, foco visível, contraste AA, estados disabled claros, dark mode paritário.

### 8.1 Bloco "Janela de contexto" (abaixo de "Sugestões na Bubble")
- Chrome padrão + pílulas (`contextWindowCheckpoint`).
- **Quantidade de mensagens:** `Slider` (base-ui) de 10 a 50, passo 1, default 20, com **badge numérico tabular** ao lado mostrando o valor ao vivo, e helper text "Conta cada mensagem: do usuário, da IA e (se incluído) do sistema." Trava dura 10..50 no front e no back.
- **Tipos de mensagem:** `ToggleGroup`/segmented de 2 opções: "Usuário + IA" / "Usuário + IA + Sistema (tools)". Estado ativo por peso/fundo (não só cor). Default no segundo.
- Descrição deixa claro que vale para bubble, WhatsApp e playground (conforme escopo).

### 8.2 Bloco "Configuração de Router" (abaixo de "Janela de contexto")
- Chrome padrão + pílulas valendo para o bloco inteiro (`routerReformCheckpoint`). As pílulas gatilham a **Construção da pergunta** (Camada 2); o embedding em si não tem liga/desliga aqui (ele é o motor base, governado no Monitoramento).
- **Hierarquia bloco-com-subblocos:** dois sub-blocos com heading secundário e leve recuo/divisor (surface levemente distinta), cada um com a linha Provedor / Modelo / Chave:
  - **Construção da pergunta:** Provedor / Modelo (modelos de chat) / Chave. Helper: "Modelo barato que reescreve a pergunta com contexto quando o embedding não classifica."
  - **Embeddings:** Provedor / Modelo (**somente modelos de embedding** do provedor) / Chave. Migrado do Monitoramento.
- **Atalho "Acessar painel do router":** botão secundário com ícone (Lucide, ex. `ExternalLink`/`ArrowUpRight`) que navega para Monitoramento já na aba Router (via querystring/estado de aba). Não é CTA primário do bloco.

### 8.3 Caixa de "Chave de API" (novo padrão, 5ª imagem) + retrofit
- Componente de seleção que lista as chaves do provedor com **sufixo mascarado** ("Nome · ••••XXXX") e um item-ação no rodapé **"Nova chave de <Provedor>"** que leva ao cadastro já filtrado pelo provedor. Remove o texto "cadastrada em...".
- Aplica nos 3 sub-blocos novos **e retrofita** "Entrada de áudio" e "Entrada de anexo" para o mesmo padrão (consistência).
- Componente reaproveitável (`ApiKeySelect`), provavelmente já existe parcialmente (a 5ª imagem mostra o padrão em outro lugar); o plano localiza e unifica.

### 8.4 Dropdown de modelos de embedding
- O seletor de Modelo do sub-bloco Embeddings filtra a lista para **apenas modelos de embedding** do provedor escolhido (ex.: `text-embedding-3-large`, `text-embedding-3-small`). Não listar modelos de chat ali.

---

## 9. Validação empírica (calibragem contextual)

Antes de ligar a Camada 2 em produção, medir com a harness existente, estendida:
- Reaproveitar `scripts/router/calibrate-rounds.ts` para uma variante **contextual**: para cada conversa real (ex. R20-R23), reconstruir os pares anteriores e comparar Top-K de: (a) hoje sem contexto, (b) com reformulação LLM na cauda de fallback.
- Métrica de sucesso: **reduzir a taxa de fallback** sem baixar o Top-K dos casos hoje acertados (não regredir os 98%). Medir custo médio de token por turno (deve subir só na cauda).
- E2E contra dado real (regra de raiz §6.9 do projeto): subir serviço, exercer conversas multi-turno reais, conferir no painel que original -> reformulada -> domínio final aparecem.

---

## 10. Tratamento de erro / fallback (resiliência)

- LLM de reformulação em timeout/erro -> `null` -> mantém a decisão de fallback da Camada 1 (catálogo inteiro). Nunca quebra o turno.
- Re-embedding da Camada 3 falha -> mantém fallback. 
- Credencial de embedding ausente -> comportamento atual (já tratado em `safeEmbedQuestion`).
- Logging fire-and-forget (não bloqueia o turno), igual ao padrão atual de `createDecision`.

---

## 11. Escopo / YAGNI

- **Não** mexer no tuning do router (threshold/topK/retry/router-ativo) nem no painel de Monitoramento além do atalho de chegada e dos campos de telemetria novos.
- **Não** fazer média ponderada de vetores nesta versão (a LLM gated resolve; se medirmos que ainda falta, vira iteração futura).
- **Não** trocar o comportamento default da resposta (segue 20 msgs, todos os papéis).
- **Não** expor a lógica dos 5 pares do router em UI (fica backend, padrão, como as sugestões).

---

## 12. Riscos

- **Latência:** Camada 2 adiciona uma chamada LLM em série antes da resposta, só na cauda de fallback; modelo barato + gating mantêm baixo. Medir p95.
- **Modo "sem sistema" da janela:** remover mensagens de tool exige limpar referências no assistant; risco de 400 da API se malfeito. Teste dedicado.
- **Credencial de embedding (resolvido R1.3):** fonte única compartilhada com o RAG; a UI só muda de lugar, sem data-migration de credencial. Risco residual: a UI precisa ler/gravar exatamente a mesma fonte que `embed()` usa (verificar no plano).
- **RBAC com 3 camadas (resolvido R1.1):** o fast-path roda sobre a decisão final; teste de segurança dedicado garante que reformulação não vaza tools fora do acesso.
- **Telemetria incompleta:** se as chamadas extras não logarem, o Consumo subfatura e o painel mente. Bloqueante.

---

## 13. Mapa de arquivos afetados (primeira aproximação)

- Backend router: `src/lib/agent/router/contextualize.ts` (novo), `src/lib/agent/run-agent.ts` (integração 3 camadas), `src/lib/agent/router/log-decision.ts` (campos novos), `src/lib/agent/conversation.ts` (`loadHistory` com filtro de papéis).
- Telemetria: caminho de `LlmUsage` (origens novas), `AgentRouterDecision` (migration de campos), `src/lib/agent/router/queries.ts` + tabela de requisições (exibir reformulação), Backtest.
- Schema: `prisma/schema.prisma` (`AgentSettings` campos novos) + migration + data-migration da credencial.
- Frontend: página de Configuração do Agente Nex (blocos novos), componente `ApiKeySelect` (novo/unificado) + retrofit áudio/anexo, atalho para Monitoramento/Router, seletor de modelos de embedding.
- Validação: `scripts/router/calibrate-rounds.ts` (variante contextual).
- Rebuild de containers (CLAUDE.md §2.1): mudou `src/lib/agent/**` e schema -> rebuild `app` + `mcp` + `worker` antes de validar.

---

## 14. Critérios de aceite

1. Pergunta clara roteia igual a hoje (sem chamar LLM); 98% Top-K preservado.
2. Pergunta anafórica que hoje cai em fallback é reformulada e roteada para o domínio correto, com a história (original -> reformulada -> domínio) visível no painel do Router.
3. Consumo registra `router_reformulacao` e o re-embedding; nada some.
4. Janela de contexto: alterar nº de mensagens e tipos na UI muda de fato o histórico enviado em bubble, WhatsApp e playground, respeitando o checkpoint, com trava 10..50.
5. Caixa de chave nova funciona nos blocos novos e em áudio/anexo, com "Nova chave de <Provedor>".
6. Atalho abre o painel do Router na aba certa.
7. `tsc` + `eslint` + `jest` verdes; E2E multi-turno contra dado real confere os números.
