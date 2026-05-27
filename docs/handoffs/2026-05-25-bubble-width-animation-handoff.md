# Handoff — Animacao de WIDTH da bolha do Agente Nex

Data: 2026-05-25 20:25
Sessao encerrada: claude-agente-nex-inteligencia (e antes claude-nex-bubble-storytelling)
Branch: feat/agente-nex-inteligencia
Commit final: e73829b

## Estado atual (funciona)
- HEIGHT da bolha anima suave em 1.1s via motion.div + ResizeObserver
  + contentRect.height (BubbleSurface em src/components/agent/agent-message.tsx)
- Step "Consultou..." entra com fade + slide-up (motion.li 550ms+550ms)
- Typewriter funcional, scroll stick-to-bottom, FAB respiro, lupa pro
  bi_consulta_avancada, two-pass LLM extraindo bullets como chips,
  MAX_ITERATIONS=3, diretiva prompt anti-loop

## O que NAO funciona (pedido pendente)
WIDTH (expansao horizontal) da bolha quando novo step entra ("Pensando"
~100px -> "Pensando + Consultou faturamento" ~200px) deveria animar
suave em paralelo com height. Atualmente: INSTANTANEO (CSS natural).

## Tentativas e por que cada uma falhou

1. **motion.layout="size"** (FLIP): aplicava `transform: scale()` no
   container deformando children. User reportou "compress then expand,
   parece susto". REJEITADO.

2. **motion.layout="position" no BubbleWrapper**: FLIP residual em
   posicao tambem afetava size. Overshoot horizontal ("estica pra
   direita e volta"). REMOVIDO.

3. **motion.div animate={{width, height}} com offsetWidth do innerRef**
   (commits f25541a, 6f351df): width nao crescia porque motion.div
   constrainava o filho, offsetWidth = width-atual = nunca mudava.

4. **scrollWidth/scrollHeight do innerRef** (commit 5edaa40): quando
   texto wrappa, scrollWidth = parent-constrained, nao natural. Bolha
   ficou squished, texto em 3-4 chars/linha. CATASTROFICO.

5. **CSS transition: width 1.1s + interpolate-size: allow-keywords**
   (commits 8aed04f, 8936c0b): framer-motion sobrescreve `style`
   inline matando a CSS transition. Mesmo se interpolate-size
   funcionasse, framer ganha. E user provavelmente nao tem o suporte
   browser de qualquer forma.

6. **Ghost div approach (render children 2x)** (commit 8be4f9f): ghost
   `position: absolute` nao estabelece width pro wrapper relativo,
   bolha colapsou pra 1 char wide. CATASTROFICO. Revertido em
   commit e73829b.

## Hipotese de solucao para proxima sessao

**Ghost div mas em PORTAL** (React Portal pra document.body) ou
posicionado `position: fixed; top: -9999px; left: 0; visibility:
hidden` para fugir do contexto do wrapper limitado. Ghost mede natural,
motion.div em flow anima W+H usando os valores medidos.

OUTRO caminho: usar duas refs SEPARADAS:
- outerWrapperRef: wrapper sem max-w-[85%], com width:fit-content
- mede com offsetWidth (livre)
- aplica em motion.div interno que tem max-w-[85%]

Talvez tambem valha investigar:
- @container queries com size containment
- CSS subgrid em browsers que suportam
- Pre-calculate widths via canvas measureText() para textos previsiveis

## Coordenacao multi-agente
- Agente paralelo: claude-consumo-nex-polish (active file no repo)
  Trabalha na tela de Consumo (LlmUsage). NAO toca em agent-message.tsx
  ou chat-panel.tsx. Sem conflito.
- Outros 2 active files (claude-agente-nex-inteligencia +
  claude-nex-bubble-storytelling) sao desta sessao - serao deletados
  no encerramento.

## Arquivos tocados nesta sessao (resumo)
- src/components/agent/agent-message.tsx (microinteracoes,
  BubbleSurface, ShimmerText, motion.li dos steps)
- src/components/agent/chat-panel.tsx (auto-scroll stick-to-bottom,
  FAB respiro)
- src/lib/agent/prompt/compose.ts (diretiva quantitativa + anti-loop)
- src/lib/agent/run-agent.ts (MAX_ITERATIONS 5->3 + integracao
  enhance-chips)
- src/lib/agent/enhance-chips.ts (NOVO - two-pass LLM)
- src/lib/agent/enhance-chips.test.ts (NOVO - 8 testes)
- src/lib/agent/suggestions-extractor.ts (NOVO - modulo puro)
- src/components/agent/consumo/usage-detail-inline.tsx (ajustes de
  espacamento)
- docs/superpowers/specs/2026-05-25-bubble-v4-spec.md (spec v3)
- docs/superpowers/plans/2026-05-25-bubble-v4-plan.md (plan v3)
- docs/superpowers/specs/2026-05-25-auto-scroll-v3-spec.md
- docs/superpowers/plans/2026-05-25-auto-scroll-v3-plan.md
- docs/superpowers/specs/2026-05-25-bubble-storytelling-spec.md
- docs/superpowers/specs/2026-05-25-bubble-scroll-extracao-prompt-spec.md
- docs/superpowers/plans/2026-05-25-bubble-scroll-extracao-prompt-plan.md

## Como retomar
1. ler este arquivo + HISTORY.md tail -50
2. ler agent-message.tsx funcao BubbleSurface (linha ~183)
3. testar abordagem Portal/fixed ou outerRef sem max-w
4. NAO repetir as 6 tentativas falhas listadas acima
