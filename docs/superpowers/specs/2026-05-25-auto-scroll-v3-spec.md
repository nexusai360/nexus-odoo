# Spec — Auto-scroll v3 + Diretiva quantitativa robusta (v1)

Data: 2026-05-25 04:50
Autor: claude-nex-bubble-storytelling
Status: v1 (rascunho)

## Contexto

Auto-scroll v2 (commit a952b21) entregou bugs reportados pelo usuario:
"trava do nada, sobe ou desce a tela sem motivo". A diretiva
quantitativa (commit a69f6df) NAO chegou ao LLM porque o
`agent_settings.identity_base` do banco (8601 chars custom) sobrescreve
o default do codigo. Precisamos refazer ambos.

## Requisitos (verbatim, com glossario)

### Auto-scroll
- "vai subindo a tela, acompanhando a digitacao, como se a pessoa
  estivesse lendo" -> auto-scroll acompanha o ponto de escrita.
- "ao identificar que a bolha de mensagem ja esta bem proximo ao
  final da tela" -> trigger zone: bolha.bottom proximo ao viewport.bottom.
- "voce da uma scrollada para cima, uma vez so, bota ela mais no topo"
  -> snap UNICO quando trigger dispara; nao continua scrollando.
- "voce joga a mensagem para o topo e vem acompanhando" -> apos snap,
  o "ponto de escrita" (bubble.bottom corrente) fica perto do topo do
  viewport, deixando espaco abaixo para o texto novo aparecer.
- "se isso acontecer de novo, ele estiver proximo do final, voce joga
  mais uma vez para o topo" -> trigger pode disparar varias vezes
  durante o streaming.
- "se o usuario mexer na scrollagem da tela... voce automaticamente
  desativa esse comportamento" -> wheel up / touchmove down do user
  pausa auto-snap pelo turno.
- "se eu estiver rolando a tela la pra cima e sair da sessao, ele
  precisa aparecer um botaozinho... uma setinha pra baixo, pra que eu
  clique e ele me leva pro final" -> FAB visivel quando NAO esta no
  fim; click rola pro fim e reativa auto-scroll.

**Glossario:**
- **bolha**: container div da mensagem do assistant.
- **ponto de escrita**: bubble.bottom no momento corrente.
- **viewport**: scroll container do chat (scrollRef).
- **snap**: scrollTo({behavior: smooth}).

### Diretiva quantitativa
- "trazer ja o quantitativo" -> contagem por categoria/situacao + total.
- "nao tem que ficar respondendo uma pergunta" -> NUNCA pedir "qual
  visao voce quer?".
- "se nao deu pra trazer tudo, traz um quantitativo, traz uma
  informacao relevante que engloba tudo" -> mesmo quando truncado,
  agregar e devolver.
- "voce ja sugere uma pergunta mais inteligente" -> chips de drill-down.

## Behavior

### Auto-scroll

**Estados:**
- `userScrolledAway: boolean` (state) - true depois de wheel up / touchmove down.
- `initialSnappedRef: Map<msgId, boolean>` - garante 1 snap inicial por msg.
- `lastStreamSnapTsRef: number` - timestamp do ultimo snap durante streaming.

**Snap inicial:**
- Trigger: lastAssistantId muda (novo turno).
- Acao: scroll bubble.top para viewport.top - 8px (com smooth).
- Guarda: nao re-disparar para o mesmo msgId.

**Re-snap durante streaming (acompanha ponto de escrita):**
- Loop: setInterval(250ms) enquanto streaming ativo.
- Bypass: userScrolledAway === true OU isProgrammaticScrollRef === true
  OU now - lastStreamSnapTsRef < 700ms.
- Trigger: bubble.bottom > viewport.bottom - 80px (zona de "perto do fim").
- Acao: scrollTo(targetScrollTop) onde targetScrollTop coloca o
  bubble.bottom (== ponto de escrita) a 60px do TOPO do viewport.
  Isso deixa 60px de respiro acima e o resto do viewport abaixo para
  o texto continuar aparecendo.

**Detector scroll do usuario:**
- onWheel deltaY < 0 -> setUserScrolledAway(true).
- onTouchStart captura Y; onTouchMove se Y - startY > 8px (dedo
  descendo, conteudo rolando pra cima) -> setUserScrolledAway(true).
- onScroll: se scrollHeight - clientHeight - scrollTop < 24px (no fim)
  E NAO programatico -> setUserScrolledAway(false).

**Reset automatico:**
- handleSend (nova msg) -> setUserScrolledAway(false).

**FAB:**
- Visivel quando: userScrolledAway === true E nao esta no welcome.
- Posicao: absolute bottom-3 right-3 do parent do scrollRef.
- Estilo: rounded-full violet, ChevronDown 16x16, glow sutil.
- Click: programmaticScrollTo(scrollHeight) + setUserScrolledAway(false).
- Animacao entrada/saida: opacity + translateY 8px, 200ms ease-out.

