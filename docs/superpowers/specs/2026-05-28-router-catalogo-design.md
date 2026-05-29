# SPEC v3: R1, Router de catalogo por embedding

> **Sub-projeto R1 do roadmap de cobertura completa do Odoo.** Ver
> `docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md` para
> contexto canonico.
>
> Status: **v3 (apos review adversarial #2, definitiva para PLAN)**.
> Revisoes: v1 → v2 (review #1, doc em research/), v2 → v3 (review #2, doc
> em research/). Todas as open questions resolvidas.

---

## 1. Contexto e objetivo

O agente Nex hoje opera com **79 tools** em 9 dominios, atingindo
**95,5%** de qualidade na bateria R23 (290 turnos). O modelo padrao do
agente e' `gpt-5.4-nano`, que recebe o catalogo completo de tools a cada
turno como parametro `tools` da Responses API da OpenAI.

A medida que o roadmap de cobertura completa avanca (ondas O1..ON),
projetamos o catalogo crescer para **130-200 tools**. Empiricamente,
modelos nano e mini comecam a degradar a selecao de tool perto de
**120-150 entradas no catalogo**, gerando dois sintomas:

1. **Selecao errada de tool** (LLM chama tool A quando devia chamar B).
2. **Inflacao de tokens de contexto** (catalogo consome 16-32 KB de
   tokens por turno hoje; com 150 tools sobe para ~40-60 KB).

**Objetivo deste sub-projeto:** entregar um router de catalogo que filtra
quais tools sao expostas ao LLM em cada turno, baseado em similaridade
semantica entre a pergunta do usuario e descricoes em linguagem natural
de cada dominio. O router e' habilitador arquitetural das ondas seguintes,
**nao tem valor de produto direto para o usuario final**.

**Meta de sucesso:** apos R1 entregue, o catalogo entregue ao LLM tem em
media 25-40 tools em vez de 79+ (reducao de 50-70%) **sem degradar a
qualidade do Nex** medida pela bateria R-X (baseline 95,5%).

---

## 2. Escopo

### Dentro do escopo

- Modulo novo `src/lib/agent/router/` com 7 componentes (vocabulary,
  embed-domains, pick-domains, filter-catalog, log-decision,
  tool-to-domain, question-normalize).
- Cache LRU em memoria de embeddings de perguntas (200 entradas).
- Migration aditiva Prisma criando a tabela `AgentRouterDecision` e
  acrescentando 4 colunas em `AppSetting` (routerEnabled,
  routerThreshold, routerTopK, routerRetryExpandBelow).
- Modificacao cirurgica em `src/lib/agent/run-agent.ts` para orquestrar
  o router antes do `mcpToolsToProviderTools`.
- Aba "Router (shadow)" em `/admin/qualidade` (super_admin only) com
  KPIs, histograma de scores, tabela de discordancias, toggle de
  ativacao, controles de threshold, botao de calibragem e endpoint
  de kill-switch.
- Endpoint admin `/api/admin/router/kill` para desligamento de
  emergencia.
- Integracao opcional com o validator V1-V5 existente (expansao de
  catalogo em retry quando router pode ter filtrado errado).
- Script `scripts/router/calibrate-against-batteries.ts` que roda a
  pergunta de cada turno da R8..R23 contra o router e calcula taxa de
  acerto, salva relatorio em `docs/router-calibration-r1.md`.
- Testes unitarios e de integracao.
- Bateria de qualidade R-X (proxima rodada apos R23) inteira em modo
  shadow para validar zero regressao.

### Fora do escopo

- Discovery enxuto (Sub-projeto R2): produz a lista de baldes A/B/C,
  fica para o proximo sub-projeto.
- Expansao real de tools (Ondas O1..ON): so comeca apos R1 mergeado.
- Mudancas em tools existentes, fatos existentes, prompts existentes do
  Nex.
- Servidor MCP (`mcp/`): nao recebe nenhuma alteracao. R1 vive 100% no
  lado do agente Next.js.
- F5 (WhatsApp), F6 (construtor de relatorios), F4 Onda 2 (escrita).
- TTL/cleanup automatico de `AgentRouterDecision` (entra na proxima
  onda, fora deste R1).
- Auto-promocao de shadow para ativo: super_admin sempre decide
  manualmente.

---

## 3. Filosofia preservada (principios do roadmap aplicados)

- **P1, aditivo:** zero tool, fato, prompt, tabela existente alterada.
- **P2, padrao de tool inalterado:** R1 nao toca em tool nenhuma.
- **P3, V1-V5 cobre:** validator existente nao precisa ser refeito; a
  integracao com R1 e' opcional e aproveita o motor de retry ja em
  producao.
- **P4, qualidade gatilho:** R1 nao sobe para `main` se a proxima
  bateria R-X em shadow nao mantiver baseline >= 95,5%.
- **P5, uma onda por vez:** R1 e' sub-projeto unico, branch unica
  `feat/router-catalogo-r1`.
- **P9, reusar embeddings:** R1 usa `src/lib/agent/rag/embed.ts`, ja em
  producao, ja com observabilidade e cache.
- **P10, ui-ux-pro-max obrigatorio:** a aba "Router (shadow)" passa pela
  skill `ui-ux-pro-max` antes de codar.

---

## 4. Arquitetura

### 4.1 Onde o R1 vive

```
mensagem do usuario
      │
      ▼
┌────────────────────────────────────────────────┐
│  src/lib/agent/run-agent.ts                    │
│                                                 │
│  1. carrega contexto (RAG, BI schema, etc.)    │
│  2. monta sistema prompt                        │
│  3. NOVO: chama router.pickDomains(question)   │
│  4. NOVO: log decisao em AgentRouterDecision   │
│           (cria row, fire-and-forget)          │
│  5. busca tools do MCP (como hoje)             │
│  6. NOVO: filter-catalog aplica filtro segundo │
│           routerEnabled (shadow vs active)     │
│  7. chama LLM com catalogo (filtrado ou nao)   │
│  8. V1-V5 audita resposta (como hoje)          │
│  9. NOVO: atualiza row em AgentRouterDecision  │
│           com as tools finalmente chamadas     │
└────────────────────────────────────────────────┘
      │
      ▼
   resposta para o usuario
```

R1 vive **inteiramente no lado do agente** (Next.js `src/lib/agent/`). O
servidor MCP (`mcp/`) e os fatos (`fato_*`) nao sao tocados.

### 4.2 Componentes

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/agent/router/domain-vocabulary.ts` | Fonte unica da verdade do vocabulario. 9 entradas hoje, uma por dominio MCP. Inclui stop-list de saudacoes e VOCABULARY_VERSION. |
| `src/lib/agent/router/embed-domains.ts` | Lazy-load: na primeira chamada, embeda todas as descricoes e cacheia em memoria do processo. Reembeda se vocabulary mudar (hash). |
| `src/lib/agent/router/embed-question.ts` | Embeda a pergunta do usuario via `rag/embed.ts`, com cache LRU de 200 entradas. |
| `src/lib/agent/router/question-normalize.ts` | Normaliza pergunta antes de cache lookup ou embedding (trim, lowercase, collapse spaces, remove zero-width chars). |
| `src/lib/agent/router/pick-domains.ts` | Funcao pura `(question, ctx) => RouterDecision`. Aplica regras 1-8 da secao 8. |
| `src/lib/agent/router/filter-catalog.ts` | Recebe lista de tools MCP + RouterDecision, devolve lista filtrada. Trata garantias. |
| `src/lib/agent/router/log-decision.ts` | Persiste decisao em `AgentRouterDecision`. Fire-and-forget para nao bloquear o turno. Cria row + UPDATE posterior. |
| `src/lib/agent/router/tool-to-domain.ts` | Mapa explicito `toolName -> domain`. Resolve ambiguidade. |

Total estimado: ~600 linhas de codigo de producao + ~800 de testes.

### 4.3 Definicao formal de "dominio da tool"

Cada tool MCP exposta pelo catalogo tem um `name` (ex:
`fiscal_notas_emitidas_por_cliente`). A derivacao do dominio segue, em
ordem:

1. Se o nome esta no mapa explicito `TOOL_TO_DOMAIN_OVERRIDE` em
   `tool-to-domain.ts`, usar o valor mapeado (caso especial e ouro).
2. Senao, dominio = primeiro segmento antes do primeiro `_`
   (`fiscal_notas...` → `fiscal`).
3. Validar contra o set de dominios conhecidos em
   `domain-vocabulary.ts`. Se desconhecido, retornar
   `"_desconhecido"` (que e' sempre incluido no catalogo como fallback
   conservador).

O mapa explicito cobre os casos onde o path em `mcp/tools/<dir>/*` nao
bate com o prefixo do nome (ex: tools de `mcp/tools/caminho3/` que
podem ter nomes nao prefixados como `bi_consulta_avancada`).

### 4.4 Modelo de embedding

R1 reusa `src/lib/agent/rag/embed.ts`, ja em producao para RAG. Em
particular:

- **Modelo:** `text-embedding-3-small` da OpenAI.
- **Dimensoes:** 1536.
- **Latencia tipica:** 50-150ms por chamada (acima dos 30-80ms
  estimados na v1).
- **Custo:** $0.02 por 1M tokens, ~$0.00001 por pergunta media.
- **Storage em memoria:** 9 dominios * 1536 floats * 4 bytes = ~55 KB,
  insignificante.
- **Suporte multilingual:** razoavel em pt-br mas nao otimo. Aceitavel
  para o uso semantico de classificacao por dominio.

A latencia revisada (50-150ms) e' integrada na regra 2 (timeout 3s) e
no monitoramento (`pickDurationMs`).

### 4.5 Cache LRU de embeddings de perguntas

`embed-question.ts` mantem cache LRU em memoria do processo:

- **Tamanho:** 200 entradas.
- **Chave:** hash da pergunta normalizada (via `question-normalize.ts`).
- **Valor:** vetor de 1536 floats.
- **Politica:** least-recently-used; ejeta a entrada mais antiga quando
  cheio.
- **Lifetime:** processo (perde no rebuild ou restart).

**Beneficio:** usuario que envia mesma pergunta no playground 2x nao
paga embed duas vezes; perguntas repetidas de batch ficam baratas.

**Risco:** entre containers em HA, cada um tem seu cache. Aceitavel
(sem replica de leitura em producao hoje).

---

## 5. Fluxo do turno

### 5.1 Modo shadow (default ao subir, `routerEnabled = false`)

```
1. usuario envia pergunta
2. run-agent.ts roda fluxo normal
3. chama router.pickDomains(question, ctx)
   ├─ normaliza pergunta (question-normalize.ts)
   ├─ embed (cache hit OU rag/embed.ts, ~50-150ms)
   ├─ cosine vs 9 vetores pre-computados de dominio
   └─ devolve RouterDecision {pickedDomains, scores, fallback,
                              pickDurationMs}
4. log-decision.create(decision) → row em AgentRouterDecision
   (mode = "shadow"). Fire-and-forget, nao bloqueia.
5. catalogo entregue ao LLM = INTEIRO (nao filtra de fato)
6. LLM responde, possivelmente chamando 1+ tools, V1-V5 audita
7. log-decision.update(decisionId, toolsActuallyUsed, toolsDomains)
   ├─ extrai todas as tools chamadas do turno (pode ser 0, 1, ou N)
   ├─ deriva dominio de cada tool via tool-to-domain.ts
   └─ atualiza row (fire-and-forget se falhar, loga warn).
```

Resultado: zero impacto no comportamento atual do Nex. Apenas dados
sobre o que o router teria feito sao coletados em `AgentRouterDecision`.

### 5.2 Modo ativo (`routerEnabled = true`)

Identico a 5.1, exceto:

- Passo 5: catalogo entregue = uniao das tools dos dominios em
  `pickedDomains` + caminho3 (sempre) + tools com `excludeFromFiltering`
  + fallback de regex (`forceIncludeOn`).
- Passo 5 com fallback: se `decision.fallback.triggered === true`,
  catalogo entregue = INTEIRO (igual shadow).
- Passo 5 com dominio sem tools: se o router seleciona `crm` mas
  `mcp/tools/crm/` nao tem tool nenhuma exposta, ignorar silenciosamente
  (warn no log dev) e continuar com os outros dominios. Nao adiciona ao
  catalogo um set vazio.
- Passo 6 com retry inteligente: se V1-V5 detecta resposta tipo Caminho
  3a "sem metrica" **E** `fallback.triggered === false` **E**
  `decision.scores[topo] < routerRetryExpandBelow` (default 0.7),
  dispara retry expandindo catalogo para o inteiro. Reaproveita o motor
  de retry ja existente em `src/lib/agent/validation/auto-validator.ts`.

### 5.3 Multi-tool turn

O agente Nex chama frequentemente 2-4 tools por turno. Implicacoes:

- `toolsActuallyUsed` e `toolsDomains` sao arrays.
- **KPI primario (top-1):** turno conta como acerto se **qualquer** tool
  chamada esta no dominio top-1 de `pickedDomains`.
- **KPI secundario (todas no top-K):** turno conta como acerto so se
  **todas** as tools chamadas estao em algum dominio de `pickedDomains`.
- **Discordancia:** turno onde nenhuma tool chamada esta em
  `pickedDomains`. Esses sao os candidatos a calibrar vocabulario.

### 5.4 Race conditions

A row de `AgentRouterDecision` e' criada no passo 4 e atualizada no
passo 7. Se o turno cai entre 4 e 7 (LLM timeout, container restart):
- Row fica com `toolsActuallyUsed = []` para sempre.
- Dashboard que filtra KPI top-1 ignora rows com
  `toolsActuallyUsed = []` **E** `createdAt < now() - 60s` (timeout
  heuristico). Rows recentes podem ainda estar em flight.

Em ambiente de multi-container (HA), `decisionId` (cuid) garante
unicidade global. Update e' por ID. Sem conflito.

---

## 6. Modelo de dados

### 6.1 Nova tabela

```prisma
model AgentRouterDecision {
  id                  String   @id @default(cuid())
  createdAt           DateTime @default(now())

  // contexto do turno
  conversationId      String?
  conversation        Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  messageId           String?
  message             Message?      @relation(fields: [messageId], references: [id], onDelete: SetNull)

  // entrada
  userQuestion        String   @db.Text
  questionTokenCount  Int?

  // saida do router
  pickedDomains       String[] @default([])
  scores              Json     @default("{}")  // pode ser {} em fallbacks 1 e 2
  fallbackTriggered   Boolean  @default(false)
  fallbackReason      String?  // "msg_trivial" | "embed_failed" | "score_baixo" | null
  routerVersion       String

  // o que aconteceu no turno
  mode                String   // ver §6.2 lista canonica
  catalogSizeOffered  Int      @default(0) // qtas tools foram pro LLM
  catalogSizeFull     Int      @default(0) // qtas tools existiam ao todo
  toolsActuallyUsed   String[] @default([])
  toolsDomains        String[] @default([])
  llmModelUsed        String?
  pickDurationMs      Int?     // tempo do pickDomains, nao do turno

  @@map("agent_router_decision")
  @@index([createdAt, mode])
  @@index([conversationId])
  @@index([routerVersion])
}
```

### 6.2 Lista canonica de `mode`

- `"shadow"`: producao em modo shadow (default).
- `"active"`: producao em modo ativo.
- `"calibracao_R-X"`: rodada offline contra perguntas de uma bateria
  historica. Nao mistura com producao.
- `"test"`: ambiente de testes Jest. Permite filtrar fora do painel.
- `"e2e"`: testes end-to-end automatizados.

### 6.3 AppSetting (tabela existente, 4 colunas novas)

```prisma
model AppSetting {
  // ... colunas existentes
  routerEnabled            Boolean @default(false)
  routerThreshold          Float   @default(0.55)
  routerTopK               Int     @default(3)
  routerRetryExpandBelow   Float   @default(0.70)
}
```

### 6.4 Migration

`prisma/migrations/2026XXXXXXXXXX_router_catalogo/migration.sql` aditiva
pura. GRANT SELECT idempotente para roles `nexus_mcp_*` ja consolidado
pelo projeto. Migration roda nas 3 stacks (dev local, staging, prod) e
e' idempotente (re-execucao nao quebra).

### 6.5 Relacoes inversas

Conversation e Message ganham relacao inversa `routerDecisions
AgentRouterDecision[]`. Modificacao minima dos models existentes (so a
relacao, sem coluna).

---

## 7. Vocabulario de dominios

### 7.1 Estrutura

```ts
type DomainEntry = {
  domain: string;                       // chave canonica (ex: "financeiro")
  description: string;                  // PROSA em pt-br do usuario, 2-5 linhas
  examples: string[];                   // 3-5 perguntas reais do usuario
  forceIncludeOn?: RegExp[];           // opcional, regex com \b para evitar falso positivo
  excludeFromFiltering?: boolean;      // true para "caminho3" (sempre incluido)
};

// Lista de saudacoes/conversa social que dispara fallback (regra 1).
export const SAUDACOES_STOP_LIST = [
  "oi", "ola", "ola!", "bom dia", "boa tarde", "boa noite",
  "obrigado", "obrigada", "valeu", "ok", "okay", "sim", "nao", "talvez",
  "tudo bem", "tudo certo", "blz", "beleza",
];

// Hash da concatenacao das descriptions (8 chars).
export const VOCABULARY_VERSION: string;
```

### 7.2 Descricoes canonicas (9 entradas)

> **Importante:** o texto da `description` e' o que vira embedding.
> Escrita em portugues brasileiro do usuario final, nao do desenvolvedor.
> Mencionar termos que o usuario realmente digita.

**cadastros**
```
Cadastro de clientes, fornecedores, parceiros comerciais, transportadoras,
vendedores, filiais da empresa, cidades, estados (UF), empresas do grupo,
ramo de atividade, segmento, perfil tributario, e cadastro basico de
produtos. Inclui CNPJ, CPF, inscricao estadual, endereco, contato.
Perguntas tipicas: "quantos clientes ativos temos?", "lista os fornecedores
de Sao Paulo", "quais filiais existem?", "transportadoras cadastradas".
```
forceIncludeOn: `[/\bcnpj\b/i, /\bcpf\b/i, /\binscri[cç][aã]o estadual\b/i]`

**comercial**
```
Pedidos de venda, propostas, cotacoes, vendas fechadas, faturamento por
pedido, devolucoes, produtos vendidos por familia, top pedidos por valor,
tempo medio de fechamento, ticket medio, vendedor responsavel pelo pedido.
Perguntas tipicas: "quais os pedidos abertos?", "top 10 pedidos do mes",
"qual o ticket medio?", "tempo medio para fechar pedido".
```

**contabil**
```
Plano de contas, lancamentos contabeis, balancete, demonstracao de
resultado (DRE), contas referenciais, centros de custo contabeis, conta
gerencial. Perguntas tipicas: "qual conta contabil X?", "lancamentos do
mes em conta Y", "como foi o resultado contabil?", "plano de contas
ativo".
```

**crm**
```
Funil de vendas, pipeline, oportunidades em aberto, leads, etapas do
funil, atividades de vendedor, conversao de oportunidade em pedido,
taxa de fechamento, perdas. Perguntas tipicas: "quantas oportunidades
estao paradas?", "qual vendedor converte mais?", "leads novos esse mes",
"funil de vendas".
```
> Nota: hoje 0 tools em `mcp/tools/crm/`. Mantem entrada para o router
> ja reconhecer o tema. Quando onda CRM (Sub-projeto O2) entregar tools,
> a entrada ja existe. filter-catalog ignora silenciosamente dominio
> sem tools.

**dominios-vazios**
```
Indicador interno de cobertura, lista o que o agente Nex ainda nao sabe
responder. Nao orientado a usuario final, raramente perguntavel
diretamente.
```
> excludeFromFiltering: true (esse dominio nao deve influenciar a
> filtragem; ele responde so quando especificamente invocado por outras
> ferramentas de meta-info).

**estoque**
```
Saldo de estoque, posicao por local, movimentacao, extrato de entrada e
saida, locais (depositos, armazens), lote, serie, rastreabilidade,
produto parado (sem giro), tempo em estoque, duracao em dias, divergencia
de inventario. Perguntas tipicas: "qual o saldo do produto X?",
"movimentacao de estoque ontem", "produtos parados ha mais de 30 dias",
"posicao por deposito".
```

**financeiro**
```
Contas a pagar, contas a receber, saldo bancario, fluxo de caixa,
titulos vencidos, pagamentos efetuados, recebimentos, liquidez, posicao
de caixa, carteiras, bancos cadastrados, baixa de titulo, formas de
pagamento, centros de resultado financeiro. Perguntas tipicas: "quanto
temos a receber?", "fluxo de caixa do mes", "titulos vencidos",
"saldo no banco X".
```

**fiscal**
```
Notas fiscais emitidas pela empresa, notas recebidas dos fornecedores
(DF-e), NCM, CFOP, CEST, CST, aliquotas de ICMS, IPI, PIS, COFINS, ISS,
NFe, MDF-e (manifesto de transporte), carta de correcao, devolucao,
cancelamento, faturamento por marca, por produto, por cliente, situacao
da nota (autorizada, cancelada, denegada). Perguntas tipicas: "quais
notas fiscais saimos hoje?", "faturamento por marca", "notas recebidas
do fornecedor X", "ICMS da operacao Y".
```

**caminho3**
```
Consulta BI livre e SQL avancado. Resposta a qualquer pergunta que nao
se encaixa nos dominios padrao acima. Sempre disponivel como escape
hatch para o agente. Usado quando o usuario faz pergunta exotica,
cruzamento incomum entre dominios, ou consulta ad hoc de exploracao de
dado.
```
> excludeFromFiltering: true. Nunca sai do catalogo entregue ao LLM,
> independente de score. Garante escape hatch.

### 7.3 Hash de versao

`domain-vocabulary.ts` exporta `VOCABULARY_VERSION` = hash SHA256 das
descricoes concatenadas (truncado em 8 chars). Embed-domains invalida o
cache em memoria quando o hash muda (verificacao a cada chamada de
`pickDomains`).

`AgentRouterDecision.routerVersion` guarda formato:
```
r1.<major>.<minor>.<patch>-<vocab_hash>
```
- Major/minor/patch controlados manualmente no arquivo
  `src/lib/agent/router/version.ts` (ex: `"r1.0.0"`).
- vocab_hash gerado automaticamente do conteudo das descriptions.
- Exemplo final: `"r1.0.0-a3f7b2c8"`.

**Decisao definitiva H:** mudanca de description exige rebuild do
container `app`. Razoes: (a) arquivo TS importado; (b) embeddings caros
para hot-reload; (c) cache em memoria; (d) producao roda container
imutavel. Documentado e nao se oferece alternativa.

---

## 8. Regras de selecao (ordem inegociavel)

A funcao `pickDomains(question, ctx)` aplica em ordem:

1. **Pergunta trivial:** se `question.trim().length < 10` OU se todas
   as palavras de `question.toLowerCase().trim().split(/\s+/)` estao na
   `SAUDACOES_STOP_LIST` → fallback. `fallback.reason = "msg_trivial"`.
   `scores` = `{}`.

2. **Embed falha:** chamar `embed-question.ts`. Se retorna erro ou
   timeout > 3s → fallback. `fallback.reason = "embed_failed"`. `scores`
   = `{}`. Loga warn no console.

2.5. **Question normalize:** antes do embedding (e antes do cache
   lookup), `question-normalize.ts` aplica: `trim`, `toLowerCase`,
   collapse multiplos espacos em um, remove zero-width chars (`​`),
   remove quebras de linha.

3. **Computa scores:** para cada dominio, `cosineSimilarity(qVec,
   domainVec)`. Salva todos em `scores`. Em fallbacks 1 e 2, `scores`
   permanece `{}`.

4. **forceIncludeOn (early):** para cada dominio com regex configurado,
   se algum regex casa com `question` (apos normalize), adiciona o
   dominio ao set final independentemente de score. Esses entram antes
   do top-K, **com prioridade** (porque se o usuario digitou "CNPJ
   12.345...", queremos cadastros mesmo que score seja baixo).

5. **Selecao top-K:** ordena dominios por score desc, pega ate
   `routerTopK` (default 3) com `score >= routerThreshold` (default
   0.55). Acrescenta ao set final.

6. **Fallback de score:** se set final esta vazio apos passos 4 e 5 →
   fallback. `fallback.reason = "score_baixo"`. Catalogo inteiro.

7. **Garantia `excludeFromFiltering`:** adiciona `caminho3` (e outros
   marcados) ao set final, mesmo que nao tenha pontuado.

8. **Decisao final:** retorna `RouterDecision` com `pickedDomains` (set
   resultante), `scores` (todos), `fallback` (booleano + reason),
   `pickDurationMs`.

---

## 9. Integracao com V1-V5 (apenas em modo ativo)

O validator existente em `src/lib/agent/validation/auto-validator.ts`
ja roda V1-V4 em shadow mode e pode disparar 1 retry corretivo em
active mode. R1 aproveita esse motor sem inventar caminho novo:

```
LLM responde (com tools chamadas ou nao)
   │
   ▼
V1-V5 audita
   │
   ▼
detectou Caminho 3a ("sem metrica") ?
   ├─ NAO → fluxo normal
   └─ SIM
       │
       ▼
   routerEnabled ?
       ├─ NAO (shadow) → fluxo normal
       └─ SIM (active)
           │
           ▼
       decision.fallback.triggered ?
           ├─ SIM (catalogo ja era inteiro) → fluxo normal
           └─ NAO
               │
               ▼
           decision.scores[topo] < routerRetryExpandBelow ?
               ├─ NAO (router teve confianca alta) → confia na resposta original
               └─ SIM (router pode ter filtrado errado)
                   │
                   ▼
               DISPARA retry V1-V5 com catalogo INTEIRO
               (1 retry so, cap=1, igual ao motor existente)
```

`routerRetryExpandBelow` e' configuravel via `AppSetting` (default 0.70,
range 0.30 a 0.95). Logs do retry vao para
`AgentRouterDecision.fallbackReason` ganha sufixo
`"+retry_v5_expanded"` para auditoria.

---

## 10. Observabilidade e admin

### 10.1 Painel `/admin/qualidade` ganha aba "Router (shadow)"

Pre-requisitos: super_admin, layout via `ui-ux-pro-max`. Acesso valida
sessao via middleware existente de `/admin/*`.

**Conteudo da aba:**

1. **KPI big number:** taxa de acerto top-1 nos ultimos 7 dias.
   Definicao: `count(decisions WHERE pickedDomains[0] esta em
   toolsDomains AND toolsActuallyUsed nao vazio) / count(decisions
   WHERE toolsActuallyUsed nao vazio AND createdAt < now() - 60s)`.
   O filtro `createdAt < now() - 60s` ignora rows em flight.
   Considera turnos multi-tool: acerto se **qualquer** tool chamada esta
   no dominio top-1.

2. **KPI secundario (mais restrito):** % de turnos onde **todas** as
   tools chamadas estao em algum dominio de `pickedDomains`.

3. **Histograma:** distribuicao de `scores[topo]` em 10 buckets fixos
   ([0.0-0.1], [0.1-0.2], ..., [0.9-1.0]). Ideal: bimodal (alto para
   perguntas direcionadas, baixo para vagas).

4. **Latencia:** p50, p95 e p99 de `pickDurationMs` ao longo do tempo
   (grafico de linha 7 dias).

5. **Tabela de discordancias:** ultimas 50 decisoes onde
   `toolsActuallyUsed` nao vazio E nenhuma `toolsDomains` esta em
   `pickedDomains`. Colunas: pergunta, dominios escolhidos pelo router,
   dominios das tools de fato chamadas, scores, data. **Esses sao os
   candidatos a calibrar a description do dominio.**

6. **Controles:**
   - Toggle `routerEnabled` (off=shadow, on=active). **Gate de
     seguranca:** o toggle so pode virar `on` se a aba mostrar KPI
     top-1 >= 85% nos ultimos 7 dias OU >= 200 decisoes em shadow com
     KPI top-1 >= 85%. Tentativa de ativar antes disso mostra dialogo
     de confirmacao forte com bypass de super_admin.
   - Input numerico `routerThreshold` (range 0.30 a 0.90, step 0.05).
   - Input numerico `routerTopK` (range 1 a 6).
   - Input numerico `routerRetryExpandBelow` (range 0.30 a 0.95, step
     0.05).
   - Mudancas auditadas em `AuditLog` com action `setting_updated`
     (enum existente).

7. **Botao "Rodar calibragem contra rodadas R8-R23":** executa offline
   as ~290 perguntas das rodadas historicas contra o router atual (sem
   chamar LLM, so embed + score), produz relatorio em
   `AgentRouterDecision` com `mode = "calibracao_R-X"`. UI mostra
   progresso (10-30s para 290 perguntas). Custo: ~$0.003 (290
   embeddings).

### 10.2 Telemetria interna

- `console.info("[router]" ...)` em decisoes (so em dev/staging).
- `AgentRouterDecision.pickDurationMs` permite alarme se router demora
  > 200ms em p95 (sintoma de embedding lento).
- Em producao, alertas manuais via painel. Nao integramos com sistema
  externo (Datadog/Sentry) nesta fase.

### 10.3 Promocao para ativo

Manual. Painel impede ativacao prematura via gate de seguranca (10.1.6).
Criterio sugerido:
- Taxa de acerto top-1 >= 90% sustentada por 7 dias, OU
- Pelo menos 200 decisoes registradas em shadow com taxa >= 85%, OU
- Usuario decide manualmente (precisa confirmar dialogo).

Nao ha promocao automatica. Toggle e' do super_admin.

---

## 11. Plano de testes

### 11.1 Unit

- `pick-domains.test.ts` (cap ~30 testes):
  - Regra 1: pergunta < 10 chars; pergunta toda em saudacoes; mix.
  - Regra 2: mock de embed que falha com timeout.
  - Regra 2.5: normalize: collapse spaces, zero-width chars.
  - Regras 3-6: vetores ortogonais e correlacionados, varios thresholds.
  - Regra 4 (`forceIncludeOn` early): regex casando com `\b` e nao
    casando sem `\b`.
  - Regra 7: `caminho3` sempre presente.
  - Edge: vocabulary vazio (nao deve crashar, retorna fallback).
  - Edge: question vazio (regra 1 cobre).

- `filter-catalog.test.ts` (cap ~15 testes):
  - Catalogo de 79 tools, RouterDecision com 2 dominios, valida set
    final.
  - `excludeFromFiltering` garante presenca.
  - `fallback.triggered = true` → catalogo inteiro.
  - Dominio sem tools (ex: crm hoje) → ignora silenciosamente.
  - Idempotencia: filtrar 2 vezes da o mesmo resultado.

- `tool-to-domain.test.ts` (cap ~10 testes):
  - Regra 1: override explicito.
  - Regra 2: prefixo antes do `_`.
  - Regra 3: dominio desconhecido → `_desconhecido`.

- `embed-domains.test.ts` (cap ~8 testes):
  - Cache: 2 chamadas seguidas batem 1x no embed.
  - Hash diferente invalida cache.

- `embed-question.test.ts` (cap ~12 testes):
  - LRU cache: hit, miss, eviction.
  - Cache key sensitive a normalize (vagar trim/lowercase).
  - Cache size enforced.

- `question-normalize.test.ts` (cap ~10 testes):
  - trim, lowercase, collapse spaces, zero-width removal.

### 11.2 Integration

- `mcp/__tests__/router-shadow.test.ts`:
  - Sobe ambiente test com `routerEnabled = false`, manda pergunta de
    estoque, confirma `AgentRouterDecision` criada, `pickedDomains`
    contem "estoque", catalogo entregue ao LLM mock e' o **inteiro**.

- `mcp/__tests__/router-active.test.ts`:
  - Mesmo cenario com `routerEnabled = true`, valida catalogo filtrado
    (menor que o inteiro), `caminho3` presente.

- `mcp/__tests__/router-multi-tool.test.ts`:
  - Turno com 3 tools chamadas, valida `toolsActuallyUsed` e
    `toolsDomains` capturados todos.

- `mcp/__tests__/router-retry-v5.test.ts`:
  - Active mode, pergunta ambigua, mock de validator detectando Caminho
    3a, valida que retry com catalogo expandido foi disparado.

- `mcp/__tests__/router-empty-domain.test.ts`:
  - Active mode, pergunta que cai em `crm` (sem tools), valida que
    catalogo nao tem set vazio e continua com outros dominios.

- `mcp/__tests__/router-kill-endpoint.test.ts`:
  - Sem sessao super_admin → 403.
  - Com sessao → 200, AppSetting.routerEnabled = false, AuditLog row
    criada.

### 11.3 Regressao e benchmark

- **Bateria R-X (proxima rodada apos R23) inteira** rodada com R1 em
  shadow, baseline >= 95,5% preservado. Bloqueia merge se cair.
- Smoke test de tools (`scripts/quality-audit/tool-smoke-test.ts`)
  continua verde.
- **Benchmark de embedding obrigatorio antes de merge:** medir
  `pickDurationMs` em 100 perguntas reais consecutivas, reportar p50,
  p95, p99. Threshold de saude: p95 < 200ms. Se p95 > 200ms,
  investigar antes de merge.
- **Calibragem inicial obrigatoria:** rodar
  `scripts/router/calibrate-against-batteries.ts` antes do PR final,
  reportar acerto top-1 nas perguntas das rodadas R8-R23. Threshold de
  promocao: >= 85%. Se < 85%, ajustar descriptions e re-rodar.

---

## 12. Criterios de promocao (merge para `main`)

1. tsc verde no monorepo inteiro.
2. ESLint verde no monorepo (sem regressao de warnings).
3. Todos os testes unitarios verdes (cap esperado: ~85 novos + os
   existentes).
4. Todos os testes de integracao verdes.
5. Migration aplicavel localmente sem erro, idempotente.
6. **Rebuild de containers obrigatorio:**
   - `prisma/schema.prisma` mudou → rebuild de `app`, `mcp`, `worker`.
   - `src/lib/agent/run-agent.ts` mudou → rebuild `app`.
   - Registrar em `HISTORY.md` com `scope=infra`.
7. Bateria R-X (proxima rodada) em shadow >= 95,5%.
8. Benchmark de `pickDurationMs` p95 < 200ms.
9. Calibragem nas rodadas R8-R23: top-1 >= 85%.
10. Painel `/admin/qualidade` aba "Router (shadow)" funcional (verificado
    em dev local apos rebuild containers).
11. Code review (`/gsd-code-review`) sem achados criticos.
12. UI review (`/gsd-ui-review`) na aba nova sem achados criticos.

---

## 13. Riscos e mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Embedding rate limit / latencia alta atrapalha UX | Media | Medio | timeout 3s na regra 2; fallback expoe catalogo inteiro; cache de embeddings de dominios em memoria evita re-embed; cache LRU de perguntas; alarme em pickDurationMs p95. |
| Vocabulario inicial mal calibrado, router filtra errado | Alta | Alto | shadow mode obrigatorio antes de ativar; calibragem offline obrigatoria contra R8-R23 antes de merge; dashboard de discordancias mostra ajustes; gate de seguranca no toggle (>= 85%). |
| Custo extra de chamadas de embedding | Baixa | Baixo | `text-embedding-3-small` custa ~$0.00001 por pergunta. 10k turnos/mes = $0.10. Negligenciavel. Cache LRU reduz mais. |
| `AgentRouterDecision` cresce demais | Media | Baixo | 1000 turnos/dia * 90 dias * 2KB = ~180MB. Aceitavel. TTL/cleanup entra em onda futura. |
| Migration quebra producao no merge | Baixa | Alto | Migration estritamente aditiva, idempotencia validada, GRANT SELECT explicito. |
| Conflito multi-agente em run-agent.ts | Alta | Medio | active/*.md declarando o arquivo; commit cirurgico de 30 linhas; rebase antes do push. |
| Regressao no Nex em shadow (latencia +50-150ms perceptivel) | Media | Medio | Shadow log e' fire-and-forget; embed da pergunta e' sincrono mas em paralelo com outras preparacoes; medir p95 antes e depois. |
| `crm` selecionado mas sem tool | Alta (no inicio) | Baixo | filter-catalog ignora silenciosamente, warn dev. Quando onda O2 corrigir, automatico. |
| Modo ativo regredindo qualidade em producao | Baixa | Alto | Kill-switch (§16): toggle volta a false em < 5s; endpoint admin de emergencia; env var override. |
| Open question D ou H reabertas | Baixa | Baixo | Definitiva nesta v3. Mudancas exigem nova SPEC (R1.1). |

---

## 14. Open questions (todas resolvidas em v3)

- A. Vocabulario completo: RESOLVIDO §7.2 com prosa canonica.
- B. Definicao formal de "dominio da tool": RESOLVIDO §4.3.
- C. Pergunta vaga em modo ativo: RESOLVIDO §13 (cai em fallback,
  comportamento esperado).
- D. **Cache de embedding de pergunta:** RESOLVIDO §4.5. LRU em memoria,
  200 entradas, chave normalizada.
- E. Logging granular: RESOLVIDO §6.1 (scores Json aceitavel).
- F. Compatibilidade com Caminho 3c: RESOLVIDO §7.2 (`caminho3`
  excludeFromFiltering=true).
- G. Dominio que nao existe no MCP: RESOLVIDO §5.2.
- H. **Versionamento de vocabulario em runtime:** RESOLVIDO §7.3.
  Mudanca exige rebuild do container app, sem alternativa.
- I. `forceIncludeOn` agressivo: RESOLVIDO §7.2 (regex com `\b`) e
  §8 regra 4 (early check).
- J. Sanity check antes de toggle: RESOLVIDO §10.1.6 (gate de
  seguranca).

---

## 15. Proximos passos apos esta SPEC

1. **PLAN v1:** decomposicao em tarefas atomicas (writing-plans).
2. **PLAN v2:** review critica adversarial #1.
3. **PLAN v3:** review critica adversarial #2.
4. **Execucao:** Superpowers (TDD inline, modelo Opus 4.7), ondas
   pequenas, commits atomicos.
5. **Verificacao:** bateria R-X em shadow + smoke + verificacao manual
   no painel.
6. **Code review e UI review.**
7. **PR aberto, avaliado por mim, merge gated pelo usuario.**

---

## 16. Rollback / kill-switch

R1 e' aditivo (P1), entao **nao precisa rollback de schema** para
desligar. O kill-switch tem 3 niveis:

### 16.1 Nivel 1: toggle no painel

Super_admin entra em `/admin/qualidade` aba "Router (shadow)" e desliga
`routerEnabled`. Propagacao: proximo turno usa catalogo inteiro. Tempo:
< 5s (leitura de AppSetting per-request no agente Next.js, nao
cacheada).

### 16.2 Nivel 2: endpoint admin de emergencia

Se o painel quebrar (bug de UI), endpoint dedicado:

```
POST /api/admin/router/kill
Headers: cookies de sessao (NextAuth)
Body: { reason: string }
```

Autenticacao: usa o middleware existente de `/admin/*` que valida
sessao + role super_admin. Sem Bearer token (a app nao usa Bearer fora
do /api/mcp publico).

Acao: UPDATE em `AppSetting.routerEnabled = false`, audita em
`AuditLog` com `setting_updated`. Retorna 200 com novo estado.

### 16.3 Nivel 3: env var de override (fallback duro)

Variavel de ambiente `ROUTER_FORCE_DISABLE=true` no container `app`
forca shadow mode independente do banco. Exige redeploy do container
mas e' o ultimo recurso se banco estiver inacessivel.

### 16.4 Cleanup

Mesmo apos kill-switch, dados em `AgentRouterDecision` continuam sendo
gravados (em modo shadow do que seria). Nao polui nada, ajuda a
diagnosticar.

Para rollback completo do R1 (caso decisao seja matar feature):
- Marca migration como obsoleta no proximo deploy de schema.
- Mantem tabela (custo zero, dados historicos).
- Remove codigo de `src/lib/agent/router/` e a chamada em
  `run-agent.ts` em PR de rollback.
