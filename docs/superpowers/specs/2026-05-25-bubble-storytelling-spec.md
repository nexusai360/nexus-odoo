# Spec — Storytelling da bubble do Agente Nex (animacoes em paralelo)

Data: 2026-05-25
Autor: claude-nex-bubble-storytelling
Status: v1 (implementada nesta sessao)

## Problema

Apos as primeiras tentativas de animacao, o usuario reportou que a transicao
entre "Pensando", "Consultou faturamento" e a resposta final continuava
sentindo eventos discretos. Variante sequencial (texto aparece SO depois da
trilha colapsar) ficou pior: o texto demorava demais para chegar e a
sensacao de fluido se perdia.

## Experiencia alvo (na palavra do usuario)

1. Click em sugestao OU envio de mensagem.
2. "Pensando" aparece na bolha (shimmer no header + ShimmerText).
3. **Sutilmente** o campo da mensagem cresce e aparece "Consultando
   faturamento" dentro da mesma bolha.
4. Fica ali enquanto o backend trabalha.
5. Quando a resposta chega, a **mesma bolha** cresce de novo, deslizando ate
   o tamanho final. Texto entra **palavra a palavra, rapido, como digitando**.
6. **EM PARALELO** com a digitacao:
   - "Consultando faturamento" se recolhe (animacao de recoil para cima).
   - Header "Pensando" muda para "Raciocinio . 1 etapa . Xs".
   - Bolha continua crescendo suavemente.

Tudo na mesma cena, sem hierarquia temporal entre os efeitos.

## Decisoes de implementacao

| Decisao | Por que |
|---|---|
| `AssistantBodyReveal` sem delay | Texto entra imediato ao primeiro token; nada de esperar trilha colapsar antes. |
| `BubbleSurface` motion.div `layout="size"` | Bolha interpola altura suave conforme conteudo cresce e trilha colapsa. |
| Trilha collapse 500ms (era 300ms) com easing expo-out | Sensacao de recoil puxando para o header, em vez de sumico abrupto. |
| Steps internos com `-translate-y-1` quando colapsado | Reforca o recoil visual: lista sobe ao desaparecer. |
| Header morph com `AnimatePresence mode="wait"` | "Pensando" -> "Raciocinio" cross-fade 380ms com fade+slide+blur. |
| `Sparkles` <-> `Chevron` cross-fade scale 320ms | Icone morfa em vez de swap. |
| Step icon `running` <-> `done` cross-fade 300ms | Continuidade visual; nada salta. |
| `StreamingText` 220ms por palavra, stagger ate 80ms | Sensacao de digitacao viva, sem arrastar. |

## Mudancas de arquivo

- `src/components/agent/agent-message.tsx`
  - Novo `BubbleSurface` com `layout="size"` (substitui div fixa).
  - `AssistantBodyReveal` sem delay.
  - Trail collapse mais expressivo + recoil dos steps.
  - Header morph + icone morph mantidos.
- `src/components/agent/suggestions-bar.tsx`
  - Pills com `text-left + whitespace-normal + max-w-full + rounded-2xl`.
  - Quando texto quebra linha, segunda linha alinha pela esquerda
    (corrige bug de centralizacao em "Liste as 10 maiores clientes...").
- `src/app/globals.css`
  - `nexWordIn` volta para 220ms (typewriter rapido).

## Verificacao

- `npx tsc --noEmit` verde.
- Visual: subir dev server, abrir bubble, clicar sugestao, observar
  transicao continua entre os 3 estados sem cortes.

## Decisoes NAO tomadas

- Reescrever LoadingBubble: nao faz sentido, a arquitetura "uma so bolha"
  ja eliminou a duplicacao no commit 4517ed5.
- Mudar prompt para forcar "os 10 maiores clientes" em vez de "as 10
  maiores clientes": texto vem do LLM; nao engessar no codigo.
