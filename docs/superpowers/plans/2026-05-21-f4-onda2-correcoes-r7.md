# F4 Onda 2, Correcoes Rodada 7, Implementation Plan

> Sessao principal, Opus 4.7, sem subagentes. `ui-ux-pro-max` em toda UI. Sem travessao.
> Branch `feat/f4-onda2-mcp-escrita`. Commit por area (`f4-onda2-fix-r7`). v3 apos 2 reviews.

**Goal:** Setima rodada de correcoes (feedback por audio + 13 prints, 2026-05-21). Foco:
calendario, tela de revelacao de token, terminologia "token", edicao de chave, painel
de Logs (motivo do erro, nota, tag da chave) e os tours (docs, logs, chaves).

## AREA A, Calendario: setas menores nas extremidades
- [ ] `date-field.tsx`: os botoes de mes ant/prox estao grandes demais (caixa com borda
  e bg). Trocar por chevrons simples (so o icone, sem caixa de botao), colados nas
  extremidades esquerda/direita da faixa. Liberar o espaco recuperado para os selects
  de mes e ano mostrarem o texto inteiro ("Dezembro", "2026"), hoje truncados.
- [ ] Manter as travas de limite (atMinMonth/atMaxMonth) e o estado desabilitado.

## AREA B, SecretRevealStep: travessao, termo, descricao em 1 linha
- [ ] `secret-reveal-step.tsx`: o titulo "Copie agora — nao sera exibido novamente" tem
  TRAVESSAO. Reescrever sem travessao (ex.: "Copie agora, ele nao aparece de novo").
- [ ] A descricao "Guarde este {label} em local seguro. Por seguranca, ele nao pode ser
  recuperado depois de fechar." quebra em 2 linhas. Resumir para uma frase curta de 1
  linha (ex.: "Guarde em local seguro: nao da para ver de novo depois.").
- [ ] O `label` default e os usos passam a ser "Token" (nao "Token da chave").

## AREA C, Terminologia: so "token"
- [ ] `chaves-lista.tsx`: no Resumo do modo edicao, "Token da chave" -> "Token".
  Varrer o arquivo por "token da chave"/"token de acesso" e deixar so "token".
- [ ] Onde `SecretRevealStep` e usado, passar `label="Token"`.

## AREA D, Refresh ao fechar o modal de criacao
- [ ] `chaves-lista.tsx`: hoje fechar o modal de criacao pelo X nao atualiza a lista
  (so o `onCreated` atualiza). Ao fechar o modal de criacao por qualquer via (Concluir
  ou X), disparar o refresh da secao de chaves, sem reload de pagina. Implementar via
  `onOpenChange` do `ChaveDialog` de criacao: ao fechar, alem de `setCreateOpenManual(false)`,
  chamar o refresh.

## AREA E, Botao "Concluir" no SecretRevealStep + salvar ao concluir
- [ ] `secret-reveal-step.tsx`: o botao de confirmacao passa de "Ja copiei" para
  "Concluir". Adicionar prop opcional `acknowledgeLabel` (default "Concluir") para nao
  quebrar outros usos; o aria/label interno acompanha.
- [ ] `chaves-lista.tsx` modo edicao: quando o token e revelado apos rotacionar, o botao
  "Concluir" da revelacao deve **salvar as alteracoes do form** (`updateMcpApiKey`) e
  fechar, em vez de voltar para a tela de "Salvar alteracoes". O rotate ja persistiu o
  token; o Concluir persiste o resto da edicao e encerra.
- [ ] Modo criacao: "Concluir" fecha o modal e atualiza a lista (a chave ja foi criada).

## AREA F, Edicao de chave: Tenant visivel + Origens editaveis
- [ ] `chaves-lista.tsx`: no passo Identificacao do modo edicao, exibir o Tenant como
  campo somente-leitura (hoje some). E identificacao, o usuario precisa ver, mesmo sem
  poder editar.
- [ ] Reverter a Area F da r6: as Origens voltam a ser **editaveis** no modo edicao
  (adicionar e remover origens). A Expiracao continua somente-leitura. O `submit()` do
  modo edicao ja envia `allowedOrigins`.

## AREA G, Logs: motivo do nao-sucesso sempre explicado
- [ ] `logs-timeline.tsx` `LogDetail`: hoje o painel de erro so aparece quando
  `errorCode`/`errorMessage` existem (logs antigos nao tem). Para qualquer outcome != ok
  (error/denied/invalid_input), **sempre** renderizar um painel de status explicando o
  motivo: usa `errorCode`/`errorMessage` quando houver; senao, uma explicacao generica
  por outcome (o que aquele status significa). A cor do painel acompanha o status
  (erro vermelho, negado ambar, invalido laranja).

## AREA H, Logs: nota explicativa resumida
- [ ] `logs-timeline.tsx`: a nota do topo tem 2 paragrafos longos. Resumir para 1
  paragrafo de no maximo 3 linhas, sem perder o essencial (e auditoria de chamadas de
  tool; internas do Nex sem chave de API; lista reflete chamadas reais).

## AREA I, Logs: tag da chave em cada linha
- [ ] `mcp-audit-query.ts`: o `include.apiKey.select` passa a trazer `label` alem de
  `last4`; `AuditLogItem` ganha `apiKeyLabel: string | null`.
