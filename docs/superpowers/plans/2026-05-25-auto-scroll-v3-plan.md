# Plano — Auto-scroll v3 + Diretiva quantitativa (v1)

Spec: `docs/superpowers/specs/2026-05-25-auto-scroll-v3-spec.md`

## A. Diretiva quantitativa em compose.ts

### A1. Append da diretiva em compose.ts
- Arquivo: `src/lib/agent/prompt/compose.ts`
- Local: apos o `parts.push("\n\n## Comportamento" + ...)` (linha
  ~95-100), antes da branch `if (source === "suggestion")`.
- Adicionar nova `parts.push` com bloco:
  ```
  \n\n## REGRA OBRIGATORIA: Resultados grandes -> sempre traga quantitativo
  Quando uma ferramenta retorna muitos registros (truncado, ou cobre varios status/situacoes/categorias), faca SEMPRE assim:
  1. Agrupe os registros pela dimensao natural que os diferencia (status, situacao, categoria, mes, conta, tipo).
  2. Traga a CONTAGEM por grupo + TOTAL. Quando fizer sentido, traga tambem o VALOR AGREGADO (soma de R$).
  3. Apos o quantitativo, ofereca drill-down nas sugestoes de pergunta (canal apropriado do contexto). Cada sugestao e uma pergunta concreta que abriria UMA fatia.

  EXEMPLO CORRETO:
  "Em 05/2026 constam 234 notas fiscais: 152 autorizadas, 41 em digitacao, 28 rejeitadas e 13 inutilizadas. Total faturado nas autorizadas: R$ 35.421.925,20."

  PROIBIDO (NAO faca nunca):
  "Encontrei X notas. Qual visao voce quer? - Somente autorizadas - Todas"

  Por que: o usuario espera inteligencia. Quando voce devolve uma pergunta em vez da informacao, vira ping-pong inutil. Quantitativo + drill-down resolve em UMA so ida e volta.
  ```

### A2. Test no compose.test.ts
- Arquivo: `src/lib/agent/prompt/compose.test.ts`
- Adicionar `test("bloco Resultados grandes obriga quantitativo", ...)`:
  - `expect(out).toContain("Resultados grandes")`
  - `expect(out).toContain("Qual visao voce quer")` ← PROIBIDO label (parte do exemplo proibido aparece)
  - `expect(out).toContain("CONTAGEM por grupo")`

### A3. Validar tsc + run jest da compose.test.ts
- `npx tsc --noEmit -p tsconfig.json`
- `npx jest src/lib/agent/prompt/compose.test.ts`

## B. Auto-scroll v3 em chat-panel.tsx

### B1. Remover estado/refs obsoletos
- Arquivo: `src/components/agent/chat-panel.tsx`
- Trocar `initialSnappedRef` de tipo logico (chave-id mapeada por
  msgId) por `useRef<string | null>(null)` (single id atual).

### B2. Helper programmaticScrollTo respeitando reduced-motion
- Importar `useReducedMotion` ja usado em outros arquivos.
- Refator: programmaticScrollTo aceita opcional `behavior`. Default
  'smooth' quando !reduce, 'auto' quando reduce.

### B3. Snap inicial (limpar e re-escrever)
- useEffect dep [lastAssistantId, messagesCount]:
  - Se initialSnappedRef.current === lastAssistantId, skip.
  - Se userScrolledAway, skip.
  - rAF: snapBubbleTopToViewportTop com 8px padding.
  - Update initialSnappedRef.current = lastAssistantId.

### B4. Re-snap durante streaming
- useEffect dep [lastAssistantStreaming, lastAssistantId, userScrolledAway]:
- setInterval(250ms):
  - Bypass se userScrolledAway, isProgrammaticScrollRef ativo,
    ou (now - lastStreamSnapTsRef) < 700.
  - Get bubble e scrollEl Rects.
  - Trigger: bRect.bottom > sRect.bottom - 80.
  - Acao: targetScrollTop = scrollEl.scrollTop + (bRect.bottom - sRect.top) - 60.
  - Update lastStreamSnapTsRef.current = now.
  - programmaticScrollTo(Math.max(0, target)).
