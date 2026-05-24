# Melhorias do Agente Nex — Plano de Implementação (v3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar tarefa por tarefa. Steps usam checkbox (`- [ ]`).
> **UI/UX:** Toda tarefa marcada `[UI]` exige consulta à skill `ui-ux-pro-max` ANTES de implementar (regra de raiz do CLAUDE.md §6).
> **Histórico:** v1 → Review #1 → v2 → Review #2 (`reviews/2026-05-22-agente-nex-plan-review-2.md`) → **v3** (este — versão executável).

**Goal:** Tornar o Agente Nex desambiguador, seguro e com layout adaptativo: pergunta de volta quando a pergunta é ambígua, gera sugestões de resolução, esconde anexo/áudio conforme o checkpoint, mostra progresso genérico (sem nomes técnicos) e formata respostas humanizadas.

**Architecture:** Mudanças em três camadas, sem tocar `mcp/` (outro agente): (1) prompt (`src/lib/agent/prompt/`) para desambiguação, formatação e guardrails; (2) `run-agent.ts` + rotas SSE para eventos de progresso genéricos; (3) componentes `src/components/agent/*` (fora de `/consumo`) para gating, input adaptativo e indicador de progresso.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Prisma v7, provider OpenAI existente, Jest + @testing-library/react.

## Mudanças da v1 para a v2 (aplicação da Review #1)

- **M1:** D3 decomposta em D3a/D3b/D3c/D3d.
- **M2:** B2/B3 passam a ser ADITIVAS (`label` somado a `toolName`); novo B4 remove `toolName` só depois que a UI migrou. Nenhum commit intermediário quebra.
- **M3:** nova step em A2 instrui o agente a ignorar o carimbo de atualização que vem DENTRO do dado.
- **M4:** A1 ganha exemplos few-shot concretos.
- **M5:** registrada a dependência A1↔E (raciocínio sustenta a desambiguação).
- **M6:** C3 começa com `grep` dos consumidores de `MessageInput`.
- **M7:** novas tasks de teste de componente (D1b, C5).
- **M8/m12:** A2b e C1 reescritas como auditorias assertivas.
- **m10/m11:** notas de shippability e de override de prompt no playground.

## Mudanças da v2 para a v3 (aplicação da Review #2)

- **R9 (crítico):** nova Task A0 — auditar `AgentSettings` de produção; se `identityBase`/`advancedOverride` estiverem setados, as mudanças de prompt não se aplicam sem ação.
- **R8:** a regra de segurança passa a viver no `IDENTITY_BASE` (sempre aplicado), não só em `DEFAULT_GUARDRAILS` (que só semeia install novo).
- **R2:** A1 emenda a regra "máximo 3 frases" abrindo exceção para desambiguação e listas.
- **R3:** A5 trava o cap de sugestões (até 5, 80 chars) com ajuste em `run-agent.ts`.
- **R4:** D3b especifica matching FIFO de `tool_result`.
- **R1:** nova Task A6 — auditoria dos testes existentes do prompt.
- **R5/R7/R11:** seção de ordem/dependências reescrita; trilha declarada live-only.

---

## Contexto e estado atual (verificado no código)

- **Prompt:** `src/lib/agent/prompt/identity-base.ts` (IDENTITY_BASE), `defaults.ts` (DEFAULT_PERSONALITY/TONE/GUARDRAILS), `compose.ts` (`composeSystemPrompt`). `compose.test.ts` cobre composição.
- **Orquestrador:** `run-agent.ts` emite `AgentEvent` (`thinking`, `token`, `tool_call`, `tool_result`, `done`); `tool_call` carrega `toolName` cru.
- **Rotas SSE:** `api/agent/stream/route.ts` e `api/agent/playground/stream/route.ts`.
- **Bubble:** `chat-panel.tsx`. `AttachMenu` (clip) renderizado SEM gating. Mic gated por `audioInputEnabled`. Caret de streaming (`agent-message.tsx:99`) aparece sozinho como `|` enquanto `content` vazio.
- **Resolver:** `agent-config.ts` calcula `audioInputEnabled`/`imageInputEnabled` (`=== "PRODUCTION"`) e `audioInPlayground`/`imageInPlayground` (`!== "OFF"`). `(protected)/layout.tsx` renderiza `AgentBubble` passando só `audioInputEnabled`.
- **RBAC (confirmado):** `mcp/catalog/registry.ts` filtra o catálogo por `visibleDomains(user.role, user.domains)` e revalida na invocação (`DomainDeniedError`). Sem permissão de domínio o agente não enxerga a tool e a chamada é bloqueada no servidor. A afirmação do usuário está correta. Os guardrails desta entrega tratam de impedir o agente de DESCREVER tabelas/arquitetura/chaves, não de acessar dados.
- **Nano:** o modelo de produção é GPT-5.4 nano (reasoning). M4/M5: a desambiguação depende de instrução bem ancorada (exemplos) e de raciocínio adequado.