### Diretiva quantitativa

**Compose pipeline:**
- `compose.ts:composeSystemPrompt` recebe identity_base (do DB ou
  default). Apos o bloco de identidade, anexar uma secao fixa que
  SEMPRE roda, independente do identity_base configurado.

**Texto da diretiva (em portugues, autoritario):**
```
## REGRA OBRIGATORIA: Resultados grandes -> sempre traga quantitativo

Quando uma ferramenta retorna muitos registros (truncado, ou cobre
varios status/situacoes/categorias), faca SEMPRE assim:

1. Agrupe os registros pela dimensao natural que os diferencia (status,
   situacao, categoria, mes, conta, tipo).
2. Traga a CONTAGEM por grupo + TOTAL. Quando fizer sentido, traga
   tambem o VALOR AGREGADO (soma de R$).
3. Apos o quantitativo, ofereca drill-down via [[suggestions]]. Cada
   chip e uma pergunta concreta que abriria UMA fatia.

EXEMPLO CORRETO (faca assim):
"Em 05/2026 constam 234 notas fiscais: 152 autorizadas, 41 em
digitacao, 28 rejeitadas e 13 inutilizadas. Total faturado nas
autorizadas: R$ 35.421.925,20."
[[suggestions]]:Liste as 152 autorizadas|Mostre as 28 rejeitadas|...

PROIBIDO (NAO faca nunca):
"Encontrei X notas. Qual visao voce quer?
- Somente autorizadas
- Todas"

Por que: o usuario espera inteligencia. Quando voce devolve uma
pergunta em vez da informacao, vira ping-pong inutil. Quantitativo +
drill-down resolve em UMA so ida e volta.
```

## Arquivos a tocar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/agent/chat-panel.tsx` | Auto-scroll v3 |
| `src/lib/agent/prompt/compose.ts` | Append diretiva quantitativa |

## Verificacao

1. tsc + eslint verdes.
2. Restart dev limpo (kill + rm .next + npm run dev).
3. Smoke teste manual: pergunta longa, ver snap inicial + re-snaps,
   wheel up pausa, FAB aparece, click no FAB rola e reativa.
4. Smoke teste prompt: pergunta "notas fiscais emitidas em 05/2026",
   verificar que resposta vem com contagem por situacao + total +
   chips, SEM "qual visao voce quer?".

## Anti-objetivos

- NAO mudar typewriter (TypewriterBody atual esta OK).
- NAO mudar StreamingText/cursor.
- NAO mexer no header morph/trail collapse.

---

## Spec review #1 -> v2 (achados aplicados)

### Auto-scroll
- **Clamp em targetScrollTop**: Math.max(0, target). Se bolha menor
  que viewport e snap calcular scrollTop negativo, browser ignora mas
  fica feio. Clamp resolve.
- **Bolha menor que viewport (caso "comum")**: bubble.bottom <
  viewport.bottom - 80 -> trigger NUNCA dispara durante streaming.
  Comportamento correto: o usuario consegue ver a bolha inteira sem
  ajuda. Documentado.
- **Wheel listener NAO checa isProgrammaticScrollRef**: a flag e so
  pra evitar SNAP RECURSIVO (snap inicial dispara wheel-less scroll
  events, mas tambem dispara wheel? Nao - smooth scroll programatico
  nao dispara wheel events, so scroll events). Mantenho a checagem
  fora do wheel handler.
- **Memory leak**: trocar `Map<msgId, boolean>` por
  `useRef<string | null>` (single id rastreado). Quando muda, snap; nao
  acumula refs antigos.
- **Regenerate de msg**: assume-se id novo a cada turno. Se id repetir,
  snap nao re-dispara - aceito como nao-regressao.
- **prefers-reduced-motion**: substituir `behavior: 'smooth'` por
  `'auto'` quando usuario tem reduced motion. FAB sem animacao de
  entrada (so display).
- **Edge case: FAB clicado durante smooth scroll**: navegador ja faz
  cancel da anim anterior + comeca nova. Funciona out-of-the-box.
- **Snap durante smooth scroll em andamento**: throttle 700ms ja
  previne. Mas verificar com isProgrammaticScrollRef === true tambem.

### Diretiva quantitativa
- **Insercao em compose.ts**: APOS o bloco "## Comportamento" (existe
  hoje, e o ponto natural). Antes dos blocos opcionais (personality,
  tone, kb, etc).