- Cleanup: clearInterval.

### B5. Listeners de user scroll intent
- useEffect (uma vez):
- wheel deltaY < 0 -> setUserScrolledAway(true).
- touchstart captura Y; touchmove se y - startY > 8 -> setUserScrolledAway(true).
- scroll: se !isProgrammaticScrollRef E
  scrollHeight - clientHeight - scrollTop < 32 -> setUserScrolledAway(false).
- Cleanup remove todos.

### B6. handleSend reset
- ja feito no commit anterior; verificar que continua.

### B7. FAB component visivel/oculto
- ja feito no commit anterior; verificar funcionamento.

### B8. Verificacao tsc
- `npx tsc --noEmit -p tsconfig.json`.

## C. Restart dev + smoke

### C1. Kill stale processes
- `pkill -f "next dev"; pkill -f "next-server"`
- `rm -rf .next`
- `nohup npm run dev &`

### C2. Smoke auto-scroll
- Janela anonima, abrir bubble, fazer pergunta longa.
- Verificar snap inicial visualmente.
- Verificar re-snap durante streaming.
- Wheel up no meio -> ver auto-snap pausar + FAB aparecer.
- Click FAB -> rola pro fim + reativa.

### C3. Smoke diretiva
- Pergunta: "Notas fiscais emitidas em 05/2026" (mesma que falhou).
- Verificar:
  - NAO contem "qual visao voce quer".
  - Contem contagem por situacao.
  - Contem chips com drill-down.

## D. Commits
1. Commit A: compose.ts + compose.test.ts (diretiva).
2. Commit B: chat-panel.tsx (auto-scroll v3).
3. Push.

## Riscos / mitigacoes
- R1: typewriter ainda revelando ao snapar -> nao interfere; chars
  continuam aparecendo apos scrollTo.
- R2: snap dispara durante crescimento da bubble por causa de header
  morph (trail collapse) -> trail collapse tem 280-550ms; pode
  coincidir com 1o snap. Trigger so dispara se bbubble.bottom passar
  threshold; trail collapse REDUZ altura da bolha, nao cresce. Sem
  risco.
- R3: 2 agentes commitando em paralelo no chat-panel.tsx -> verificar
  active/ antes de cada edit.

---

## Plan review #1 -> v2 (lacunas e ordem)

### Lacunas identificadas
- **L1**: B3 fala "snapBubbleTopToViewportTop" - nao defini essa
  helper. Adicionar B2.5: criar helper que recebe msgId e faz o
  calculo da targetScrollTop pro INITIAL snap (bubble.offsetTop - 8).
- **L2**: B4 nao fala em rAF antes do calculo do bRect/sRect. Se
  setInterval dispara entre frames, getBoundingClientRect pode pegar
  layout intermediario. Adicionar rAF wrap dentro do callback do
  interval.
- **L3**: Listener de scroll em B5 - se isProgrammaticScrollRef esta
  ativo (smooth scroll programatico em andamento), o handler vai
  ignorar o "no fim" check tambem? Sim, e isso pode impedir o reset
  natural. Fix: split em 2 handlers - "user scroll" (wheel/touch) e
  "any scroll" (reset no fim). O reset no fim NAO pode ignorar
  isProgrammaticScrollRef.

  Decisao: scroll listener checa scrollHeight - clientHeight -
  scrollTop < 32. Se sim, setUserScrolledAway(false). Sem checar a
  flag programatica. Razao: ao chegar no fim manualmente OU
  programaticamente (FAB click), o usuario quer reativar.

- **L4**: Onde fica o ScrollToBottomFab? Ja esta no parent do scrollRef
  (relative div). Ja feito.
- **L5**: Reduced-motion para entrada/saida do FAB - se nao queremos
  transicoes, FAB usa display: none em vez de opacity:0. Spec diz
  "FAB sem transition". Aplicar: className condicional.

