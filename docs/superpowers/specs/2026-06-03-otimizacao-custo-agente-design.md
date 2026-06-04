# Otimização de custo do Agente Nex , Design (SPEC v3)

> Data: 2026-06-03
> Branch: `feat/agente-nex-bubble-ux`
> Status: revisada (2 passes adversariais aplicados) , pronta para plano

## Histórico de revisão

- **v1**: rascunho inicial das 3 alavancas.
- **v2** (review #1, lacunas e premissas): data injetada como item de input
  (não nas `instructions`) para deixar o prefixo 100% estável; migração Prisma
  para tokens cacheados; preço de input cacheado no catálogo de modelos;
  classificação das tools de listagem por tamanho potencial (paginar só listas
  que podem crescer); reconciliação com o `truncado`/`makeHonestTool` existente.
- **v3** (review #2, granularidade e integração): nota sobre dado mudar entre
  páginas (janela de sync); `COUNT` sobre a mesma cláusula `WHERE` da query;
  ordenação estável auditada por tool; teto de `limit`; fallback de caching
  quando o provider não expõe `cached_tokens`.

## 1. Problema

Cada pergunta ao Agente Nex consome de 2 a 4 requisições ao LLM
(`gpt-5.4-mini`), cada uma com **18 a 22 mil tokens de input** contra ~800 de
output. O custo é dominado pelo input, e o input é majoritariamente conteúdo
**repetido** entre chamadas:

- System prompt (`identity-base.ts`, ~26k caracteres ≈ 7-8k tokens) + regras.
- Catálogo de tools (schemas JSON das ferramentas do MCP).
- Histórico da conversa + resultado das tools (na 2ª chamada em diante).

Há margem real de economia sem degradar a qualidade já alcançada, mexendo só em
infraestrutura de prompt, billing e nas tools de listagem.

## 2. Diagnóstico (medido, não suposto)

| Fato | Fonte | Valor |
|---|---|---|
| Router ativo e filtrando de fato | banco `agent_settings` + `run-agent.ts:561,660` | `router_enabled=true`, oferece 40-65 de 93 tools por pergunta |
| Janela de histórico | banco `agent_settings` | `context_window_size=12` (já ajustado pelo usuário), PRODUCTION, inclui sistema |
| Data/hora variável no topo do system prompt | `run-agent.ts:426` | `agoraBrt` (com segundos) precede as 26k chars de regras |
| Provider OpenAI não lê tokens cacheados | `openai.ts:213` | usa só `prompt_tokens`, ignora `cached_tokens` |
| Tools de listagem sem paginação | `mcp/tools/**` | 96 tools totais; ~58 retornam lista; só 3 expõem limite hoje |
| Tools via factory `makeHonestTool` | `mcp/tools/lib/honest-tool.ts` | 6 de 96; envelope já tem `linhas[]`, `total`, `truncado` |

## 3. Escopo

### Dentro

- **Alavanca 1 , Prompt caching da OpenAI.**
- **Alavanca 2a , Janela de histórico.** (já concluída por config; esta spec
  só documenta e valida que está sendo aplicada.)
- **Alavanca 2b , Trava e paginação nas tools de listagem.**

### Fora (decisão explícita do usuário)

- Alavanca 3 (mexer no router / nº de domínios) , já cumpre o papel; ganho
  marginal não compensa o risco ao desempenho. Router permanece como está.
- Alavanca 4 (encolher o system prompt) , descartada (risco de regressão).
- Alavanca 5 (baixar `reasoning_effort`) , descartada (mantém qualidade).
- Alavanca 6 (modelo barato na 1ª chamada) , descartada (complexidade).

## 4. Alavanca 1 , Prompt caching da OpenAI

### 4.1 Como o caching da OpenAI funciona (premissa)

A OpenAI aplica desconto automático na porção **prefixo** do prompt que for
**idêntica** a uma chamada recente (TTL de minutos), cobrando os tokens
cacheados a uma fração do preço de input. Requisitos: prefixo idêntico byte a
byte, mínimo ~1024 tokens, mesma ordem. `prompt_cache_key` é uma dica opcional
de roteamento que aumenta a taxa de acerto. O modo `store: false` (usado hoje na
Responses API) **não** desabilita o caching , caching e storage são coisas
distintas.

### 4.2 Bug atual que zera o cache

`run-agent.ts:426` coloca `Data e hora atuais: <agoraBrt>` (com segundos) no
**topo** do system prompt. Como o prefixo muda a cada segundo, **nenhuma parte
do system fica cacheável** , nem entre a 1ª e a 2ª chamada da mesma pergunta
(separadas por ~15s).

### 4.3 Mudanças

1. **Reordenar o prompt para um prefixo estável.** A data atual sai do topo do
   system. **Decisão (v2):** a data deixa de ser concatenada ao `systemPrompt` e
   passa a ser **um item de input próprio** (mensagem `developer`/`user`),
   posicionado **imediatamente antes da pergunta do usuário**, depois do
   histórico. Assim as `instructions` (regras `identity-base`) ficam **100%
   estáveis** e cacheáveis byte a byte, e só o item curto de data varia.
   Estrutura alvo:
   - **Prefixo estável (cacheável):** system base (`identity-base`) + catálogo
     de tools.
   - **Sufixo variável:** histórico + item de data atual + pergunta do usuário.
2. **Granularidade de dia, não de segundo.** O item de data usa o dia
   (`2026-06-03`, mais dia da semana) em vez de data+hora+segundos. Como a data
   está fora do prefixo cacheável, a granularidade afeta só a legibilidade; o
   cache do prefixo não depende mais dela. Se alguma regra precisar de hora,
   incluir no mesmo item de input (segue fora do prefixo).
3. **Ler `cached_tokens` no provider OpenAI.** Em `openai.ts`, ler
   `usage.input_tokens_details.cached_tokens` (Responses API) e
   `usage.prompt_tokens_details.cached_tokens` (chat completions) e propagar o
   valor. **Fallback (v3):** se o campo não vier (modelo/endpoint que não expõe),
   tratar como `0` , o custo cai para o comportamento atual (sem desconto), sem
   quebrar.
4. **Persistir tokens cacheados (migração Prisma).** A tabela de uso ganha uma
   coluna `tokens_cached_input` (default 0). Migração via `prisma migrate dev`
   (aciona protocolo de schema entre worktrees: `agente schema-changed` + sugerir
   merge). O `usage-logger` grava o valor.
5. **Preço de input cacheado no catálogo de modelos.** `calculateCost` passa a
   considerar o preço de input cacheado por modelo (fração do input normal,
   conforme tabela do provider). Custo = `(input - cached) * preçoIn +
   cached * preçoInCached + output * preçoOut`. O menu de consumo deixa de
   superestimar.
6. **`prompt_cache_key` estável.** Definir uma chave estável por versão de system
   (ex.: hash curto do `identity-base`) para melhorar o roteamento de cache na
   Responses API. Verificar na doc do provider se o parâmetro é suportado no
   endpoint em uso; se não for, o caching automático por prefixo continua valendo
   (a chave é só uma dica de roteamento).

### 4.4 Fora de escopo da alavanca 1

- Não reescrever o conteúdo do system prompt (alavanca 4 está fora).
- Não alterar o catálogo nem o router (o catálogo varia por pergunta; o ganho
  garantido de cache é o system, e o catálogo dentro da mesma pergunta).

## 5. Alavanca 2a , Janela de histórico

Já ajustada pelo usuário para **12 mensagens** (PRODUCTION, inclui sistema) e
**confirmada em produção**: `run-agent.ts:295` lê `contextWindowSize` do banco,
`resolveContextWindow` clampa para [10,50] e, em PRODUCTION, devolve
`budget=12`, que vira `loadHistory(take: 12)`. `sanitizeHistoryPairs` garante que
não corta no meio de um par `tool_use`/`tool_result`. Por ser leitura de banco,
vale sem rebuild.

Esta spec não muda nada aqui , apenas registra o estado validado. (12 msgs ≈ 6
pares, dentro do razoável para chat de consulta operacional.)

## 6. Alavanca 2b , Trava e paginação nas tools de listagem

### 6.1 Princípio

Resolver no código o máximo possível; entregar à LLM o dado já mastigado. Listas
grandes (produtos, parceiros, pedidos) são o pior inflador de input na 2ª
chamada. A LLM deve ver no máximo **10 itens por vez**, e pedir os próximos
quando o usuário solicitar.

### 6.2 Por que não centralizar tudo num helper só

Medição: só 6 das 96 tools usam `makeHonestTool`; as outras 91 têm handler
próprio; ~58 retornam lista. Centralizar a paginação só no factory cobriria 6 de
96 , seria maquiagem. Editar os 96 às cegas desperdiça esforço nas ~38 que
retornam número agregado (onde paginar não significa nada). A ordenação estável
("os próximos 10" determinísticos) é semântica de cada tool e **não** pode ser
terceirizada , terceirizá-la é o que geraria bug.

### 6.3 Desenho , engrenagem central + adoção explícita

**Engrenagem central (um lugar, testada uma vez):**

- Um fragmento de input compartilhado (Zod) com `limit` (default **10**, máx a
  definir, ex. 50) e `offset` (default **0**).
- Um helper que, dado `total` e a lista da página, monta os metadados
  canônicos: `{ total, mostrando: "1-10", temMais: boolean, proximoOffset: number | null }`.

**Classificação prévia (v2) , paginar só o que pode crescer.** Antes de tocar,
classificar as ~58 tools de lista em três baldes:

- **Lista grande** (produtos, parceiros, pedidos, notas, DF-e...): podem ter
  centenas/milhares de linhas. **Recebem paginação completa** (`limit=10`).
- **Lista pequena por natureza** (filiais, UFs, contas contábeis, etapas,
  certificados...): dezenas no máximo. **Recebem `limit` com default maior**
  (ex.: 50) ou ficam sem trava se o teto natural já é baixo , paginar em 10
  seria ruído. Decisão por tool no plano.
- **Número agregado (~38):** sem paginação.

**Adoção explícita nas tools de lista grande (uma a uma):**

- A tool aceita `limit`/`offset` no input (fragmento Zod compartilhado).
- A query aplica `LIMIT`/`OFFSET` **no SQL** (Prisma), não fatiando array em
  memória , traz só a página do banco.
- A tool faz um `COUNT` para o `total` real, usando **a mesma cláusula `WHERE`**
  da query da página (senão `total` e página divergem).
- A tool garante um `ORDER BY` **estável e determinístico** (a ordenação
  semântica dela: margem, data, valor, nome...), com desempate por chave única
  (ex.: id) , pré-requisito para "os próximos 10" não repetir nem pular. Auditar
  quais tools já têm `ORDER BY` e quais precisam ganhar.
- A tool retorna a página + os metadados da engrenagem central.

**As tools via `makeHonestTool`** ganham a paginação pelo factory (uma edição
central). **Reconciliação (v2):** o campo `truncado`/`_listaTruncada` atual do
envelope é **substituído/derivado** pelos novos metadados (`temMais`), evitando
dois conceitos paralelos de "tem mais dado". O factory passa a aplicar
`limit`/`offset` na função `query` que cada tool fornece.

**Tools de número agregado (~38):** não recebem paginação.

**Nota (v3) , dado mudando entre páginas.** O cache é repovoado pelo worker
(incremental a cada ~3min). Se uma sync ocorrer entre a página 1 e a página 2, o
`offset` pode pular/repetir uma linha na fronteira. É aceitável para o caso de
uso (usuário pagina em segundos; ordenação estável com desempate por id reduz o
efeito). Não justifica keyset pagination agora; reavaliar só se virar problema
real.

### 6.4 Como o agente pede "os próximos" (MCP stateless)

O MCP é stateless por decisão canônica (#10). A tool **não** guarda offset. A
memória da paginação vive no **histórico da conversa** (por isso a janela de
contexto importa):

1. Usuário: "quais produtos eu tenho?" , agente chama a tool com `offset=0`;
   recebe 10 + `temMais=true, proximoOffset=10`.
2. O prompt instrui o agente a apresentar os 10 e oferecer "quer ver os
   próximos?".
3. Usuário: "liste os próximos" , o agente lê no histórico que a última página
   foi 1-10 e chama a tool com `offset=10`; recebe 11-20; e assim por diante.

### 6.5 Mudanças no prompt

- Regra de exibição: listar no máximo 10 itens por resposta.
- Regra de paginação: ao ver `temMais=true`, oferecer continuação; ao receber
  "próximos/mais/continuar", chamar a tool com `proximoOffset`.
- Coerência com a regra existente §12c/§12d de listas grandes.

## 7. Plano de testes

- **Alavanca 1:**
  - Teste unitário do provider: parsing de `cached_tokens` em respostas
    Responses API e chat completions (fixtures).
  - Teste do billing: custo com fração cacheada < custo sem cache.
  - Teste de montagem do prompt: prefixo estável idêntico entre duas chamadas
    com `agoraBrt` diferente (a data não está no prefixo).
  - Verificação E2E: subir o app, fazer a mesma pergunta duas vezes, conferir no
    menu de consumo que a 2ª chamada registra `cached_tokens > 0`.
- **Alavanca 2b:**
  - Teste por tool (ou por grupo) com TDD: `limit`/`offset` aplicam no SQL;
    `total` correto; `temMais`/`proximoOffset` corretos; ordenação estável
    (página 2 não repete nem pula item da página 1).
  - E2E contra dado real: "quantos produtos?" retorna 10 + total; "liste os
    próximos" retorna 11-20 sem repetição.

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Mover a data do topo quebra resolução de "hoje/ontem" | Manter a data no bloco de sistema (no fim) ou como contexto antes da pergunta; testar consultas relativas |
| `prompt_cache_key` mal escolhido reduz hit | Chave por hash do system base (estável entre perguntas) |
| Paginação com ordenação instável repete/pula itens | `ORDER BY` estável obrigatório por tool; teste página1∩página2=∅ |
| `LIMIT/OFFSET` em offsets altos é lento no Postgres | Listas do cache são de centenas, não milhões; aceitável. Reavaliar keyset pagination só se medir lentidão |
| Tocar ~58 tools introduz regressão | TDD por tool; decomposição máxima (1 task por tool/grupo); E2E contra dado real |
| Caching reduz custo exibido e parece "quebrar" relatório | Documentar no menu que cached_tokens custam menos; é o custo real |

## 9. Critérios de sucesso

- A 2ª chamada de uma pergunta repetida registra `cached_tokens > 0` no menu de
  consumo, com custo proporcionalmente menor.
- Toda tool de listagem respeita `limit=10`/`offset` no SQL, com `total`,
  `temMais` e `proximoOffset` corretos e ordenação determinística.
- O agente lista 10 por vez e atende "liste os próximos" sem repetir item.
- Nenhuma regressão de qualidade nas respostas (qualidade do agente preservada).
- `tsc` + `eslint` + `jest` verdes; E2E contra dado real conferido.