- **Adaptacao WhatsApp**: na branch `source === "whatsapp"`, o
  exemplo de [[suggestions]] nao se aplica; usar "Voce tambem pode
  perguntar:" + numeradas (formato que ja existe pro WhatsApp). Mas
  a regra do quantitativo SE APLICA (sem perguntar "qual visao"; com
  contagem + total). So mudar o exemplo de [[suggestions]] para o
  formato numerado.

  Decisao para simplicidade: appendar UM bloco fixo para bubble +
  playground; quando source === "whatsapp", o bloco mostra exemplo
  com formato numerado em vez de [[suggestions]]. Duas variantes de
  string.

- **Length budget**: compose.ts nao tem MAX_PROMPT_LEN absoluto que
  limite. Verifiquei: ha caps em KB content (MAX_KB_TOTAL_CHARS) e em
  identity-base (MAX_IDENTITY), mas o total do system prompt nao tem
  cap. Adicionar ~700 chars nao tem risco.

- **Sanitizer NAO se aplica**: sanitizer roda em campos do user
  (personality, tone, guardrails, identity_base, advanced_override),
  nao em strings constantes do codigo. Diretiva passa intacta.

- **Override por advanced_override?**: se `cfg.advancedOverride`
  estiver setado, o que acontece? Olhei o codigo: advanced_override
  REPLACA o identity_base inteiro quando nao vazio. Nesse caso, o
  bloco de comportamento + diretiva quantitativa ainda sao appendados
  DEPOIS (porque o append do `parts.push("\n\n## Comportamento"...)`
  vem apos a definicao de baseIdentity). Confirmado: diretiva
  sobrevive a qualquer config do admin.

### Riscos novos
- **R1**: Setinterval(250ms) pode ficar rodando se componente
  desmontar sem cleanup. Mitigacao: return cleanup do useEffect que
  faz clearInterval.
- **R2**: useMemo do lastAssistantId recalcula a cada render de
  messages; dep certa (messages array identity). Ok pq messages e
  novo array a cada setState - ja confirmado funcionamento.

## Spec review #2 -> v3 (mais profundo)

### Auto-scroll - achados adicionais
- **Cadencia de re-snap**: bubble cresce ~16px por linha; typewriter
  ~32 cps. Linha de ~50 chars = 1.5s. Trigger 80px = ~5 linhas. Snap
  a cada ~7.5s durante streaming longo. Ritmo natural de leitura.
- **Threshold "fim manual"**: 24px e ok pra desktop, mas pode ser
  pouco em mobile com bounce-scroll. Aumentar para 32px.
- **scroll-padding/scroll-margin**: alternativa nativa do CSS para
  garantir offset visual. Considerado mas rejeitado: nao funciona com
  scrollTo programatico, so com scrollIntoView. Mantemos calculo
  explicito.
- **A11y**: FAB tem aria-label "Ir para o fim da conversa". ja esta.
  Adicionar role="button" implicito via <button>. ja esta.
- **prefers-reduced-motion sem suporte explicito**: useReducedMotion
  hook ja importado no chat-panel (usado por outros componentes).
  Reusar: se reduce, behavior: 'auto' (jump nao smooth) E FAB sem
  transition. Snap continua acontecendo, so sem suavizacao.

### Diretiva quantitativa - achados adicionais
- **Teste em compose.test.ts**: o arquivo existe e tem 24 tests +
  cobertura de "## Comportamento" (linha 209). Vou adicionar um teste
  novo verificando que a saida contem "Resultados grandes" e nao
  contem "Qual visao voce quer". Atualizar test count de 24 -> 25.
- **Ordem de blocos**: appendar APOS "## Comportamento" e ANTES das
  branches de "Entrada veio de sugestao" e "Canal WhatsApp", para
  ficar sempre presente independente do source.
- **Variante WhatsApp**: decisao revista. Em vez de duas variantes
  de string, a diretiva quantitativa e um bloco neutro que diz "use
  o canal correto de sugestoes do contexto". A branch ja-existente
  do WhatsApp ja explica que [[suggestions]] vira numeradas. Sem
  duplicacao. Mais limpo.
- **Sanity**: ao final do v3, validar que a saida com 0 customizacoes
  ainda fica < 8kb (limite tipico de system prompt no OpenAI).

## Decisoes finais (v3)
1. Auto-scroll: setInterval(250ms) + throttle(700ms), trigger 80px do
   bottom, snap coloca bubble.bottom em viewport.top + 60. Clamp em
   Math.max(0). Reduced-motion fallback. useRef<string|null> em vez
   de Map.
2. Diretiva quantitativa: bloco unico apos "## Comportamento" em
   compose.ts, sem variantes. Texto neutro que confia no canal de
   sugestoes pre-existente.
3. Teste novo em compose.test.ts.
4. Smoke teste contra dado real: pergunta de notas fiscais com IA
   ativa, verificar quantitativo na resposta.
