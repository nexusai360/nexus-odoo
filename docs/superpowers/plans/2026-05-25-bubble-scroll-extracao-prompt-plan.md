# Plano — 3 features da bubble (scroll + extracao + prompt)

Spec: `docs/superpowers/specs/2026-05-25-bubble-scroll-extracao-prompt-spec.md`
Branch: `feat/f4-leitura-expansao`

## F1 — Auto-scroll + FAB

**Arquivo:** `src/components/agent/chat-panel.tsx`

### Task F1.1 — Estado e refs do auto-scroll
- Adicionar `const [userScrolledAway, setUserScrolledAway] = useState(false)`
- Adicionar `const isProgrammaticScrollRef = useRef(false)`
- Adicionar `const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())`
- Substituir o useEffect de auto-scroll atual (linhas 197-205) por:
  - Quando `messagesCount` aumenta E `userScrolledAway === false`:
    - Identificar a ultima msg do assistant
    - Set `isProgrammaticScrollRef.current = true`
    - Chamar `el.scrollIntoView({ block: 'start', behavior: 'smooth' })`
    - Set timeout 600ms pra resetar `isProgrammaticScrollRef.current = false`

### Task F1.2 — Handler de scroll do usuario
- onScroll no scrollRef: se `isProgrammaticScrollRef.current === false`,
  detecta intencao do usuario. Mas scroll event tambem dispara em
  programatico — usar a flag.
- onWheel `e.deltaY < 0` ou onTouchMove negativo: setUserScrolledAway(true).
  Mais confiavel que scroll event.
- Quando usuario chega ao fim manualmente (scrollTop + clientHeight >= scrollHeight - 16),
  setUserScrolledAway(false) (reativa auto-scroll).

### Task F1.3 — ResizeObserver pra re-snap durante streaming
- Observer na bolha do ultimo assistant enquanto `streaming===true`
- Em cada resize: se bubble top > 0 && bubble bottom > viewport bottom &&
  !userScrolledAway, re-snap.
- Debounce 80ms via ref.

### Task F1.4 — FAB scroll-to-bottom
- Componente `<ScrollToBottomFab onClick={...} visible={userScrolledAway} />`
- Position absolute, bottom-20 right-3 (acima da input), violet, chevron-down.
- Clicar: `el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })` +
  setUserScrolledAway(false).

### Task F1.5 — Wrapper div com ref por message
- Trocar `<React.Fragment key={m.id}>` por `<div key={m.id} ref={(el) => {...}}>`
- Cuidar pra nao quebrar layout (era Fragment porque tinha varios filhos).
  Solucao: o div pega o conteudo, layout fica espacejado via space-y-3.

### Task F1.6 — Reset no handleSend
- No inicio de `handleSend`: `setUserScrolledAway(false)`

## F2 — Extracao de bullet-perguntas

**Arquivo:** `src/lib/agent/run-agent.ts`

### Task F2.1 — Bump MAX_SUGGESTIONS = 7
- Linha 58: `const MAX_SUGGESTIONS = 7;` (era 5).
- Verificar se outros lugares dependem do 5; se sim, atualizar.

### Task F2.2 — Funcao extractBulletQuestions
- Adicionar funcao privada que recebe `text` e retorna `{ message, bullets[] }`
- Regex trailing bullets apos pergunta — vide spec.
- Sanitizacao igual a do canal `[[suggestions]]`.

### Task F2.3 — Plugar em extractSuggestions
- Apos o caminho do regex `[[suggestions]]` (match found):
  - Se as suggestions extraidas > 0 e o `message` restante ainda tem
    bullets-perguntas trailing, NAO faz extra (modelo decidiu via canal).
- Se nao tem `[[suggestions]]` (fallback path):
  - Tenta `extractBulletQuestions`. Se >= 2 bullets, usa eles como
    suggestions, message vira o resto. Caso contrario, fallback original.

### Task F2.4 — Tests
- Novo arquivo `src/lib/agent/run-agent.extract-bullets.test.ts`
- Cases: (a) bullets apos "?", (b) bullets sem "?", (c) >7 bullets cap,
  (d) bullets de dados (nao perguntas) — nao extrair.

## F3 — Prompt quantitativo

**Arquivo:** `src/lib/agent/prompt/identity-base.ts`

### Task F3.1 — Adicionar secao apos "Formato de resposta"
- Texto novo intitulado "## Resultados grandes — sempre traga quantitativo"
- Conteudo: trigger, acao, exemplo positivo, exemplo negativo (vide spec).

## Verificacao

### Task V.1 — tsc + eslint
- `npx tsc --noEmit -p tsconfig.json`
- `npx eslint src/components/agent/chat-panel.tsx src/lib/agent/run-agent.ts src/lib/agent/prompt/identity-base.ts`

### Task V.2 — Jest tests F2
- `npx jest src/lib/agent/run-agent.extract-bullets.test.ts`

### Task V.3 — Restart dev server
- killall node 2>/dev/null (se houver zumbi)
- rm -rf .next
- nohup npm run dev &
- Verificar Ready em http://localhost:3000

### Task V.4 — Smoke manual
- Pergunta longa pra ver snap-to-top + FAB.
- Pergunta "notas fiscais emitidas em 05/2026" pra ver quantitativo + chips.

## Commits

- Commit A: F2 (run-agent extracao + tests + bump 7)
- Commit B: F3 (identity-base directive)
- Commit C: F1 (chat-panel auto-scroll + FAB)

Ordem: A e B nao tocam UI, podem ir primeiro (menos arriscado). C e a
maior mudanca de chat-panel, vai por ultimo.

## Riscos
- F1: ResizeObserver + smooth scroll + user wheel detection — tem 3
  fontes de evento competindo. Mitigacao: flags + debounces.
- F2: false positives podem strippar bullets legitimos. Mitigacao: regex
  estrita exigindo "?" precedente E minimo 2 bullets.
- F3: prompt mal formulado pode confundir o modelo. Mitigacao: exemplo
  positivo + negativo claros.
