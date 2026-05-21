# Agente: claude-f4-onda2-correcoes-r6

- **Branch:** `feat/f4-onda2-mcp-escrita`
- **Tópico:** Rodada 6 de correções da F4 Onda 2.
- **Plano:** `docs/superpowers/plans/2026-05-21-f4-onda2-correcoes-r6.md` (v3, seção Progresso).
- **Modo:** sessão principal, Opus 4.7, sem subagentes. `ui-ux-pro-max` em toda UI. Sem travessão.

## PAUSADO 2026-05-21 — rodada 6 PARCIAL

A sessão pausou por limite de contexto. 7 de 9 áreas concluídas, commitadas e
verdes (`tsc`/`jest` 1530/`next build`). Branch já com push.

### Concluído (commits `f4-onda2-fix-r6`)
- A — webhook rotaciona o secret dentro do `WebhookEditDialog` (`SecretRevealStep`),
  tarja externa removida de `webhooks-content.tsx`.
- C — passo Resumo do `ChaveDialog` lista as URLs de origem.
- D — criação de chave revela o token dentro do modal (`SecretRevealStep`), sem
  tarja externa; `ChavesLista` perdeu o banner e o `revealToken`.
- E — `ChaveRow` só com toggle + lápis + revogar (`ShieldOff`); menu "..." removido.
- F — edição de chave: botão "Rotacionar token" no Resumo revela o token in-modal.
- G — `plugar-mcps-content.tsx`: após criar/editar com teste ok, chama
  `testExternalMcpServer(id)` para persistir `lastStatus` (corrige card "Não testado").

### PENDENTE — retomar por aqui
1. **Área B — calendário.** `src/components/ui/date-field.tsx` + `src/components/ui/
   calendar.tsx`. A grade de dias precisa ocupar toda a largura do componente (hoje
   sobra espaço em branco à direita). Adicionar setas de mês anterior/próximo na faixa
   do calendário, com travas: não avançar além de dez do ano máximo (ano atual +30 =
   2056); não voltar antes do mês corrente (`fromDate`). Desabilitar a seta no limite.
   Hoje o `DateField` passa `hideNavigation` ao `Calendar` — reabilitar a navegação
   (ou setas próprias) respeitando `startMonth`/`endMonth`.
2. **Área H — Enter avança os wizards.** Em `ChaveDialog` (chaves-lista.tsx),
   `WebhookWizard` e `McpWizardDialog` (plugar-mcps-content.tsx): `Enter` num campo
   avança para o próximo passo (equivale a Próximo), respeitando `canAdvance`. No
   último passo NÃO submete sozinho. Cuidar do input de origens (já tem Enter próprio
   para Adicionar — usar `stopPropagation`).
3. **Ajuste F.** Em `ChaveDialog` modo edição, o passo 4 (Origens) deve ficar
   **somente leitura** (origens definidas na criação, como a Expiração). Hoje continua
   editável.

Depois das 3: verificação (`tsc`/`eslint`/`jest`/`build`), varredura de travessão,
atualizar STATUS/HISTORY/plano, commit, push.