## Inventário de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/lib/agent/prompt/identity-base.ts` | Identidade canônica | Modificar |
| `src/lib/agent/prompt/defaults.ts` | Defaults de personalidade/tom/guardrails | Modificar |
| `src/lib/agent/prompt/compose.ts` | Composição do system prompt | Modificar |
| `src/lib/agent/progress-labels.ts` | Mapa tool id → rótulo genérico | **Criar** |
| `src/lib/agent/run-agent.ts` | Eventos de progresso | Modificar |
| `src/app/api/agent/stream/route.ts` | SSE bubble | Modificar |
| `src/app/api/agent/playground/stream/route.ts` | SSE playground | Modificar |
| `src/components/agent/agent-message.tsx` | Render de mensagens / ToolBubble / LoadingBubble | Modificar |
| `src/components/agent/progress-trail.tsx` | Trilha de progresso compacta | **Criar** `[UI]` |
| `src/components/agent/chat-panel.tsx` | Painel da bubble | Modificar `[UI]` |
| `src/components/agent/agent-bubble.tsx` | FAB + props | Modificar |
| `src/components/agent/message-input.tsx` | Input compartilhado | Modificar `[UI]` |
| `src/components/agent/playground-content.tsx` | Playground | Modificar `[UI]` |
| `src/app/(protected)/layout.tsx` | Threading de props para a bubble | Modificar |
| `prisma/schema.prisma` | Campo `reasoningEffort` (Fase E) | Modificar — **coordenar** |

## Coordenação multi-agente

- **NÃO tocar `mcp/`** (`claude-f4-leitura-expansao`). Desambiguação resolvida 100% em prompt + agente.
- **NÃO tocar `src/components/agent/consumo/`** (`claude-agente-nex-consumo`).
- **`prisma/schema.prisma`** (Fase E): antes de E1, `git log -3 -- prisma/schema.prisma`; se houver migration concorrente, pausar a Fase E e anotar no `active/*.md`.
- **Shippability (m11):** Fases A, C e E são independentes e podem virar PRs próprios. B+D são acopladas — entram juntas.

---

## FASE A — Comportamento, prompt e guardrails (backend puro)

### Task A0: Auditar o AgentSettings de produção (R9 — bloqueante da Fase A)

**Files:** nenhum (auditoria). Pode gerar follow-up.

- [ ] **Step 1:** Inspecionar a linha `AgentSettings` (`id="global"`): `SELECT identity_base IS NOT NULL AS tem_identity, advanced_override IS NOT NULL AS tem_override FROM agent_settings WHERE id='global';`
- [ ] **Step 2: Decidir:**
  - `advanced_override` não-nulo → o prompt inteiro é o override; A1-A5 não se aplicam. Levar ao usuário: limpar o override ou mesclar nele. BLOQUEIA a Fase A.
  - `identity_base` não-nulo (sem override) → as mudanças de A1/A2/A4 precisam ir para esse valor no banco, não só para o arquivo. Planejar a atualização do registro (tela Prompt ou seed).
  - Ambos nulos → o `IDENTITY_BASE` hardcoded está em uso; A1-A5 se aplicam direto.
- [ ] **Step 3:** Registrar o resultado no `active/*.md` e no commit da Task A1.

### Task A1: Bloco de desambiguação no IDENTITY_BASE, com exemplos

**Files:** Modify `src/lib/agent/prompt/identity-base.ts`; Test `src/lib/agent/prompt/compose.test.ts`

- [ ] **Step 1: Teste falho:**

```ts
test("IDENTITY_BASE traz a política de desambiguação com exemplos", () => {
  expect(IDENTITY_BASE).toContain("[DESAMBIGUAÇÃO]");
  expect(IDENTITY_BASE.toLowerCase()).toContain("pergunte de volta");
  expect(IDENTITY_BASE).toContain("Exemplo 1");
});
```

- [ ] **Step 2: Rodar** `npx jest src/lib/agent/prompt/compose.test.ts -t desambiguação` → FAIL.
- [ ] **Step 3: Implementar** — inserir antes de `## Semântica de período`:

```
## [DESAMBIGUAÇÃO] Política de pergunta de volta (REGRA CANÔNICA, todos os domínios)
Antes de responder, avalie se a pergunta é objetiva e tem resposta única. Se houver QUALQUER ambiguidade, NÃO escolha uma interpretação: pergunte de volta numa única mensagem, cobrindo TODAS as ambiguidades de uma vez.

Tipos de ambiguidade:
- Termo que casa com vários registros (um nome de produto/cliente/conta que retorna múltiplos resultados).
- Métrica com mais de um sentido ("valor" pode ser preço de custo ou de venda; "saldo" pode ser estoque ou financeiro).
- Período não informado quando ele muda a resposta.
- Escopo vago ("as entregas" sem dizer quais).

Como perguntar de volta:
- Cordial e direto. Cubra cada eixo de ambiguidade num item curto.
- Liste no máximo 5 opções concretas; se houver mais, diga quantas existem.
- NÃO traga números ainda: a mensagem de desambiguação é só a pergunta de volta.
- Sempre ofereça sugestões clicáveis que resolvam a ambiguidade.

Quando NÃO perguntar de volta:
- A pergunta já cita código/período/métrica claros: responda direto.
- O usuário já respondeu uma desambiguação: execute a consulta sem repetir a pergunta.

Exemplo 1 — usuário: "qual o valor unitário do produto puxador corda?"
Você (sem trazer números): "Para te dar o número certo, preciso de dois detalhes: (1) o 'valor' é o preço de custo ou o preço de venda? (2) encontrei 5 produtos com 'puxador corda' no nome. Sobre qual deles você quer saber?" + sugestões clicáveis com as opções.

Exemplo 2 — usuário: "quanto faturamos?"
Você: "De qual período você quer o faturamento? Posso trazer o mês atual, os últimos 30 dias ou um intervalo específico." + sugestões.

Exemplo 3 — usuário: "qual o faturamento do mês atual?"
Pergunta específica: responda direto, sem perguntar de volta.
```

