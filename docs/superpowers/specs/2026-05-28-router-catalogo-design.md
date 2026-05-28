# SPEC v2: R1, Router de catalogo por embedding

> **Sub-projeto R1 do roadmap de cobertura completa do Odoo.** Ver
> `docs/superpowers/specs/2026-05-28-roadmap-cobertura-completa-odoo.md` para
> contexto canonico.
>
> Status: **v2 (apos review adversarial #1)**. Diff em
> `docs/superpowers/research/2026-05-28-router-r1-review-v1-to-v2.md`.
> Proximas versoes: v3 (apos review adversarial #2).

---

## 1. Contexto e objetivo

O agente Nex hoje opera com **79 tools** em 9 dominios, atingindo **95,5%**
de qualidade na bateria R23 (290 turnos). O modelo padrao do agente e
`gpt-5.4-nano`, que recebe o catalogo completo de tools a cada turno como
parametro `tools` da Responses API.

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
de cada dominio. O router e habilitador arquitetural das ondas seguintes,
**nao tem valor de produto direto para o usuario final**.

**Meta de sucesso:** apos R1 entregue, o catalogo entregue ao LLM tem em
media 25-40 tools em vez de 79+ (reducao de 50-70%) **sem degradar a
qualidade do Nex** medida pela bateria R-X (baseline 95,5%).

---

## 2. Escopo

### Dentro do escopo

- Modulo novo `src/lib/agent/router/` com 6 componentes (vocabulary,
  embed-domains, pick-domains, filter-catalog, log-decision,
  tool-to-domain).
- Migration aditiva Prisma criando a tabela `AgentRouterDecision` e
  acrescentando 4 colunas em `AppSetting` (routerEnabled,
  routerThreshold, routerTopK, routerRetryExpandBelow).
- Modificacao cirurgica em `src/lib/agent/run-agent.ts` para orquestrar
  o router antes do `mcpToolsToProviderTools`.
- Aba "Router (shadow)" em `/admin/qualidade` (super_admin only) com
  KPIs, histograma de scores, tabela de discordancias, toggle de
  ativacao e endpoint de kill-switch.
- Integracao opcional com o validator V1-V5 existente (expansao de
  catalogo em retry quando router pode ter filtrado errado).
- Testes unitarios e de integracao.
- Bateria de qualidade R-X (proxima rodada apos R23) inteira em modo
  shadow para validar zero regressao.

### Fora do escopo

- Discovery enxuto (Sub-projeto R2): produz a lista de baldes A/B/C, fica
  para o proximo sub-projeto.
- Expansao real de tools (Ondas O1..ON): so comeca apos R1 mergeado.
- Mudancas em tools existentes, fatos existentes, prompts existentes do
  Nex.
- Servidor MCP (`mcp/`): nao recebe nenhuma alteracao. R1 vive 100% no
  lado do agente Next.js.
- F5 (WhatsApp), F6 (construtor de relatorios), F4 Onda 2 (escrita).
- Calibragem automatica do vocabulario (sera manual no PLAN, baseada nas
  perguntas das rodadas R8-R23 + R-X em shadow).

---

## 3. Filosofia preservada (principios do roadmap aplicados)

- **P1, aditivo:** zero tool, fato, prompt, tabela existente alterada.
- **P2, padrao de tool inalterado:** R1 nao toca em tool nenhuma.
- **P3, V1-V5 cobre:** validator existente nao precisa ser refeito; a
  integracao com R1 e opcional e aproveita o motor de retry ja em
  producao.
- **P4, qualidade gatilho:** R1 nao sobe para `main` se a proxima bateria
  R-X em shadow nao mantiver baseline >= 95,5%.
- **P5, uma onda por vez:** R1 e sub-projeto unico, branch unica
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
│  5. busca tools do MCP (como hoje)             │
│  6. NOVO: filter-catalog aplica filtro segundo │
│           routerEnabled (shadow vs active)     │
│  7. chama LLM com catalogo (filtrado ou nao)   │
│  8. V1-V5 audita resposta (como hoje)          │
│  9. NOVO: atualiza AgentRouterDecision com as  │
│           tools finalmente chamadas no turno   │
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
| `src/lib/agent/router/domain-vocabulary.ts` | Fonte unica da verdade do vocabulario. 9 entradas hoje, uma por dominio MCP. Inclui stop-list de saudacoes. |
| `src/lib/agent/router/embed-domains.ts` | Lazy-load: na primeira chamada, embeda todas as descricoes e cacheia em memoria do processo. Reembeda se vocabulary mudar (hash). |
| `src/lib/agent/router/pick-domains.ts` | Funcao pura `(question, allDomains) => RouterDecision`. Aplica as regras 1-8 da secao 8. |
| `src/lib/agent/router/filter-catalog.ts` | Recebe lista de tools MCP + RouterDecision, devolve lista filtrada. Trata garantias (`caminho3` sempre, etc.). |
| `src/lib/agent/router/log-decision.ts` | Persiste decisao em `AgentRouterDecision`. Fire-and-forget para nao bloquear o turno. |
| `src/lib/agent/router/tool-to-domain.ts` | Mapa explicito `toolName -> domain`. Resolve ambiguidade (ver §4.3). |

Total estimado: ~500 linhas de codigo de producao + ~700 de testes.

### 4.3 Definicao formal de "dominio da tool"

Cada tool MCP exposta pelo catalogo tem um `name` (ex:
`fiscal_notas_emitidas_por_cliente`). A derivacao do dominio segue, em
ordem:

1. Se o nome esta no mapa explicito `TOOL_TO_DOMAIN_OVERRIDE` em
   `tool-to-domain.ts`, usar o valor mapeado (case especial e ouro).
2. Senao, dominio = primeiro segmento antes do primeiro `_`
   (`fiscal_notas...` → `fiscal`).
3. Validar contra o set de dominios conhecidos em
   `domain-vocabulary.ts`. Se desconhecido, retornar
   `"_desconhecido"` (que e' sempre incluido no catalogo como fallback
   conservador).

O mapa explicito cobre os casos onde o path em `mcp/tools/<dir>/*` nao
bate com o prefixo do nome (ex: tools de `mcp/tools/caminho3/` que
podem ter nomes nao prefixados como `bi_consulta_avancada`).

---

## 5. Fluxo do turno

### 5.1 Modo shadow (default ao subir, `routerEnabled = false`)

```
1. usuario envia pergunta
2. run-agent.ts roda fluxo normal
3. chama router.pickDomains(question)
   ├─ embeda pergunta (reusa rag/embed.ts, ~30-80ms)
   ├─ cosine vs 9 vetores pre-computados de dominio
   └─ devolve RouterDecision {pickedDomains, scores, fallback,
                              pickDurationMs}
4. log-decision.log(decision)  [fire-and-forget, nao bloqueia]
5. catalogo entregue ao LLM = INTEIRO (nao filtra de fato)
6. LLM responde, possivelmente chamando 1+ tools, V1-V5 audita
7. log-decision.update(decisionId, toolsActuallyUsed)
   ├─ extrai todas as tools chamadas do turno (pode ser 0, 1, ou N)
   ├─ deriva dominio de cada tool via tool-to-domain.ts
   └─ atualiza row com toolsActuallyUsed (String[]) +
                       toolsDomains (String[])
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

- `toolsActuallyUsed` e `toolsDomains` sao arrays (ver §6.1).
- KPI primario (top-1): conta como acerto se **qualquer** tool chamada
  esta no dominio top-1 de `pickedDomains`.
- KPI secundario (todas no top-K): conta como acerto so se **todas** as
  tools chamadas estao em algum dominio de `pickedDomains`.
- Discordancia: turno onde nenhuma tool chamada esta em
  `pickedDomains`. Esses sao os candidatos a calibrar vocabulario.

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
  pickedDomains       String[]
  scores              Json
  fallbackTriggered   Boolean  @default(false)
  fallbackReason      String?
  routerVersion       String

  // o que aconteceu no turno
  mode                String   // "shadow" | "active" | "calibracao_R-X"
  catalogSizeOffered  Int      // qtas tools foram pro LLM
  catalogSizeFull     Int      // qtas tools existiam ao todo
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

### 6.2 AppSetting (tabela existente, 4 colunas novas)

```prisma
model AppSetting {
  // ... colunas existentes
  routerEnabled            Boolean @default(false)
  routerThreshold          Float   @default(0.55)
  routerTopK               Int     @default(3)
  routerRetryExpandBelow   Float   @default(0.70)
}
```

### 6.3 Migration

`prisma/migrations/2026XXXXXXXXXX_router_catalogo/migration.sql` aditiva
pura. GRANT SELECT idempotente para roles `nexus_mcp_*` ja consolidado
pelo projeto.

### 6.4 Relacoes inversas

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
```

### 7.2 Descricoes canonicas (9 entradas)

> **Importante:** o texto da `description` e' o que vira embedding. Escrita
> em portugues brasileiro do usuario final, nao do desenvolvedor.
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
funil, atividades de vendedor, conversao de oportunidade em pedido, taxa
de fechamento, perdas. Perguntas tipicas: "quantas oportunidades estao
paradas?", "qual vendedor converte mais?", "leads novos esse mes",
"funil de vendas".
```
> Nota: hoje 0 tools em `mcp/tools/crm/`. Mantem entrada para o router ja
> reconhecer o tema. Quando onda CRM (Sub-projeto O2) entregar tools,
> a entrada ja existe.

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
saida, locais (depositos, armazens), lote, serie, rastreabilidade, produto
parado (sem giro), tempo em estoque, duracao em dias, divergencia de
inventario. Perguntas tipicas: "qual o saldo do produto X?",
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
cache em memoria quando o hash muda. `AgentRouterDecision.routerVersion`
guarda esse hash + versao do codigo (ex: `"r1.0.0-a3f7b2"`), para
analise comparativa entre versoes do vocabulario.

Mudanca de description exige rebuild do container `app` (decisao
aceita, ver §13 B3).

---

## 8. Regras de selecao (ordem inegociavel)

A funcao `pickDomains(question, ctx)` aplica em ordem:

1. **Pergunta trivial:** se `question.trim().length < 10` OU se todas as
   palavras de `question.toLowerCase().trim().split(/\s+/)` estao na
   `SAUDACOES_STOP_LIST` → fallback. Razao: saudacoes nao merecem custo
   de embedding. `fallback.reason = "msg_trivial"`.

2. **Embed falha:** se `rag/embed.ts` retorna erro ou timeout > 3s →
   fallback. `fallback.reason = "embed_failed"`. Loga warn no console.

3. **Computa scores:** para cada dominio, `cosineSimilarity(qVec,
   domainVec)`. Salva todos em `scores`.

4. **Selecao top-K:** ordena por score desc, pega ate `routerTopK`
   (default 3) com `score >= routerThreshold` (default 0.55).

5. **Fallback de score:** se selecao vazia → fallback.
   `fallback.reason = "score_baixo"`. Catalogo inteiro.

6. **Garantia `excludeFromFiltering`:** adiciona `caminho3` (e outros
   marcados) ao set final, mesmo que nao tenha pontuado.

7. **Garantia `forceIncludeOn`:** para cada dominio com regex
   configurado, se algum regex casa com `question`, adiciona o dominio
   mesmo se fora do top-K. Regex devem usar `\b` para evitar falso
   positivo (ex: `\bcnpj\b` nao casa em "racnpjao").

8. **Decisao final:** retorna `RouterDecision` com `pickedDomains` (set
   resultante), `scores` (todos), `fallback` (booleano + reason),
   `pickDurationMs`.

---

## 9. Integracao com V1-V5 (apenas em modo ativo)

O validator existente em `src/lib/agent/validation/auto-validator.ts` ja
roda V1-V4 em shadow mode e pode disparar 1 retry corretivo em active
mode. R1 aproveita esse motor sem inventar caminho novo:

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

Pre-requisitos: super_admin, layout via `ui-ux-pro-max`.

**Conteudo da aba:**

1. **KPI big number:** taxa de acerto top-1 nos ultimos 7 dias.
   Definicao: `count(decisions WHERE pickedDomains[0] IN toolsDomains
   AND toolsActuallyUsed[0] IS NOT NULL) / count(decisions WHERE
   toolsActuallyUsed nao vazio)`.
   Considera turnos multi-tool: acerto se **qualquer** tool chamada esta
   no dominio top-1.

2. **KPI secundario (mais restrito):** % de turnos onde **todas** as
   tools chamadas estao em algum dominio de `pickedDomains`.

3. **Histograma:** distribuicao de `scores[topo]` em 10 buckets de 0.1.
   Ideal: bimodal (alto para perguntas direcionadas, baixo para vagas).
   Ruim: achatado (router nao discrimina).

4. **Tabela de discordancias:** ultimas 50 decisoes onde
   `toolsActuallyUsed` nao vazio E nenhuma `toolsDomains` esta em
   `pickedDomains`. Colunas: pergunta, dominios escolhidos pelo router,
   dominios das tools de fato chamadas, scores, data. **Esses sao os
   candidatos a calibrar a description do dominio.**

5. **Controles:**
   - Toggle `routerEnabled` (off=shadow, on=active). **Gate de seguranca:**
     o toggle so pode virar `on` se a aba mostrar KPI top-1 >= 85% nos
     ultimos 7 dias OU >= 200 decisoes em shadow com KPI top-1 >= 85%.
     Tentativa de ativar antes disso mostra dialogo de confirmacao
     forte com bypass de super_admin.
   - Input numerico `routerThreshold` (range 0.30 a 0.90, step 0.05).
   - Input numerico `routerTopK` (range 1 a 6).
   - Input numerico `routerRetryExpandBelow` (range 0.30 a 0.95,
     step 0.05).
   - Mudancas auditadas em `AuditLog` com action `setting_updated`
     (enum existente).

6. **Botao "Rodar contra bateria R-X":** executa offline as perguntas
   das rodadas R8..R23 contra o router atual (sem chamar LLM, so
   embedding + score), produz relatorio em `AgentRouterDecision` com
   `mode = "calibracao_R-X"` para nao misturar com producao.

### 10.2 Telemetria interna

- `console.info("[router]" ...)` em decisoes (so em dev/staging).
- `AgentRouterDecision.pickDurationMs` permite alarme se router demora
  > 200ms em p95 (sintoma de embedding lento).
- Em producao, alertas manuais via painel. Nao integramos com sistema
  externo (Datadog/Sentry) nesta fase.

### 10.3 Promocao para ativo

Manual. Painel impede ativacao prematura via gate de seguranca (10.1.5).
Criterio sugerido para o usuario decidir:
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
  - Regras 3-5: vetores ortogonais e correlacionados, varios thresholds.
  - Regra 6: `caminho3` sempre presente.
  - Regra 7: regex de `forceIncludeOn` casando com `\b` e nao casando
    sem `\b`.
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

### 11.3 Regressao

- **Bateria R-X (proxima rodada apos R23) inteira** rodada com R1 em
  shadow, baseline >= 95,5% preservado. Bloqueia merge se cair.
- Smoke test de tools (`scripts/quality-audit/tool-smoke-test.ts`)
  continua verde.

---

## 12. Criterios de promocao (merge para `main`)

1. tsc verde no monorepo inteiro.
2. ESLint verde no monorepo (sem regressao de warnings).
3. Todos os testes unitarios verdes (cap esperado: ~60 novos + os
   existentes).
4. Todos os testes de integracao verdes.
5. Migration aplicavel localmente sem erro, idempotente.
6. **Rebuild de containers obrigatorio:**
   - `prisma/schema.prisma` mudou → rebuild de `app`, `mcp`, `worker`.
   - `src/lib/agent/run-agent.ts` mudou → rebuild `app`.
   - Registrar em `HISTORY.md` com `scope=infra`.
7. Bateria R-X (proxima rodada) >= 95,5%.
8. Painel `/admin/qualidade` aba "Router (shadow)" funcional (verificado
   em dev local apos rebuild containers).
9. Code review (`/gsd-code-review`) sem achados criticos.
10. UI review (`/gsd-ui-review`) na aba nova sem achados criticos.

---

## 13. Riscos e mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| Embedding rate limit / latencia alta atrapalha UX | Media | Medio | timeout 3s na regra 2; fallback expoe catalogo inteiro; cache de embeddings de dominios em memoria evita re-embed; logar `pickDurationMs`. |
| Vocabulario inicial mal calibrado, router filtra errado | Alta | Alto | shadow mode obrigatorio antes de ativar; calibragem offline contra R8-R23 entra no PLAN como tarefa obrigatoria; dashboard de discordancias mostra ajustes a fazer; gate de seguranca no toggle (>= 85% antes de ativar). |
| Custo extra de chamadas de embedding | Baixa | Baixo | rag/embed.ts ja cobra apenas a pergunta do usuario (1 embed por turno), domain vectors sao pre-computados uma vez. Benchmark a confirmar no PLAN (item M1 da review). |
| `AgentRouterDecision` cresce demais | Media | Baixo | TTL 90 dias por cron de cleanup (entra na proxima onda, fora deste escopo R1). Por enquanto, indice em createdAt cobre queries do painel. |
| Migration quebra producao no merge | Baixa | Alto | Migration estritamente aditiva, idempotencia validada, GRANT SELECT explicito, runbook de aplicacao em `docs/runbooks/`. |
| Conflito multi-agente em run-agent.ts | Alta | Medio | active/*.md declarando o arquivo; commit cirurgico de 30 linhas; rebase antes do push. |
| Regressao no Nex em shadow (latencia +30-80ms perceptivel) | Media | Medio | Shadow log e fire-and-forget; nao bloqueia turno. Medir p95 antes e depois. |
| `crm` selecionado pelo router mas sem tool no MCP | Alta (no inicio) | Baixo | filter-catalog ignora silenciosamente dominio sem tools (warn dev). Quando onda O2 entregar tools de CRM, comportamento corrige automaticamente. |
| Modo ativo regredindo qualidade em producao | Baixa | Alto | Kill-switch (ver §16): toggle pode voltar a false em < 5s; endpoint admin de emergencia caso painel quebre. |

---

## 14. Open questions resolvidas (v1 → v2)

- A. Vocabulario completo: RESOLVIDO §7.2 com prose canonica.
- B. Definicao formal de "dominio da tool": RESOLVIDO §4.3.
- C. Pergunta vaga em modo ativo: RESOLVIDO §13 (cai em fallback,
  comportamento esperado).
- E. Logging granular: RESOLVIDO §6.1 + M4 da review (scores Json
  aceitavel por agora).
- F. Compatibilidade com Caminho 3c: RESOLVIDO §7.2 (`caminho3`
  excludeFromFiltering=true).
- G. Dominio que nao existe no MCP: RESOLVIDO §5.2.
- I. `forceIncludeOn` agressivo: RESOLVIDO §7.2 (regex com `\b`).
- J. Sanity check antes de toggle: RESOLVIDO §10.1.5 (gate de seguranca).

## 14b. Open questions ainda em aberto (atacar em v3)

- D. **Cache de embedding da pergunta** ainda aberto. Vale embedar duas
  vezes a mesma pergunta? Tradeoff custo vs complexidade.
- H. **Versionamento de vocabulario em runtime** aceitavel exigir
  rebuild? Confirmar em v3.

---

## 15. Proximos passos apos esta SPEC

1. **SPEC v3:** review critica adversarial #2, ainda mais profunda. Saida:
   versao final neste mesmo arquivo.
2. **PLAN v1 → v2 → v3:** decomposicao da SPEC v3 em tarefas atomicas.
3. **Execucao:** Superpowers (TDD inline, modelo Opus 4.7), ondas
   pequenas, commits atomicos.
4. **Verificacao:** bateria R-X em shadow + smoke + verificacao manual
   no painel.
5. **Code review e UI review.**
6. **PR aberto, avaliado por mim, merge gated pelo usuario.**

---

## 16. Rollback / kill-switch

R1 e' aditivo (P1), entao **nao precisa rollback de schema** para
desligar. O kill-switch tem 3 niveis:

### 16.1 Nivel 1: toggle no painel

Super_admin entra em `/admin/qualidade` aba "Router (shadow)" e desliga
`routerEnabled`. Propagacao: proximo turno usa catalogo inteiro. Tempo:
< 5s (leitura de AppSetting e per-request no agente Next.js, nao
cacheada no app dev).

### 16.2 Nivel 2: endpoint admin de emergencia

Se o painel quebrar (bug de UI), endpoint dedicado:

```
POST /api/admin/router/kill
Authorization: Bearer <super_admin_session>
Body: { reason: string }
```

Faz UPDATE direto em `AppSetting.routerEnabled = false`, audita em
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