### Premissas a confirmar
- **P1**: messageRefsMap permanece valido apos remount de bubbles?
  Sim: ref callback dispara em mount/unmount, mantemos sincronizado.
- **P2**: lastAssistantId estavel entre renders consecutivos?
  Sim: messages.length so muda em setMessages; useMemo dep ok.

### Ordem ajustada
1. A1, A2, A3 (compose + test)
2. B1-B7 (chat-panel)
3. B8 tsc
4. C1 restart
5. C2, C3 smoke
6. D commits

Mudanca: nao alterar ordem original. Pode-se commitar A antes de B
porque sao arquivos independentes - PROs: rollback granular.
CONs: 2 push para o mesmo branch quase consecutivos. Acerto: 1 push
no fim, mas 2 commits separados.

---

## Plan review #2 -> v3 (granularidade + integracao)

### Tasks reorganizadas por arquivo (1 task = 1 arquivo + 1 unidade)

#### Bloco A: compose.ts + test
- **A1**: edit compose.ts - inserir bloco "REGRA OBRIGATORIA" apos
  parts.push do Comportamento. 1 chamada parts.push nova.
- **A2**: edit compose.test.ts - 1 novo teste verificando 3 assertions
  (toContain "Resultados grandes", "CONTAGEM por grupo", e validacao
  do bloco). Atualiza count 24 -> 25 se houver.
- **A3**: rodar `npx jest compose.test.ts` - deve passar todos.
- **A4**: rodar `npx tsc --noEmit -p tsconfig.json` - verde.
- **A5**: commit A: "feat(prompt): regra obrigatoria de quantitativo no
  compose (override identity_base)".

#### Bloco B: chat-panel.tsx (auto-scroll v3)
- **B1**: import useReducedMotion.
- **B2**: substituir `initialSnappedRef` (Map) por
  `useRef<string|null>(null)`.
- **B3**: criar helper `programmaticScrollTo(top, opts?)` - aceita
  `{ behavior?: ScrollBehavior }`. Default: smooth ou auto baseado
  em useReducedMotion.
- **B4**: criar helper `snapBubbleTopToViewport(msgId)` - calcula
  targetScrollTop = bubble.offsetTop - 8; chama programmaticScrollTo.
- **B5**: criar helper `snapWritingPointNearTop(msgId)` - calcula
  targetScrollTop tal que bubble.bottom fique a 60px do scrollEl.top.
  Clamp em Math.max(0).
- **B6**: useEffect snap inicial - dep [lastAssistantId, messagesCount,
  userScrolledAway].
- **B7**: useEffect re-snap streaming - setInterval(250ms) com
  throttle 700ms. dep [lastAssistantStreaming, lastAssistantId,
  userScrolledAway]. Cleanup clearInterval.
- **B8**: useEffect listeners - wheel/touch/scroll. dep []. Cleanup
  removeEventListener.
- **B9**: rodar tsc verde.
- **B10**: commit B: "fix(nex-bubble): auto-scroll v3 com snap-to-
  writing-point durante streaming".

#### Bloco C: verificacao
- **C1**: pkill + rm .next + nohup npm run dev.
- **C2**: smoke manual: pergunta longa, observar snap.
- **C3**: smoke prompt: pergunta de NFs, observar quantitativo.
- **C4**: push para origin.

### Criterio de saida v3
- Cada task acima e completable isoladamente. Nenhuma task contem
  mais de 1 unidade. Nenhuma task usa palavras vagas como "ajustar"
  ou "adaptar"; todas tem verbo concreto + alvo.
- Cada task <= 30 linhas de codigo aproximadamente. Limite mental
  para nao escorregar em epicos.
- Ordem rigida: A antes de B. B antes de C.

### Itens nao testaveis e como mitigar
- Auto-scroll heavily DOM-dependent; sem jest unit. Mitigacao:
  smoke manual obrigatorio + log inicial console em dev (debug).
- LLM behavior: smoke real contra dado real para verificar prompt
  funcionou.