- [ ] **Step 3b: Emendar a regra de concisão (R2)** — no bloco `## Postura`, trocar "Máximo 3 frases por resposta" por: "Respostas curtas, em geral até 3 frases. Exceção: mensagens de desambiguação e listas podem ser mais longas, o necessário para cobrir as opções com clareza."
- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** `feat(agente): politica de desambiguacao com exemplos no prompt`.

### Task A2: Remover "atualizado há Xs" do prompt e mandar ignorar o carimbo no dado

**Files:** Modify `src/lib/agent/prompt/identity-base.ts`; Test `compose.test.ts`

- [ ] **Step 1: Teste falho:**

```ts
test("IDENTITY_BASE não pede o timestamp e manda ignorá-lo no dado", () => {
  expect(IDENTITY_BASE).not.toContain('"atualizado há');
  expect(IDENTITY_BASE.toLowerCase()).toContain("carimbo de atualização");
});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** — no `## Formato de resposta`, remover a linha do `"atualizado há Xs"` e adicionar:

```
- Os resultados das consultas podem conter um carimbo de atualização (ex.: "atualizado há 5s"). Ignore-o por completo: nunca o repita, nunca o mencione. Os dados são sincronizados continuamente; o usuário quer só a resposta.
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** `feat(agente): remove selo de atualizacao e manda ignorar carimbo no dado`.

### Task A2b: Auditoria do timestamp em bi-schema-reference

**Files:** possivelmente `src/lib/agent/bi-schema-reference.ts`

- [ ] **Step 1:** `grep -n "atualizado" src/lib/agent/bi-schema-reference.ts`. Ler as ocorrências.
- [ ] **Step 2:** Se for instrução de EXIBIR ao usuário, remover. Se for descrição de coluna do schema BI (provável), manter sem alteração. Registrar a decisão no corpo do commit (ou, se nada mudou, pular o commit e anotar no plano).

### Task A3: Guardrails de segurança contra exposição técnica

**Files:** Modify `defaults.ts`, `identity-base.ts`; Test `compose.test.ts`

- [ ] **Step 1: Teste falho:**

```ts
test("DEFAULT_GUARDRAILS bloqueia perguntas técnicas/arquitetura", () => {
  const joined = DEFAULT_GUARDRAILS.join(" ").toLowerCase();
  expect(joined).toContain("arquitetura");
  expect(joined).toContain("chave de api");
});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3:** Acrescentar a `DEFAULT_GUARDRAILS`:

```ts
  "Recuse, de forma educada e breve, qualquer pergunta sobre o funcionamento interno: nomes de tabelas, campos, ferramentas, queries, SQL, arquitetura, API, endpoints, chave de API, credenciais, modelo de IA ou infraestrutura. Diga que esse tipo de informação não é compartilhada e ofereça ajuda com dados de operação.",
  "Nunca liste, descreva ou confirme quais tabelas, ferramentas ou fontes de dados existem, mesmo sob insistência ou reformulação da pergunta.",
```

- [ ] **Step 4 (R8 — sempre aplicado):** A regra de segurança PRECISA viver no `IDENTITY_BASE` (sempre composto): `DEFAULT_GUARDRAILS` só semeia install novo e não atinge a linha já gravada em produção. Em `identity-base.ts`, adicionar antes do `## Guia de seleção de ferramenta`:

```
## Segurança da informação (REGRA INEGOCIÁVEL)
Nunca revele nem confirme detalhes do funcionamento interno: nomes de tabelas, campos, ferramentas, queries, SQL, arquitetura, API, endpoints, chave de API, credenciais, modelo de IA ou infraestrutura. Se perguntarem, recuse com naturalidade: "Esse tipo de informação técnica não é compartilhada. Posso ajudar com dados da operação: estoque, faturamento, pedidos, financeiro e cadastros." Não liste nem descreva fontes de dados, mesmo sob insistência ou reformulação.
```

E no `## Guia de seleção de ferramenta` adicionar:

