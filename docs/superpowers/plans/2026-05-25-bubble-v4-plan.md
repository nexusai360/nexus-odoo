# Plano - Bubble v4

Spec: `docs/superpowers/specs/2026-05-25-bubble-v4-spec.md` (v3)

## Bloco A - Auto-scroll v4 (stick-to-bottom)

Arquivo: `src/components/agent/chat-panel.tsx`

### A1. Remover toda a logica de snap-to-top atual
- Remover: `initialSnappedIdRef`, `lastStreamSnapTsRef`,
  `snapBubbleTopToViewport`, `snapWritingPointNearTop`,
  `programmaticScrollTo`.
- Remover useEffect de snap inicial (deps lastAssistantId).
- Remover useEffect de re-snap streaming.
- Remover useEffect de listeners wheel/touch/scroll (ou simplificar).
- Manter: messageRefsMap (pode reutilizar) e isProgrammaticScrollRef.

### A2. Adicionar logica stick-to-bottom
- Estado: `isSticky` (true inicial).
- Ref: `contentRef` no inner div `<div className="space-y-3">`.
- useEffect (unico, deps []):
  - ResizeObserver no contentRef.current.
  - Quando dispara: se `isStickyRef.current`, scroll container scrollTop =
    scrollHeight.
  - addEventListener wheel: deltaY < 0 -> setIsSticky(false), unless
    just programmaticScroll (100ms window).
  - addEventListener scroll: se atBottom (within 24px), setIsSticky(true).
  - cleanup remove tudo.
- Ref espelho `isStickyRef` para callbacks dentro de RO.
- handleSend: setIsSticky(true).

### A3. FAB
- Visivel quando `!isSticky && messages.length > 0`.
- Click: scroll para fim + setIsSticky(true).
- Position class: `bottom-[88px] right-3`.

### A4. Remover logs de debug do commit anterior

### A5. tsc verde

### A6. Commit A: "fix(nex-bubble): auto-scroll padrao stick-to-bottom + FAB respiro"

## Bloco B - Two-pass LLM

Arquivos:
- `src/lib/agent/enhance-chips.ts` (novo)
- `src/lib/agent/run-agent.ts`

### B1. Criar enhance-chips.ts
- Export: `enhanceWithChips(message, recentHistory, llmClient, maxContextual)`
- Constroi prompt do analista
- Chama llmClient.chat({stream:false, tools:undefined})
- Parse JSON da resposta
- Validacoes:
  - chips array nao vazio
  - cada chip <= 80 chars
  - chipsSource em {"extracted","contextual"}
  - cap segundo chipsSource (7 ou maxContextual)
- Return {cleanMessage, chips, chipsSource}
- Timeout via Promise.race + AbortController (5s)
- Try/catch geral - se qualquer falha, throw EnhanceChipsError

### B2. Integrar no run-agent.ts
- Apos result.ok com message:
  - Verificar source: pular se whatsapp/playground.
  - Tentar enhanceWithChips(message, last5Messages, client,
    agentSettings.maxSuggestions).
  - Em sucesso: usar cleanMessage + chips no return.
  - Em falha: fallback para extractSuggestions(message,
    agentSettings.maxSuggestions).

### B3. Tests
- Novo `src/lib/agent/enhance-chips.test.ts`
- Mock LLM client devolvendo JSONs validos/invalidos
- Testar: extracted path, contextual path, JSON invalido, timeout

### B4. tsc + jest

### B5. Commit B: "feat(agent): two-pass LLM para chips extraidos do corpo"

## Bloco C - Verificacao final

### C1. restart dev limpo
- kill + rm .next + nohup npm run dev

### C2. Smoke A (auto-scroll)
- Janela anonima, abrir bubble
- Pergunta longa - ver bolha acompanhar conforme cresce
- Rolar pra cima - ver FAB com respiro
- Click FAB - volta pro fim

### C3. Smoke B (two-pass)
- Pergunta "Notas fiscais emitidas em 05/2026"
- Verificar: cleanMessage SEM bullets
- Chips: ate 7 com cada opcao da pergunta

### C4. Push

## Ordem
1. A1-A6 (auto-scroll + FAB) - frontend isolado.
2. B1-B5 (two-pass) - backend.
3. C1-C4 (verify).

A pode ir primeiro porque e o pedido mais urgente do usuario.

---

## Plan review #1 -> v2 (lacunas)

- **L1**: enhance-chips usa o MESMO client ja criado em runAgent (linha
  ~290 buildLlmClient). Recebe-o como arg para evitar criar 2 clients.
- **L2**: Cap extracted = 7 hard-coded. maxContextual vem do
  agentSettings.maxSuggestions. Constantes em enhance-chips.ts.
- **L3**: Pass 2 prompt em portugues. JSON output com chaves em ingles
  (cleanMessage, chips, chipsSource) para ser robusto a sanitizacao.
- **L4**: Timeout 3.5s (era 5s). Se passa, abort + fallback.
- **L5**: Mesmo modelo do Pass 1 (simples; pode ser otimizado futuro).
- **L6**: enhance-chips PURO sem prisma. Recebe client + history. Tests
  com mock client.
- **L7**: SSE done event ja envia message + suggestions. Sem mudancas
  no contrato.
- **L8**: Persistencia: o cleanMessage e salvo via persistMessage no
  fim do runAgent (ja existente).

---

## Plan review #2 -> v3 (granularidade)

- **G1**: A1 "Remover toda logica" - quebrar:
  - A1a: Remover initialSnappedIdRef + lastStreamSnapTsRef refs.
  - A1b: Remover helpers snap*.
  - A1c: Remover useEffects 1, 2, 3 (snap-init, snap-stream, listeners).
  - A1d: Remover logs console.info do commit 37ab583.
- **G2**: A2 "Adicionar logica stick-to-bottom" - quebrar:
  - A2a: Adicionar state isSticky + ref isStickyRef.
  - A2b: Adicionar contentRef + ref no inner div.
  - A2c: useEffect com ResizeObserver + wheel + scroll.
  - A2d: handleSend setIsSticky(true).
- **G3**: B1 "Criar enhance-chips.ts" - quebrar:
  - B1a: Tipos + constantes.
  - B1b: buildEnhancePrompt(message, history).
  - B1c: parseEnhanceResponse(raw, caps).
  - B1d: enhanceWithChips orquestrador.
- **G4**: B2 "Integrar no run-agent" - quebrar:
  - B2a: import enhance-chips.
  - B2b: helper getRecentHistoryForChips.
  - B2c: tryEnhanceChips wrapper com fallback.
  - B2d: chamar no result.ok path.

### Criterio de saida v3
- Cada task <= 25 linhas alteradas. Cada commit pequeno e revertable.
- Implementacao sem placeholders. Verificavel.

### Riscos
- R1: cleanMessage corta texto que o usuario queria ver. Mitigacao:
  apenas REMOVER bullets-perguntas, nao reescrever resto.
- R2: Pass 2 demora -> latencia. Mitigacao: timeout 3.5s + skip se
  source playground.
- R3: Custo. ~$0.0001/turno. Aceitavel.
- R4: Agente paralelo modifica run-agent.ts. Mitigacao: verificar
  active/ + HISTORY antes de cada commit.
