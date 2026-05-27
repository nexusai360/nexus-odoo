# Spec — 3 features da bubble do Agente Nex

Data: 2026-05-25 04:15
Autor: claude-nex-bubble-storytelling
Status: v1

## Contexto

Apos as animacoes do typewriter ficarem prontas (commit dcf13c0), o usuario
reportou 3 problemas que afetam a experiencia de leitura/uso da bubble:

1. Resposta cresce e some pra fora do viewport — usuario nao acompanha.
2. IA gera "perguntas em bullet" no corpo (ex.: "- Somente autorizadas /
   - Todas (...)"); deveriam virar chips clicaveis.
3. IA pergunta "qual visao voce quer?" quando dataset e grande, em vez de
   trazer ja o quantitativo agrupado.

## Feature 1 — Auto-scroll inteligente + FAB scroll-to-bottom

### Comportamento alvo
- Ao enviar mensagem, **uma vez** que a resposta do assistant comeca a
  aparecer, scrolla a bolha do assistant pra TOPO do viewport (`block:
  'start'`) com smooth.
- Conforme a resposta cresce verticalmente, **se a bolha sair pra baixo**
  do viewport, repete o snap pro topo (max 1x por crescimento de bolha,
  com debounce).
- **Se o usuario rolar pra cima manualmente** (wheel / touchmove / drag da
  scrollbar / teclas pgup/setas), desativa o auto-scroll pra esse turno.
- **FAB chevron-down** aparece quando o usuario nao esta no fim do scroll.
  Clicar leva ao fim com smooth + reativa o auto-scroll do turno.
- Auto-scroll **reativa** automaticamente no proximo `handleSend`.

### Edge cases
- Mensagem do user tambem snap-to-top? **Nao**: so a do assistant
  (ela cresce; a do user e estatica).
- Trail expand/collapse no chevron NAO dispara scroll (regra que ja existe
  no useEffect atual via `messagesCount` e nao `messages`).
- Welcome screen (sem mensagens): FAB invisivel.
- Conversa carregada via historico (loadHistory): NAO snap inicial; manter
  scroll no fim (comportamento atual).

### Arquivos a tocar
- `src/components/agent/chat-panel.tsx`:
  - Substituir o useEffect atual (linhas 197-205) por logica nova.
  - Adicionar refs por `m.id` para conseguir scrollIntoView na bolha certa.
  - State: `userScrolledAway: boolean` (true quando o usuario rolou).
  - Wheel/touchmove listener: detecta intenção de scroll pra cima.
  - FAB renderizado dentro do scrollRef parent (position: absolute).

## Feature 2 — Extrair perguntas da resposta para chips

### Comportamento alvo
- Backend (em `extractSuggestions`): apos extrair `[[suggestions]]`,
  detecta **se ainda restam perguntas em bullets/numeradas no corpo**.
- Padrao detectado:
  - Linhas que comecam com `- `, `* `, `1.`, `2.`, etc.
  - Imediatamente apos uma frase de chamada tipo "qual visao", "qual voce
    quer", "qual opcao", "que voce prefere", ou apos uma frase que
    termina com `?`.
  - Pelo menos 2 bullets consecutivos.
- Acao: strip dos bullets do `message`, adiciona ao `suggestions` apos os
  ja extraidos do `[[suggestions]]`.
- Override do `MAX_SUGGESTIONS`: quando bullets sao detectados, sobe pra
  **7**. Aplica-se ao tope total (existing + novos).

### Edge cases
- Bullets que NAO sao perguntas (ex.: lista de items numericos da
  resposta) — manter no corpo. Heuristica: dividir entre "bloco bullets"
  precedido por pergunta de desambiguacao vs lista pura.
- Se a IA ja emitiu `[[suggestions]]` corretamente, NAO mexer.
- Se houver mais de 7 bullets-perguntas, pegar os 7 primeiros, descartar
  o resto (limite duro).

### Arquivos a tocar
- `src/lib/agent/run-agent.ts`:
  - Aumentar `MAX_SUGGESTIONS` interno para 7.
  - `extractSuggestions`: adicionar passo "extractBulletQuestions"
    quando bullets de desambiguacao restam no texto.

## Feature 3 — Prompt para quantitativo automatico

### Comportamento alvo
- Quando uma tool retorna muitos registros (truncado ou nao), o agente
  **NAO** pergunta "qual visao voce quer?". Em vez disso:
  - Traz o **quantitativo por categoria/situacao/status** automaticamente.
  - Ex.: "constam 234 notas: 152 autorizadas, 41 em digitacao, 28
    rejeitadas, 13 inutilizadas."
  - Oferece chips pra drill-down via `[[suggestions]]`.

### Arquivos a tocar
- `src/lib/agent/prompt/identity-base.ts`:
  - Nova secao apos "Formato de resposta": "Resultados grandes — sempre
    traga quantitativo".

## Verificacao manual
- F1: testar com pergunta longa (faturamento detalhado), ver snap-to-top.
  Rolar pra cima e ver FAB aparecer. Clicar FAB, volta pro fim.
- F2: perguntar "notas fiscais emitidas em 05/2026"; resposta deve vir
  com chips de "autorizadas", "todas", "rejeitadas" etc, sem bullets
  no corpo.
- F3: mesma pergunta; resposta deve trazer "X autorizadas, Y em
  digitacao..." direto, sem clarification question.

## Anti-objetivos
- NAO mexer no TypewriterBody (acabou de ficar bom).
- NAO mexer nos providers LLM.
- NAO criar novos endpoints SSE.

---

## Review critica #1 -> Refinamentos v2

### F1 — refinamentos
- **Deteccao de scroll do usuario**: usar `isProgrammaticScrolling` ref +
  timeout 600ms. Qualquer scroll event fora dessa janela = intencao do
  usuario. Wheel/touchmove com `deltaY < 0` (scroll pra cima) tambem
  desativam imediatamente, sem esperar timeout.
- **Re-snap durante streaming**: usar `ResizeObserver` na bolha do
  assistant. A cada change de height, se `bubble.getBoundingClientRect().top
  < 0`, nao mexe. Se `bubble.top > 0 && bubble.bottom > viewport.bottom`,
  re-snap pro topo. Debounce 80ms.
- **FAB posicionamento**: deve flutuar SOBRE o scrollRef (nao dentro). O
  parent de scrollRef e um `<div className="flex h-full flex-col">`. FAB
  vai antes do scrollRef no DOM, position absolute bottom-3 right-3.
- **Refs por msg**: usar `Map<string, HTMLElement>` em `useRef`. Cada
  AgentMessage wrapper recebe `ref={(el) => { if (el) refsMap.set(m.id, el); else refsMap.delete(m.id); }}`.
  Mas isso precisaria de mudanca na assinatura de AgentMessage —
  alternativa: envolver com um `<div ref={...}>` no chat-panel mesmo.
  **Decidido**: wrapper div no chat-panel, sem tocar AgentMessage.
- **Reativacao**: ao chamar `handleSend`, set `userScrolledAway=false`.
  Ao chegar `done` event, NAO desativa.

### F2 — refinamentos
- **Regex e heuristica**: estrategia em 2 passos.
  1. Localizar `[[suggestions]]` ou seu fim. Se existir, ignora F2 (modelo
     ja respeitou o canal).
  2. No texto restante, procurar trailing bullets que sigam uma pergunta:
     padrao `/\?[\s\S]{0,40}\n\s*((?:[-*•]|\d+[.)])\s+.{1,80})(?:\n\s*(?:[-*•]|\d+[.)])\s+.{1,80}){1,7}\s*$/`
     - Trailing: bullets nas ultimas linhas do texto.
     - Ate 7 bullets (cap duro F2).
     - Cada bullet entre 1 e 80 chars (matchar tamanho de chip).
  3. Se match: bullets viram suggestions; resto vira `message`.
- **MAX_SUGGESTIONS = 7** (era 5). Cap configuravel sobe ate 7 quando
  extracao trouxe bullets; mantem maxCount do user pra fallback comum.
- **Safeguard contra falso positivo**: minimo 2 bullets E precedido por
  "?" nos ultimos 200 chars. Caso contrario, deixa no corpo.
- **Markdown nos bullets**: aplicar a mesma sanitizacao que o canal
  `[[suggestions]]` ja faz (strip `**`, backticks).

### F3 — refinamentos
- **Linguagem do prompt**: precisa ser ASSERTIVA, nao sugestiva. Usar
  imperativo + exemplo.
- **Trigger heuristico no LLM**: "quando o retorno de uma tool e grande
  demais para listar (truncagem mencionada OU > 30 items) OU quando voce
  notar que a pergunta abrange varios subtipos (situacoes, status,
  categorias)".
- **Acao**: "agrupar por dimensao natural (status/situacao/categoria) e
  trazer contagem por grupo + total. Apos isso, oferecer drill-down via
  [[suggestions]]: cada chip e uma pergunta especifica que abriria uma
  fatia. Nao perguntar 'qual visao voce quer'."
- **Exemplo positivo**: incluir "Em 05/2026 ha 234 notas: 152
  autorizadas, 41 em digitacao, 28 rejeitadas, 13 inutilizadas. Total
  faturado nas autorizadas: R$ X. [[suggestions]]:Liste...".
- **Exemplo negativo**: "Em 05/2026 ha muitas notas. Qual visao voce
  quer? - autorizadas - todas" (FORMATO PROIBIDO).

## Decisoes adicionais
- F1 + F2 podem ir em commits separados; F3 mais simples vai em um terceiro.
- Tests unitarios de F2: adicionar 4 cases em
  `src/lib/agent/run-agent.extract-bullets.test.ts` (novo arquivo).
- Manual smoke F1: dev server, abrir bubble, pergunta longa, ver snap +
  FAB.
