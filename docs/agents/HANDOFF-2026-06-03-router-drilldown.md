# Handoff , Monitoramento do Agente Nex (Backtest + Router) , 2026-06-03

Branch: `feat/router-ativacao-r2` (manter aberta). Dev local na :3000 servindo esta branch.

## O que JÁ está pronto e mergeado (PRs #45, #46, #47, #48 na main)
- Numeração de rodadas ancorada em R8 (recente = R24); pré-R8 viram "Teste".
- Fuso BRT (UTC-3) em gráficos e no prompt do agente.
- Gráfico "% Correto por dia": carry-forward + linha até hoje + tooltip com rodada / "Não houve rodada".
- Aba Router: coluna "Origem", filtro de origens (rodadas), tag `chat` (turno sem tool), drill-down por linha.
- Botão "Avaliar pendentes" (localhost-only) que dispara o PRÓPRIO Claude Code (headless) , NÃO GPT (docs/quality-judge-playbook.md, scripts/quality-audit/pendentes-io.ts).
- Reavaliação real da R24 + fix tool→domínio (cadastro→cadastros, preco→comercial, registrar_lacuna→dominios-vazios).
- Router ATIVO (routerEnabled=true, threshold 0,3, topK 3).

## O QUE FALTA (única pendência aberta) , drill-down do Router
PROBLEMA: ao clicar numa linha da aba Router, o painel de detalhe abre abaixo da
linha, mas o **banner amarelo "Roteamento divergente" (e a descrição da
similaridade) NÃO quebram o texto dentro da caixa** , a frase fica numa linha só
e é cortada na borda direita / gera sensação de vazamento.

CAUSA-RAIZ (já diagnosticada):
- O painel é renderizado DENTRO de um `<td colSpan={6}>` da tabela. A tabela tem
  6 colunas e é **mais larga que a viewport** (scroll horizontal). Logo o `<td>`
  herda a largura da TABELA, e o banner (bloco) quebra o texto só naquela largura
  enorme , fora da área visível. Não é problema de CSS de wrap; é a LARGURA do
  container que é maior que a tela.
- Tentativas que NÃO resolveram de forma confiável: medir a largura visível por
  `useRef`+`ResizeObserver` e por `callback ref` (`panelWidth`) e aplicar
  `width`/`sticky left-0` no painel; e `container-type:inline-size`+`100cqw`
  (caiu em fallback de viewport). `max-w` fixo o usuário REJEITOU.
- IMPORTANTE: o usuário NÃO quer que se mexa na formatação/larguras das LINHAS da
  tabela (já reverti para o original , não voltar a mexer nisso).

DESCOBERTA CRÍTICA do caminho (já resolvida, mas ficar atento): havia
**bundle de SSR velho** , `rm -rf .next` rodava com o processo segurando os
arquivos no macOS → hidratação divergente → React mantinha render antigo do
servidor → "nada mudava". SEMPRE reiniciar assim: matar todos os next/lsof:3000,
`sleep 4`, `rm -rf .next`, `sleep 1`, então `npm run dev`. Validar `0` no log:
`grep -icE "hydrat|didn.t match" /tmp/nexus-branch-dev.log`.

SOLUÇÃO RECOMENDADA (validada conceitualmente pelo usuário):
- Renderizar o painel de detalhe **FORA do scroller horizontal da tabela** (assim
  ele herda a largura do CARD = área visível, e o texto quebra naturalmente),
  porém **abrindo abaixo da linha clicada** (comportamento acordeão que o usuário
  exige: clica na linha → abre embaixo; clica em outra → abre embaixo dela).
- Abordagem sugerida: manter a tabela intacta; para a linha expandida, renderizar
  o `RouterDecisionDrilldown` num overlay/portal posicionado logo abaixo da `<tr>`
  com largura = largura do card (não do `<td>`). Ou reestruturar para um layout
  master-detail que não dependa de medição JS. Testar SEMPRE com refresh real e
  validando visualmente (o agente não tem login; pedir ao usuário OU usar headless
  com credenciais de dev , ADMIN_EMAIL/ADMIN_PASSWORD em .env.local).

## Arquivos relevantes
- `src/components/agent/router/router-decisions-table.tsx` (tabela + expansão; tem panelWidth/measureRef , o painel inline).
- `src/components/agent/router/router-decision-drilldown.tsx` (conteúdo do detalhe; banner em bloco, barras `mx-auto max-w-2xl`, threshold no título).
- Componente base `Table` (`src/components/ui/table.tsx`) JÁ tem `overflow-x-auto` próprio , cuidado com scroller duplo.

## Validação que falta
- Visual: abrir uma linha na aba Router em localhost:3000 e confirmar que o banner
  quebra o texto DENTRO da caixa, sem corte e sem rolagem lateral.

## Estado git
- Tudo commitado nesta branch (HEAD = fix do callback ref). `tsc` verde.
- Suíte: última rodada completa estava verde (2183) antes dos ajustes de UI; rodar `npx jest` ao retomar.
