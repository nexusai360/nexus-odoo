# Spec — Bubble v4: auto-scroll real + FAB respiro + two-pass LLM

Data: 2026-05-25 13:10
Autor: claude-nex-bubble-storytelling
Status: v1

## Contexto

Apos varias tentativas (commits a952b21, 6cda7f6, 37ab583, a70aa70,
b372b3d), o auto-scroll continua nao funcionando: o usuario reporta que
durante a digitacao da IA, o texto cresce para FORA do viewport e a
tela nao acompanha. Tambem reportou: FAB chevron muito grudado no
botao enviar (sem respiro visual) e que perguntas em bullets na
resposta da IA deveriam virar chips automaticamente (existe regra de
ate 7 chips quando extraidas; ja autorizada anteriormente em
commit 0c2e7f1).

## Feature A - Auto-scroll v4 (stick-to-bottom padrao)

### Decisao chave
Parar de implementar variantes custom (snap-to-top, snap-writing-point,
intervals manuais). Adotar o pattern padrao **stick-to-bottom com
ResizeObserver** que e o que ChatGPT, Claude.ai, Vercel chat usam.

Por que esse pattern resolve o pedido do usuario:
- O usuario quer ver o que esta sendo escrito.
- Stick-to-bottom mantem a parte de BAIXO da bolha sempre visivel.
- Quando texto cresce, scrollTop e ajustado pra acompanhar.
- A "subida visual" que o usuario descreve eh exatamente esse efeito.

### Mecanismo
- ResizeObserver no scroll container OBSERVA o filho de altura
  (inner div com mensagens).
- Quando o filho cresce E `isSticky === true`, ajusta
  `container.scrollTop = container.scrollHeight`.
- Wheel up no scroll container -> setIsSticky(false).
- Scroll que chega no fim manualmente -> setIsSticky(true).
- FAB visivel quando !isSticky. Click no FAB: scrollTop = scrollHeight
  + setIsSticky(true).
- handleSend reseta isSticky=true.

### Estados
- `isSticky: boolean` (state) - controla auto-scroll
- `containerHeight: ref` - ultimo measured height (para comparar)

### Edge cases
- Conversa inicial carregada do banco (historico longo): isSticky=true,
  scroll vai para fim no mount.
- User toca em chevron pra expandir Raciocinio: muda altura, mas
  isSticky pode estar true ou false. Se true -> snap para fim
  (comportamento OK).
- Re-renders por React state que NAO mudam altura (ex: hover): RO
  nao dispara, sem snap espurio.

## Feature B - FAB position com respiro

### Decisao
- Atual: `bottom-[76px]` (logo acima do botao enviar).
- Novo: `bottom-[96px]` (~20px de respiro a mais).
- Tambem: ajustar `right-3` para `right-4` (alinhar com padding lateral
  da input).
- E gap visual entre o FAB e a borda inferior do footer com sombra
  sutil para o FAB se destacar do conteudo de scroll.

## Feature C - Two-pass LLM para chips

### Problema
Atualmente a IA em uma resposta de desambiguacao escreve:
> "Para 05/2026, voce quer que eu considere quais situacoes das NFs?
> - Somente autorizadas (para refletir faturamento)
> - Todas as situacoes (autorizada, em digitacao, rejeitada,
>   inutilizada etc.)"
> [[suggestions]]:Resumo NFs autorizadas|Lista NFs todas situacoes|...

Os chips vem do canal [[suggestions]] e nao das bullets do corpo. O
usuario quer que as BULLETS DO CORPO virem chips (cap 7), e que a
mensagem fique limpa sem a lista.

### Solucao two-pass
1. **Pass 1 (atual)**: agent gera resposta com tools + [[suggestions]].
2. **Pass 2 (novo)**: chamada lightweight ao mesmo LLM, sem tools,
   recebe:
   - A resposta crua que o Pass 1 gerou
   - Ultimas 3-5 mensagens do contexto
   E devolve:
   - `cleanMessage`: o texto da resposta SEM listas de perguntas/
     opcoes que ja viraram chips
   - `chips`: array de strings (ate 7 quando extraidos do corpo;
     ate 3 quando contextuais)
   - `chipsSource`: "extracted" | "contextual"