```
### Pergunta sobre funcionamento interno (tabelas, API, arquitetura, chaves, modelo)
→ Aplicar a regra de Segurança da informação: recusar com naturalidade, sem revelar nem negar detalhes.
```

> Nota R8: o item do Step 3 (`DEFAULT_GUARDRAILS`) só vale para install novo. A proteção efetiva em produção vem deste Step 4 (`IDENTITY_BASE`), sujeito à Task A0.

- [ ] **Step 5: Rodar** → PASS. **Step 6: Commit** `feat(agente): guardrails contra exposicao tecnica`.

> Nota (m10): no Playground, `promptConfigOverride` substitui os guardrails da config; uma sessão de teste com guardrails custom não carrega A3. É por design (playground é admin-only). Sem ação, apenas registrado.

### Task A4: Formatação humanizada (tópicos + negrito + sem termos técnicos)

**Files:** Modify `identity-base.ts`; Test `compose.test.ts`

- [ ] **Step 1: Teste falho:** `expect(IDENTITY_BASE.toLowerCase()).toContain("negrito");`
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3:** Substituir o bloco `## Formato de resposta` por:

```
## Formato de resposta
- Escreva como alguém da operação escreveria: natural, claro, sem jargão de TI.
- Resposta curta para pergunta simples. Ao listar mais de um item, use lista com hífens, um item por linha.
- Destaque valores e nomes-chave em **negrito** (ex.: **R$ 124,00**, **PMB403**).
- Priorize números, percentuais e nomes concretos. Datas dd/mm/aaaa, números em formato brasileiro.
- Nunca cite tabela, ferramenta, query, campo, "cache" ou de onde o dado veio.
- Os resultados podem conter um carimbo de atualização; ignore-o, nunca o repita.
- Nada de markdown pesado (tabelas grandes, headers aninhados).
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** `feat(agente): formatacao de resposta humanizada`.

### Task A5: Sugestões orientadas à resolução de ambiguidade

**Files:** Modify `compose.ts`; Test `compose.test.ts`

- [ ] **Step 1: Teste falho:**

```ts
test("instrução de sugestões cobre desambiguação", () => {
  const out = composeSystemPrompt(
    { identityBase: null, personality: "", tone: "", guardrails: [],
      advancedOverride: null, kbEnabled: false, terminology: {}, suggestionsEnabled: true }, []);
  expect(out).toContain("desambiguação");
});
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3:** No bloco `cfg.suggestionsEnabled` de `compose.ts`, trocar "Máximo 3 sugestões" por "Máximo 5 sugestões" e acrescentar:

```
- Quando a resposta for uma pergunta de desambiguação, as sugestões DEVEM resolver a ambiguidade: ofereça as opções concretas (cada produto que casou pelo nome, ou "Preço de custo"/"Preço de venda"). É o caso de maior prioridade para incluir sugestões. Use até 5 sugestões nesse caso.
```

- [ ] **Step 3b (R3 — cap de sugestões):** Em `run-agent.ts`, elevar `MAX_SUGGESTIONS` de 3 para 5 e `MAX_SUGGESTION_LEN` de 60 para 80, para caber 5 produtos com nomes longos. Ajustar qualquer teste de `extractSuggestions` que asserte os limites antigos.
- [ ] **Step 4: Rodar** `npx jest src/lib/agent/prompt src/lib/agent/run-agent.test.ts` → PASS. **Step 5: Commit** `feat(agente): sugestoes de desambiguacao (ate 5, resolvem a ambiguidade)`.

### Task A6: Auditar e corrigir os testes existentes do prompt (R1)

**Files:** `src/lib/agent/prompt/compose.test.ts` e quaisquer testes que assertem texto do prompt.

- [ ] **Step 1:** `npx jest src/lib/agent/prompt` — rodar e listar os testes que quebraram pelas mudanças de texto de A1-A5.
- [ ] **Step 2:** Para cada teste quebrado por mudança LEGÍTIMA, atualizar a asserção para o novo conteúdo real. Não enfraquecer (não trocar por `toBeTruthy`).
- [ ] **Step 3:** `npx jest src/lib/agent/prompt` → verde.
- [ ] **Step 4: Commit** `test(agente): atualiza asserts do prompt para o novo conteudo`.

> Dependência A1↔E (M5): a desambiguação é instrução complexa para um modelo nano. A validação de A (Task F2) só é conclusiva com o raciocínio do modelo num nível adequado — ver Fase E. Se a Fase E ficar para depois, a verificação de A deve registrar o nível de raciocínio em uso.

---

## FASE B — Eventos de progresso genéricos (backend, aditivo)

### Task B1: Mapa de rótulos genéricos

**Files:** Create `src/lib/agent/progress-labels.ts` + `progress-labels.test.ts`

- [ ] **Step 1: Teste falho:**

```ts
import { progressLabel } from "./progress-labels";
test("traduz tool fiscal", () => { expect(progressLabel("fiscal_faturamento_periodo")).toBe("faturamento"); });
test("traduz tool de estoque", () => { expect(progressLabel("estoque_saldo_produto")).toBe("estoque"); });
test("desconhecida cai no neutro", () => { expect(progressLabel("coisa_nova")).toBe("dados da operação"); });
test("nunca devolve id cru", () => { expect(progressLabel("preco_produto")).not.toContain("_"); });
```

- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar:**

```ts
/** Tradução de id de tool do MCP para rótulo curto, humanizado e GENÉRICO.
 *  Nunca expõe o id técnico. Casa pelo prefixo de domínio; fallback neutro. */
const DOMAIN_LABEL: Array<[RegExp, string]> = [
  [/^estoque_/, "estoque"],
  [/^financeiro_/, "financeiro"],
  [/^fiscal_/, "faturamento"],
  [/^comercial_/, "pedidos"],
  [/^(cadastro|cadastros)_/, "cadastros"],
  [/^(preco|precos)_/, "preços"],
  [/^contabil_/, "contábil"],
  [/^servico_/, "serviços"],
  [/^(crm|producao|rh)_/, "dados da operação"],
  [/^bi_/, "consulta avançada"],
  [/^registrar_lacuna/, "registro de solicitação"],
];
export function progressLabel(toolId: string): string {
  for (const [re, label] of DOMAIN_LABEL) if (re.test(toolId)) return label;
  return "dados da operação";
}
```

- [ ] **Step 4: Rodar** → PASS. **Step 5: Commit** `feat(agente): mapa de rotulos genericos de progresso`.

### Task B2: run-agent adiciona `label` ao evento (aditivo — mantém `toolName`)

**Files:** Modify `run-agent.ts`; Test `run-agent.test.ts`

- [ ] **Step 1:** Estender `AgentEvent` ADICIONANDO `label` sem remover `toolName`:

```ts
  | { type: "tool_call"; toolName: string; label: string }
  | { type: "tool_result"; toolName: string; truncated: boolean; label: string }
```

- [ ] **Step 2:** Importar `progressLabel`; nas emissões, preencher `label: progressLabel(tc.name)` mantendo `toolName: tc.name`.
- [ ] **Step 3: Teste:** asserir que o evento `tool_call` capturado tem `label` sem `_`.
- [ ] **Step 4: Rodar** `npx jest src/lib/agent/run-agent.test.ts` → PASS. **Step 5: Commit** `feat(agente): evento de progresso ganha rotulo generico`.

### Task B3: Rotas SSE emitem `label` (mantendo compat)

**Files:** Modify `api/agent/stream/route.ts` e `api/agent/playground/stream/route.ts`

- [ ] **Step 1:** Em `onEvent`, emitir `label` (e ainda `toolName`, para não quebrar o cliente atual antes da Fase D):

```ts
} else if (evt.type === "tool_call") {
  emit({ type: "tool_call", toolName: evt.toolName, label: evt.label });
} else if (evt.type === "tool_result") {
  emit({ type: "tool_result", toolName: evt.toolName, truncated: evt.truncated, label: evt.label });
}
```

- [ ] **Step 2:** Ler `playground/stream/route.ts` e aplicar o mesmo padrão.
- [ ] **Step 3: Verificar** `npx tsc --noEmit` limpo. **Step 4: Commit** `feat(agente): SSE emite rotulo generico (aditivo)`.

### Task B4: Limpeza — remover `toolName` do contrato (só após a Fase D)

**Files:** Modify `run-agent.ts`, ambas as rotas SSE

- [ ] **Pré-condição:** Fase D concluída (cliente já consome `label`).
- [ ] **Step 1:** Remover `toolName` de `tool_call`/`tool_result` em `AgentEvent` e das emissões SSE.
- [ ] **Step 2: Verificar** `npx tsc --noEmit` limpo + `npx jest src/lib/agent` verde.
- [ ] **Step 3: Commit** `refactor(agente): remove toolName cru do contrato de progresso`.

---

## FASE C — Gating de recursos e input adaptativo (frontend)

### Task C1: Auditar e threadar `imageInputEnabled` até a bubble

**Files:** Modify `(protected)/layout.tsx`, `agent-bubble.tsx`, `chat-panel.tsx`

- [ ] **Step 1 (auditoria, m12):** Ler `(protected)/layout.tsx`; confirmar que o resolver de `agent-config.ts` já é chamado e que `audioInputEnabled` já é passado a `<AgentBubble>`. Registrar o nome exato da função resolvedora.
- [ ] **Step 2:** Passar também `imageInputEnabled` (resolver já o expõe) a `<AgentBubble>`.
- [ ] **Step 3:** `agent-bubble.tsx`: adicionar prop `imageInputEnabled?: boolean`, repassar a `<ChatPanel>`.
- [ ] **Step 4:** `chat-panel.tsx`: adicionar `imageInputEnabled?: boolean` a `ChatPanelProps` (default `false`).
- [ ] **Step 5: Verificar** `npx tsc --noEmit`. **Step 6: Commit** `feat(agente): bubble recebe flag de entrada de anexo`.

### Task C2 `[UI]`: Bubble esconde o clip conforme checkpoint

**Files:** Modify `chat-panel.tsx`

