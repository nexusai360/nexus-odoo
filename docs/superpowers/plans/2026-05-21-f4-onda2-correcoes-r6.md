# F4 Onda 2, Correcoes Rodada 6, Implementation Plan

> Sessao principal, Opus 4.7, sem subagentes. `ui-ux-pro-max` em toda UI. Sem travessao.
> Branch `feat/f4-onda2-mcp-escrita`. Commit por area (`f4-onda2-fix-r6`). v3 apos 2 reviews.

**Goal:** Sexta rodada de correcoes (feedback por audio + prints, 2026-05-21). Tema central:
segredos/tokens precisam ser revelados **dentro do modal**, nunca em tarja externa.

## Contexto

- `SecretRevealStep` (`src/components/ui/secret-reveal-step.tsx`) ja existe: `secret`,
  `label`, `onAcknowledge`. Usado para revelar segredo dentro de um fluxo.
- O bug do "Nao testado": `testExternalMcpEndpoint` testa campos crus mas nao persiste
  `lastStatus`; `createExternalMcpServer` cria com `lastStatus` default. Card fica "Nao
  testado" mesmo apos teste ok.

## AREA A, Webhook: rotacionar secret dentro do modal de edicao
- [ ] `WebhookEditDialog`: o botao Rotacionar passa a rotacionar e exibir o secret
  **dentro do dialog** (view `SecretRevealStep`), nao via `onRotate` para a tarja externa.
  Estado interno `revealedSecret`; ao acionar, troca o corpo do dialog pela revelacao;
  `onAcknowledge` volta ao form ou fecha. Remover a prop `onRotate`.
- [ ] `webhooks-content`: remover a tarja `revealedSecret` (nao ha mais reveal externo;
  a criacao ja revela pelo passo 3 do `WebhookWizard`).

## AREA B, Calendario (DateField)
- [x] A grade de dias nao ocupa a largura do componente; usar o espaco todo (grade full
  width, celulas distribuidas).
- [x] Adicionar setas de mes anterior/proximo (esquerda e direita) na faixa do calendario.
  Travas: nao avancar alem de dezembro do ano maximo (ano atual +30); nao voltar antes do
  mes corrente (`fromDate`). Desabilitar a seta no limite.

## AREA C, Chaves: Resumo lista as origens
- [ ] No passo Resumo do `ChaveDialog`, em vez de "N permitidas", listar as URLs de origem.
- [ ] Confirmar que o corpo do passo rola (modal nao cresce com muitos modulos) — a
  estrutura flex da r5 ja faz; so verificar.

## AREA D, Chaves: token revelado dentro do modal na criacao
- [ ] Ao concluir a criacao, em vez de fechar e mostrar tarja externa, o `ChaveDialog`
  transiciona para uma view de revelacao do token (`SecretRevealStep`) dentro do modal.
  `onAcknowledge` (Concluir) fecha o modal.

## AREA E, Chaves: card no padrao
- [ ] `ChaveRow`: remover o menu "...". Manter apenas: Switch (habilitar/desabilitar),
  lapis (editar), e o icone de **revogar** (`ShieldOff`, nao lixeira). Ordem: switch,
  lapis, revogar.
- [ ] Remover a tarja externa `revealToken` de `ChavesLista` (reveal agora e in-modal).
  Rotacionar e Marcar-perdida saem do card; rotacionar vai para dentro da edicao (Area F).

## AREA F, Chaves: edicao
- [x] No modo edicao do `ChaveDialog`: Expiracao e Origens ficam **somente leitura**
  (definidos na criacao). Editaveis: rotulo, descricao, acessos, limite.
- [x] Adicionar, no passo Resumo do modo edicao, um botao "Rotacionar token" que rotaciona
  e revela o novo token **dentro do modal** (`SecretRevealStep`).

## AREA G, Plugar MCP: status apos teste
- [ ] `createExternalMcpServer` e `updateExternalMcpServer` aceitam `lastStatus?: "ok"`
  e o gravam. O wizard, apos teste com sucesso, passa `lastStatus: "ok"` ao concluir, para
  o card mostrar "Conectado", nao "Nao testado".
- [ ] No teste, resposta HTTP 4xx/5xx: continua "alcancavel" mas a mensagem vira um aviso
  (texto claro de que o host respondeu com aquele status), nao um sucesso puro.

## AREA H, Enter avanca os wizards
- [x] Nos modais wizard (Chave, Webhook, MCP), `Enter` num campo avanca para o proximo
  passo (equivale a Proximo), respeitando a validacao do passo. No ultimo passo nao
  submete sozinho (acao final exige clique).

## AREA I, Verificacao
- [ ] `tsc`/`eslint`/`jest`/`next build` verdes; varredura de travessao; smoke test.
- [ ] STATUS, HISTORY, plano; remover agent file; commit; push.

## Ordem: A -> B -> C -> D -> E -> F -> G -> H -> I.

## Progresso
- [x] A webhook rotate in-modal (WebhookEditDialog revela o secret no modal)
- [x] B calendario (grade full width via root w-full + setas mes ant/prox com travas)
- [x] C resumo lista as URLs de origem
- [x] D token in-modal na criacao da chave (SecretRevealStep)
- [x] E card de chave: toggle + lapis + revogar (menu removido)
- [x] F edicao de chave: rotate token in-modal no Resumo + Origens read-only na edicao
- [x] G plugar status apos teste (persiste lastStatus via testExternalMcpServer)
- [x] H Enter avanca os wizards (Chave, Webhook, MCP) via wrapper form + onSubmit
- [x] I verificacao: tsc/eslint/jest(1520)/build verdes

> **Rodada 6 concluida.** Todas as 9 areas implementadas e verificadas. B usa
> setas proprias no cabecalho do DateField (atMinMonth/atMaxMonth como travas) e
> grade full width via `classNames.root: w-full`. H envolve cada wizard num
> `<form onSubmit>`: Enter num campo avanca o passo, no ultimo passo nao submete
> (acao final exige clique; todos os botoes ja sao type=button). No WebhookWizard
> so o passo 1 -> 2 avanca (criar webhook continua exigindo clique). F travou
> Origens como read-only no modo edicao do ChaveDialog.

## Historico de review
### Review #1 (v1->v2)
1. D e A e F compartilham o mesmo padrao (SecretRevealStep in-modal) — confirmado reuso do
   componente existente em vez de tres implementacoes.
2. E removia rotate/markLost do card sem destino — v2 manda rotate para dentro da edicao
   (F) e descarta markLost (rotate cobre o caso de chave comprometida).
3. G nao dizia como persistir status — v2 define `lastStatus` opcional no create/update.
### Review #2 (v2->v3)
1. B precisa de travas nas setas (limite de ano e mes corrente) — explicitado.
2. F: edicao com Expiracao/Origens read-only — explicitado quais campos travam.
3. H: Enter no ultimo passo nao pode submeter sozinho — explicitado.