### Prompt do Pass 2 (rascunho)
```
Voce eh um analista de UX que processa respostas de IA para chat.
Receba a resposta abaixo e o historico recente. Devolva JSON:
{
  "cleanMessage": "...",
  "chips": ["...", "..."],
  "chipsSource": "extracted" | "contextual"
}

Regras:
- Se a resposta tem perguntas em bullets ou enumeracao (ex: "Qual visao
  quer? - Autorizadas - Todas"), EXTRAIA cada opcao como chip
  (ate 7) E REMOVA do cleanMessage o trecho "Qual visao... -
  Autorizadas - Todas". Mantenha o resto do texto.
- Se a resposta NAO tem perguntas em bullets, gere 3 perguntas
  contextuais que o usuario provavelmente faria a seguir, com base
  no assunto da resposta + ultimas msgs.
- Chips: <= 80 chars, sem markdown, pergunta completa.
- chipsSource indica qual caminho (para telemetria).

Resposta da IA:
\`\`\`
{message}
\`\`\`

Historico recente:
{historyCondensed}
```

### Integracao
- Em `runAgent`, apos result.ok com message final, chamar
  `enhanceWithChips(message, recentHistory, llmConfig)` que faz a 2a
  chamada.
- Resultado sobrescreve `message` e `suggestions` retornados.
- Em caso de erro/timeout (5s) na 2a chamada, fallback para
  comportamento atual (extractSuggestions do texto bruto).

### Custo
~+1 chamada LLM lightweight por turno. gpt-4o-mini ~$0.15/1M input.
Pass 2 manda ~500 tokens (resposta + historico curto) e recebe ~200
tokens (JSON). Custo extra: ~$0.0001/turno. Aceitavel.

### Telemetria
- chipsSource salvo em LlmUsage.requestKind = "chips-enhancement"
- Permite analise: que % das respostas tem bullets extraidos vs
  contextuais.

## Anti-objetivos

- NAO mudar transicoes/animacoes da bolha (Bubble cresce, header morph)
  - estavam OK no ultimo iter.
- NAO mudar typewriter / TypewriterBody.
- NAO mexer no prompt principal (compose.ts).
- NAO substituir extractSuggestions atual sem fallback: o two-pass deve
  fallback para extractSuggestions se falhar.

---

## Spec review #1 -> v2

### A - Auto-scroll: achados criticos
- **AC1**: ResizeObserver observando o filho - mas qual filho? O div
  `<div className="space-y-3">` dentro do scrollRef. Esse div cresce
  conforme novas msgs sao adicionadas E conforme content das msgs
  cresce (typewriter). Confirmado: e o alvo certo.
- **AC2**: scrollTop = scrollHeight pode dar problema se o scroll
  container ainda nao tem altura calculada na primeira mount.
  Solucao: aguardar 1 rAF apos mount antes de ativar.
- **AC3**: Wheel up. macOS trackpad pode gerar wheel events durante
  smooth scroll programatico (kinetic scroll que pode "subir"
  brevemente). Mitigacao: ignorar wheel events nos primeiros 100ms
  apos qualquer programmaticScroll.
- **AC4**: Quando user clica FAB, scrollTop = scrollHeight pode estar
  ANTES do RO disparar (a altura do filho ainda pode crescer). Boa
  noticia: se setIsSticky(true), o proximo RO snap-to-bottom resolve.
- **AC5**: Carregamento de historico. loadHistory faz setMessages com
  N msgs. RO dispara, isSticky=true -> snap. User ve fim da conversa.
  OK.

### B - FAB position: revisitar
- Spec original: bottom-[96px] + right-4. Mas o footer tem altura
  variavel (input com 1 linha = ~52px; com varias linhas = ~80px+).
  Numero fixo fica errado em mobile.