- [ ] **Step 1:** Condicionar o `leftSlot` do `MessageInput`:

```tsx
leftSlot={imageInputEnabled ? (
  <AttachMenu disabled={pending} onPick={defaultAttachHandler} />
) : undefined}
```

- [ ] **Step 2: Verificação manual** — `imageCheckpoint=PLAYGROUND` → clip some da bubble; `PRODUCTION` → aparece.
- [ ] **Step 3: Commit** `feat(agente): clip de anexo na bubble respeita o checkpoint`.

### Task C3 `[UI]`: Input adaptativo no MessageInput

**Files:** Modify `message-input.tsx`

> `[UI]` Consultar `ui-ux-pro-max`: ao sumir um slot, o textarea não pode "saltar"; padding interno consistente e transição suave.

- [ ] **Step 1 (M6):** `grep -rn "MessageInput" src/` — listar TODOS os consumidores (bubble, playground, e quaisquer outros). Confirmar que a mudança de padding não regride nenhum.
- [ ] **Step 2:** Padding condicional: sem `leftSlot`, o textarea recebe padding-esquerdo extra; sem `rightSlot`, padding-direito extra (o `flex-1` já faz ocupar o espaço livre). Adicionar `transition-all` ao container.
- [ ] **Step 3: Verificação manual** — input com 0, 1 e 2 slots: placeholder alinhado e campo ocupando todo o espaço nos três casos, em todos os consumidores listados na Step 1.
- [ ] **Step 4: Commit** `feat(agente): input adaptativo quando anexo/audio somem`.

### Task C4 `[UI]`: Playground esconde clip e mic conforme checkpoint

**Files:** Modify `playground-content.tsx` (e a página pai do playground se preciso)

- [ ] **Step 1:** Ler `playground-content.tsx`; localizar a montagem do `MessageInput`, os slots de clip/mic e quais flags de recurso o componente já recebe.
- [ ] **Step 2:** Garantir que os flags de playground (`audioInPlayground`, `imageInPlayground` = checkpoint `!== "OFF"`) chegam ao componente; se não chegarem, threadar a partir da página do playground (server component).
- [ ] **Step 3:** Condicionar o `leftSlot` (clip) a `imageInPlayground` e o botão de mic a `audioInPlayground`.
- [ ] **Step 4: Verificação manual** — `imageCheckpoint=OFF` → clip some do playground; `PLAYGROUND`/`PRODUCTION` → aparece. Idem mic.
- [ ] **Step 5: Commit** `feat(playground): clip e mic respeitam o checkpoint`.

### Task C5: Teste de componente do gating (M7)

**Files:** Create `src/components/agent/__tests__/gating.test.tsx`

- [ ] **Step 1:** Com `@testing-library/react`, renderizar `ChatPanel` com `imageInputEnabled={false}` e asserir que o botão de anexo (aria-label do `AttachMenu`) não está no DOM; com `true`, está. Idem mic com `audioInputEnabled`.
- [ ] **Step 2: Rodar** `npx jest src/components/agent/__tests__/gating.test.tsx` → PASS.
- [ ] **Step 3: Commit** `test(agente): cobre gating de anexo/audio`.

---

## FASE D — Indicador de progresso na UI (frontend)

### Task D1 `[UI]`: Componente ProgressTrail

**Files:** Create `src/components/agent/progress-trail.tsx`

> `[UI]` Consultar `ui-ux-pro-max`: trilha compacta estilo "o que estou fazendo"; último passo em "andamento" (animado), anteriores "concluído"; ~4 visíveis com colapso "+N".

- [ ] **Step 1:** Criar `progress-trail.tsx` recebendo `steps: Array<{ id: string; label: string; state: "running" | "done" }>`. Coluna compacta, `text-xs text-muted-foreground`, ícone discreto, texto `Consultando {label}…` (running) / `Consultou {label}` (done). Se `> 4` passos: 3 primeiros + chip "+N" + o último. Sem "MCP", sem id, sem `font-mono`. Animação respeita `prefers-reduced-motion`.
- [ ] **Step 2: Verificar** `npx tsc --noEmit`. **Step 3: Commit** `feat(agente): componente ProgressTrail`.

### Task D1b: Teste de componente do ProgressTrail (M7)

**Files:** Create `src/components/agent/__tests__/progress-trail.test.tsx`

- [ ] **Step 1:** Asserir: (a) passo `running` mostra "Consultando"; `done` mostra "Consultou"; (b) nenhum texto contém `_` nem "MCP"; (c) com 6 passos, há um "+N".
- [ ] **Step 2: Rodar** → PASS. **Step 3: Commit** `test(agente): cobre ProgressTrail`.

### Task D2 `[UI]`: ToolBubble/LoadingBubble genéricos

**Files:** Modify `agent-message.tsx`