- [ ] `logs-timeline.tsx` `LogRow`: entre o nome da tool e o badge de status, exibir uma
  tag com o nome da chave de API que gerou o log. Quando nao ha chave (modo interno /
  Agente Nex), a tag e "Agente Nex". Cor neutra, roxo claro sutil, com contraste para
  tema claro e escuro (ex.: `bg-violet-500/10 text-violet-600 dark:text-violet-300`).
  A coluna `····last4` do row sai (a tag a substitui); o detalhe mantem "Chave ····last4".

## AREA J, Tour da documentacao: passo de tool aberta
- [ ] `mcp-docs-content.tsx`: quando o tour de docs estiver ativo e chegar no passo novo,
  forcar a abertura da primeira tool do catalogo (primeira tool do primeiro modulo) e
  pos um `data-tour="mcp-docs-tool"` no card dela.
- [ ] `servidor-mcp-tour.ts`: apos o passo "tools", inserir um passo `tool-aberta`
  apontando para `[data-tour='mcp-docs-tool']`, explicando argumentos e exemplo de
  chamada. O passo "tools" generico continua; o novo passo mostra a tool ja aberta.

## AREA K, Tour de logs: registro aberto + status + download
- [ ] `logs-timeline.tsx`: por `data-tour="mcp-logs-registro"` no primeiro `LogRow`
  (index 0), que ja e auto-expandido pelo tour.
- [ ] `servidor-mcp-tour.ts`: adicionar um passo apos "lista" apontando para
  `[data-tour='mcp-logs-registro']`, explicando o que um registro mostra, os status
  possiveis (Sucesso, Erro, Negado, Invalido) e que o filtro tem Exportar CSV.

## AREA L, Tour de chaves: passo do wizard quebrado + chaves cadastradas
- [ ] Bug: o passo "wizard" do tour de chaves nao destaca nada (modal todo escuro). Causa:
  o `ChaveDialog` abre via `currentStepIndex >= 2`, mas o `tour-overlay` mede o alvo no
  mesmo frame, antes do dialog montar -> `rect` fica `null` -> sem spotlight.
  `tour-overlay.tsx`: quando `document.querySelector(targetSelector)` nao encontra o
  elemento, re-tentar em intervalo curto (ex.: a cada 120ms, ate ~3s) ate aparecer,
  entao medir. Isso conserta tambem J e K (alvos que surgem apos o passo trocar).
- [ ] `servidor-mcp-tour.ts`: adicionar ao tour de chaves um passo para a secao das
  chaves ja cadastradas (`[data-tour='mcp-chaves-lista']`), depois do "nova" e antes do
  "wizard" (a lista so existe quando ha chaves; placement seguro).

## AREA M, Verificacao
- [ ] `tsc`/`eslint`/`jest`/`next build` verdes; varredura de travessao; smoke test.
- [ ] STATUS, HISTORY, plano; remover agent file; commit; push.

## Ordem: A -> B -> C -> D -> E -> F -> G -> H -> I -> J -> K -> L -> M.

## Historico de review
### Review #1 (v1->v2)
1. E ambiguo sobre o "Concluir" no modo criacao: na criacao a chave ja existe, "Concluir"
   so fecha+atualiza; explicitado. No rotate da edicao, "Concluir" salva o resto.
2. I: remover a coluna last4 do row evita poluicao agora que a tag carrega a identidade
   da chave; o detalhe mantem o last4. Explicitado.
3. L: a causa-raiz do passo do wizard (rect null por timing) precisa de fix no
   tour-overlay, nao so reposicionar o card; explicitado o retry de querySelector.
### Review #2 (v2->v3)
1. B: a descricao curta nao pode usar travessao nem ponto-e-virgula como travessao
   disfarcado; usar dois-pontos ou frase simples.
2. G: o painel de status nao-sucesso deve sempre aparecer, inclusive para logs antigos
   sem errorCode; a explicacao generica por outcome cobre esse caso.
3. J/K: nao depender de novos componentes de tour; reusar o padrao de auto-abertura por
   `currentStepIndex` que `ChavesLista` e `LogsTimeline` ja usam.
4. L: o passo de chaves cadastradas so deve entrar se houver lista; como o tour ja roda
   na aba Chaves e o passo "lista"/cabecalho ja existe, o novo passo aponta para
   `mcp-chaves-lista` que so renderiza com `activeKeys.length > 0` (aceitavel: tour
   roda em ambiente com chaves; se vazio, o tour-overlay centraliza o card sem travar).

## Progresso
- [x] A  - [x] B  - [x] C  - [x] D  - [x] E  - [x] F  - [x] G
- [x] H  - [x] I  - [x] J  - [x] K  - [x] L  - [x] M

> **Rodada 7 concluída.** 12 áreas implementadas e verificadas (`tsc`/`eslint`/
> `jest` 1531/`next build` verdes; sem travessão, inclusive comentários).
> Notas de execução: B usou frase curta sem travessão; E adicionou prop
> `acknowledgeLabel` ao `SecretRevealStep` (default "Concluir") e no rotate da
> edição o "Concluir" chama `submit()`; F reverteu a trava de Origens da r6; G
> adicionou `outcomeExplanation()` com explicação genérica por outcome para
> logs antigos sem `errorCode`; I trocou a coluna `····last4` por uma tag com o
> nome da chave (ou "Agente Nex"); L corrigiu o `tour-overlay` com retry de
> `querySelector` (conserta também os alvos de J e K que surgem após o passo).