- Decisao: usar variavel CSS ou bottom-DA-altura-do-footer. Simples:
  bottom-[88px] sm:bottom-[88px] e ajustar conforme necessario apos
  smoke test. Tambem manter ate o input ter expanded (autoGrow).

### C - Two-pass LLM: achados
- **C1**: Latencia. Pass 1 leva 5-20s. Pass 2 adicional 1-3s. Total
  ate 23s. User espera mais tempo. Mitigacao: rodar Pass 2 em
  PARALELO com a renderizacao do Pass 1 (typewriter ainda revelando)?
  Nao da, porque chips dependem do final.
  Solucao: emitir Pass 1 resposta SEM chips primeiro (typewriter
  comeca), iniciar Pass 2 em paralelo, emitir chips quando Pass 2
  terminar. Requer mudar SSE pra suportar evento "chips_updated".
- **C2**: cleanMessage mudando depois que o usuario ja viu a msg.
  RUIM: usuario ve texto X, depois texto vira Y. Confunde.
  Decisao: NAO mexer no cleanMessage no Pass 2. So devolver chips.
  Bullets ficam no corpo MAS chips aparecem com pergunta-resumo
  ("Resumo de autorizadas em 05/2026" cobre "Somente autorizadas
  (para refletir faturamento)"). User clica no chip, agente entende.

  ATUALIZACAO: revisado. O usuario disse EXPLICITAMENTE "essas
  perguntas nao devem aparecer como topico na mensagem, devem
  aparecer resumido no formato de sugestao". Entao SIM, devemos
  remover o trecho de bullets-perguntas do cleanMessage.
  Solucao para nao mudar texto depois de mostrado:
  - Esperar Pass 2 antes de emitir o evento 'done' no SSE.
  - Streaming visual do Pass 1 ja acontece (token a token).
  - Mas o 'done' so dispara apos Pass 2.
  - Ou: emitir intermediario "draft_done" e "final_done" com
    correcao. Mais complexo.

  Decisao simples para v3: aguardar Pass 2 antes de done. Custo:
  +1-3s de "Pensando" no final. Aceitavel para qualidade.

- **C3**: Falha do Pass 2. Se 2a chamada falha (timeout, erro), usar
  message + extractSuggestions(message, agentSettings.maxSuggestions)
  como fallback. Comportamento atual = comportamento de fallback.
- **C4**: JSON inválido da Pass 2. LLM pode devolver JSON malformado.
  Solucao: try/catch parse, fallback para extractSuggestions.
- **C5**: Custo. Como spec ja calculou: ~$0.0001/turno. Aceitavel.
  Adicionar uma feature flag para desligar em producao se necessario:
  `cfg.enhanceChipsCheckpoint` (OFF / PLAYGROUND / PRODUCTION) com
  default PRODUCTION.

### Decisoes ajustadas para v2
- A: stick-to-bottom + ignorar wheel nos primeiros 100ms apos
  programmatic scroll.
- B: bottom-[88px] + right-3 (manter alinhamento com botoes do
  footer).
- C: two-pass com Pass 2 BLOQUEANDO antes do done, JSON output parsed
  com fallback, feature flag enhanceChipsCheckpoint.

---

## Spec review #2 -> v3 (mais profunda)

### A - Auto-scroll: ainda faltando
- **AD1**: Quando RO observa a div `<div className="space-y-3">`, ele
  notifica em mudancas de CONTENT_BOX. Ok. Mas o container scrollRef
  e o PAI, e e ele que rola. Logica certa: RO no filho, scroll no pai.
- **AD2**: Reset de isSticky no handleSend e perigoso: se user estava
  scrollado pra cima lendo conversa antiga e mandou nova msg, o snap
  o joga pra fim antes mesmo de tool_call chegar. Solucao: setIsSticky
  no handleSend SIM, porque ele acabou de mandar uma msg = quer ver
  resposta nova. OK.
- **AD3**: cleanup do RO. Cuidado para nao deixar RO em zumbie se
  componente desmonta. useEffect com return cleanup ja faz isso.

### B - FAB position: ja decidido. Pular.

### C - Two-pass: ainda nao resolvido
- **CD1**: Como implementar a Pass 2? Reusa o LLM client ja construido
  em runAgent (`client`). Construir um messages[] novo com prompt
  do analista + a resposta + historico. Chamada simples, sem tools.
- **CD2**: Streaming do Pass 1 conforme tokens chegam: ja existe. O
  texto vai chegando no client conforme o agente streama. O "done"
  no final fecha o turno e emite chips.
- **CD3**: Bloquear done ate Pass 2: significa o usuario ve texto
  completo mas chips so aparecem 1-3s DEPOIS. Aceitavel.
- **CD4**: cleanMessage substitui o texto. O TypewriterBody do client
  fica revelando o texto Pass-1-raw. Quando done vem com cleanMessage,
  o React re-renderiza com novo content. Se TypewriterBody ja revelou
  parte do texto Pass-1-raw que NAO existe no cleanMessage, o
  re-render vai...
  - O StreamingText/TypewriterBody usa state `visible` que cresce
    progressivamente. content prop atualiza.
  - Quando content cai (Pass-1-raw -> cleanMessage menor), `visible`
    pode ser maior que cleanMessage.length. Slice resulta em
    cleanMessage inteiro. Comportamento OK.
  - Mas o usuario VIU bullets aparecerem e depois sumirem. UX ruim.

  Solucao final: NAO emitir Pass 1 streaming. Acumular Pass 1 inteiro
  no backend, rodar Pass 2, e SO ENTAO emitir o done com cleanMessage
  + chips. TypewriterBody comeca a revelar so quando done chega.
  Custo: usuario espera mais tempo "Pensando" sem ver texto streaming.

  ATUALIZACAO da decisao: desabilitar token streaming pro client
  durante esse novo modo. O typewriter no client (TypewriterBody com
  rAF) ja faz a animacao de digitacao sem precisar de tokens vindos
  via SSE - ele revela o content prop quando ele e setado. Entao
  basta: nao emitir tokens via SSE, esperar a resposta completa do
  agent + Pass 2, emitir done com cleanMessage. TypewriterBody do
  client comeca a revelar entao.

  Isso e o que ja foi decidido em 2026-05-25 03:30 (commit e9579f2).
  Confirmado: SSE route nao emite mais "token" events. Frontend faz
  typewriter local. Decisao mantida.

- **CD5**: Erros do Pass 2. Lista de fallbacks:
  - Timeout 5s: pular Pass 2, usar extractSuggestions raw.
  - HTTP error: pular Pass 2.
  - JSON parse error: pular Pass 2.
  - chips vazias: pular Pass 2.
  Todos os fallbacks resultam em chips do canal [[suggestions]] ou
  bullet extraction local.

- **CD6**: maxSuggestions config. Pass 2 deve respeitar:
  - Se chipsSource === "contextual": cap = agentSettings.maxSuggestions
    (geralmente 3).
  - Se chipsSource === "extracted": cap = 7 (regra autorizada).
  Pass 2 prompt deve receber esse contexto.

- **CD7**: Quando NAO chamar Pass 2:
  - source === "whatsapp" (WhatsApp nao tem chips clicaveis).
  - source === "playground" (admin testa direto, sem chips).
  - Quando enhanceChipsCheckpoint === "OFF".
  Em todos esses casos: comportamento atual de extractSuggestions.

### Decisoes finais v3
- A: ResizeObserver no filho do scrollRef. scrollTop=scrollHeight
  quando isSticky. Wheel up + delay 100ms apos programmatic = mark
  not sticky. FAB visivel quando !isSticky.
- B: bottom-[88px] + right-3.
- C: two-pass com Pass 2 BLOQUEANDO. cleanMessage substitui content,
  chips substituem suggestions. Fallback para extractSuggestions em
  qualquer falha. Cap dinamico (3 ou 7) baseado em chipsSource. Skip
  para source=whatsapp/playground. Feature flag (opcional v1).