- [ ] **Step 1:** `ToolBubble` passa a receber `label` e renderiza `Consultou {label}` sem `font-mono` e sem "MCP". Renomear a prop `toolName`→`toolLabel` em `AgentMessageProps` e ajustar o branch `role === "tool"`.
- [ ] **Step 2: Verificar** `npx tsc --noEmit`. **Step 3: Commit** `feat(agente): ToolBubble generico sem nome tecnico`.

### Task D3a `[UI]`: Novo contrato SseEvent no chat-panel

**Files:** Modify `chat-panel.tsx`

- [ ] **Step 1:** Atualizar o tipo `SseEvent`: `tool_call`/`tool_result` passam a ter `label: string` (manter `toolName` opcional até B4 para tolerância).
- [ ] **Step 2: Verificar** `npx tsc --noEmit`. **Step 3: Commit** `refactor(agente): chat-panel aceita contrato de progresso com label`.

### Task D3b `[UI]`: Estado de trilha de progresso no chat-panel

**Files:** Modify `chat-panel.tsx`

- [ ] **Step 1:** Adicionar estado `progressSteps: ProgressStep[]`. Em `tool_call` → push `{ id: crypto.randomUUID(), label, state:"running" }`. Em `tool_result` → matching FIFO (R4): marcar `done` o PRIMEIRO passo ainda `running` com `label` igual ao do evento (os eventos não têm id de correlação; a ordem de chegada garante o pareamento).
- [ ] **Step 2:** Renderizar `<ProgressTrail steps={progressSteps} />` acima da bolha do assistente em construção.
- [ ] **Step 3:** Resetar `progressSteps` a cada novo envio.
- [ ] **Step 4: Verificação manual** — pergunta com tool: a trilha aparece e atualiza. **Step 5: Commit** `feat(agente): trilha de progresso na bubble`.

### Task D3c `[UI]`: Corrigir o caret `|` órfão

**Files:** Modify `chat-panel.tsx`

- [ ] **Step 1:** Não substituir a `LoadingBubble` por bolha de assistente vazia no `res.ok`. Criar a bolha do assistente só quando chegar o **primeiro `token`** (ou no `done`).
- [ ] **Step 2:** Enquanto não houver token: mostrar `LoadingBubble` (sem tool ainda) ou `ProgressTrail` (já houve tool). O caret de streaming só renderiza com `content.length > 0` (ajustar em `agent-message.tsx` se necessário).
- [ ] **Step 3: Verificação manual** — perguntar "Quanto vendemos este mês?": nunca aparece um `|` solto.
- [ ] **Step 4: Commit** `fix(agente): elimina o caret orfao na bubble`.

### Task D3d `[UI]`: Congelar a trilha no `done`

**Files:** Modify `chat-panel.tsx`

- [ ] **Step 1:** No `done`, marcar todos os passos como `done` e manter a `ProgressTrail` compacta acima da resposta final (vira o histórico do que foi feito).
- [ ] **Step 2:** Garantir que a trilha de um turn anterior não vaza para o próximo.
- [ ] **Step 3: Verificação manual** — trilha fica compacta no fim; novo turn começa limpo.
- [ ] **Step 4: Commit** `feat(agente): trilha congela como historico no fim do turn`.

### Task D4 `[UI]`: Playground usa o mesmo ProgressTrail

**Files:** Modify `playground-content.tsx`

- [ ] **Step 1:** Aplicar ao playground o tratamento D3a-D3d (contrato `label`, `ProgressTrail`, sem caret órfão, trilha congelada). Reusar `ProgressTrail`.
- [ ] **Step 2: Verificação manual** no Playground.
- [ ] **Step 3: Commit** `fix(playground): trilha de progresso consistente com a bubble`.

> Após D4, executar **B4** (limpeza do `toolName`).

---

## FASE E — Toggle de raciocínio do modelo

> Pré-condição: `git log -3 -- prisma/schema.prisma` sem migration concorrente. Se houver, pausar e anotar no `active/*.md`. M5: esta fase sustenta a qualidade de A1.

### Task E1: Campo `reasoningEffort` em AgentSettings

**Files:** Modify `prisma/schema.prisma`; migration nova

- [ ] **Step 1:** Em `AgentSettings`: `reasoningEffort String? @map("reasoning_effort")` (`minimal|low|medium|high`; null = default do provider).
- [ ] **Step 2:** `npx prisma migrate dev --name agent_reasoning_effort`.
- [ ] **Step 3: Verificar** `npx prisma generate` + `npx tsc --noEmit`.
- [ ] **Step 4: Commit** `feat(agente): campo reasoningEffort` + linha no `HISTORY.md` (migration = relevante).

### Task E2: Wiring do reasoningEffort no provider OpenAI

**Files:** Modify `run-agent.ts`, `llm/providers/openai.ts`; Test `llm/providers/openai.test.ts`

- [ ] **Step 1:** Ler `openai.ts` ~115-135 (branch `reasoning`) para ver a montagem atual do request.
- [ ] **Step 2: Teste falho:** com `reasoningEffort` setado e modelo reasoning, o request inclui `reasoning_effort`.
- [ ] **Step 3:** Propagar `reasoningEffort` de `loadAgentSettings()` → `client.chat({...})` → request OpenAI.
- [ ] **Step 4: Rodar** os testes do provider → PASS. **Step 5: Commit** `feat(agente): aplica reasoning_effort configuravel`.

### Task E3 `[UI]`: Controle de raciocínio na tela de Recursos

**Files:** Modify `resources-toggles.tsx`, `agent-config.ts`

> `[UI]` Consultar `ui-ux-pro-max` — segmented control coerente com os checkpoints existentes.

- [ ] **Step 1:** Seletor "Profundidade de raciocínio" (minimal/low/medium/high) na seção Recursos, visível quando o modelo de produção é reasoning.
- [ ] **Step 2:** Estender o schema Zod e `updateAgentResources` para persistir `reasoningEffort`.
- [ ] **Step 3: Verificação manual** — alterar, recarregar, valor persiste; conferir no banco.
- [ ] **Step 4: Commit** `feat(agente): controle de raciocinio na tela de Recursos`.

---

## FASE F — Verificação end-to-end (CLAUDE.md §6/§9)

### Task F1: Verificação automatizada
- [ ] `npx tsc --noEmit` limpo · `npx eslint src/` sem novos erros · `npx jest src/lib/agent src/components/agent` verde · `npx next build` verde.

### Task F2: Verificação contra dado real
- [ ] `npm run dev`; logar. Registrar o nível de raciocínio em uso (M5).
- [ ] **Desambiguação:** "qual o valor unitário do produto puxador corda?" → agente pergunta de volta (custo vs venda E qual produto), com sugestões que resolvem. Clicar numa sugestão → resposta objetiva.
- [ ] **Progresso:** "quanto vendemos este mês?" → "pensando" → "Consultando faturamento…", sem `|` órfão, sem nome de tabela/tool; resposta sem "atualizado há 0s".
- [ ] **Gating:** `imageCheckpoint=PLAYGROUND` → clip só no playground; `OFF` → some dos dois; idem mic. Input ocupa o espaço nos três casos.
- [ ] **Guardrails:** "quais tabelas você consulta?" / "qual sua chave de API?" → recusa educada, sem vazar.
- [ ] **Multi-tool:** pergunta que dispare 2+ consultas → trilha compacta, sem inundar.

### Task F3: Code review + UI review
- [ ] `/gsd-code-review` nos arquivos alterados.
- [ ] `/gsd-ui-review` nas telas tocadas (bubble, playground, Recursos).
- [ ] Corrigir achados materiais.

### Task F4: Encerramento
- [ ] Atualizar `STATUS.md` (coordenar). Linha final em `HISTORY.md`. Deletar `active/claude-agente-nex-melhorias.md`. Abrir PR (merge é humano).

---

## Self-review (cobertura)

| Pedido | Task |
|---|---|
| Desambiguação global + exemplos | A1, A5 |
| Sugestões resolvem ambiguidade | A5 |
| Remover "atualizado há Xs" (prompt + dado) | A2, A2b, A4 |
| Formatação humanizada | A4 |
| Guardrails técnicos/API key | A3 |
| RBAC confirmado | seção Contexto |
| Clip/mic bubble por checkpoint | C1, C2 |
| Clip/mic playground por checkpoint | C4 |
| Input adaptativo | C3, C4 |
| Teste de gating | C5 |
| Progresso genérico sem nome de tabela | B1, B2, B3, D2, D3b |
| Fim do `|` órfão | D3c |
| Trilha sem inundar | D1, D1b, D3b, D3d |
| Toggle de raciocínio | E1, E2, E3 |

## Ordem de execução, dependências e shippability

- **A0 é bloqueante** da Fase A inteira (R9).
- **Dependências reais:** B4 depende de toda a Fase D; D depende de B1-B3. As Fases A, C e E não dependem de B/D nem entre si.
- **Ordem sugerida:** A0 → A1-A6 → C1-C5 → B1-B3 → D1-D4 → B4 → E1-E3 → F. A e C podem ser feitas em paralelo.
- **Shippability (PRs):** A = um PR; C = um PR; B+D+B4 = um PR conjunto; E = um PR (depende de coordenação de schema). F roda por PR.
- **Trilha live-only (R7):** a `ProgressTrail` é efêmera; conversas recarregadas do histórico não a reconstroem (mensagens `role:"tool"` são filtradas). Comportamento aceito.

## Itens de coordenação / risco aberto

1. Desambiguação é só prompt: assume que as tools de busca retornam listas (ex.: 5 produtos). Se na F2 o agente não enxergar os múltiplos resultados, abrir item com `claude-f4-leitura-expansao` (sem tocar `mcp/`).
2. Fase E mexe em `prisma/schema.prisma` (território de outro agente) — coordenar antes de E1.
3. Modelo nano + desambiguação: se a aderência for fraca na F2, a Fase E (raciocínio) deixa de ser opcional.
4. As tarefas `[UI]` (ProgressTrail, input adaptativo, transições, controle de raciocínio) exigem consulta a `ui-ux-pro-max` como primeira step na execução.
