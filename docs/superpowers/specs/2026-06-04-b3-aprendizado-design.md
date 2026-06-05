# B3 , Aba "Aprendizado" (design / spec v3)

> Sub-projeto do "Monitoramento Bubble + Aprendizado". Depois de B1 (feedback na
> bubble) e B2 (aba Bubble + perícia + deep-link), o B3 fecha o ciclo: **cruzar
> o que o usuário avaliou com o que a plataforma periciou**, achar onde o agente
> erra e dar matéria-prima para corrigir.

## 1. Objetivo

Aba `Aprendizado` (4ª aba do Monitoramento, super_admin, read-only) que transforma
os dados JÁ existentes (`MessageFeedback` = Avaliação do usuário;
`ConversationQualityEvaluation` = Perícia da plataforma) em sinal de aprendizado.
Sem schema novo. Sem tocar Odoo/MCP (decisões #1/#2).

## 2. Escopo v1 (o que entra)

Cruzamento por `assistantMessageId` (ambos os modelos têm o campo) das mensagens
**in_app reais** (canal `in_app`; replay/backtest fica de fora, igual à aba Bubble)
que têm **ao mesmo tempo** um voto do usuário e uma perícia terminal.

1. **Matriz de concordância (Avaliação × Perícia).** 4×4 (CORRETO/PARCIAL/ERRADO/
   ALUCINOU nos dois eixos; o status do juiz colapsa nos 4 baldes via
   `periciaBucket`: FORA_DO_ESCOPO→ALUCINOU, FALHA_TECNICA→ERRADO). Diagonal =
   concordância. KPIs: **% concordância**, **nº de mensagens cruzadas**, **nº de
   discordâncias**.

2. **Discordâncias (lista priorizada).** Mensagens onde o balde do usuário ≠ o
   balde do juiz. Cada linha: pergunta (snapshot), avaliação do usuário +
   comentário (texto do voto negativo do B1), perícia + razões, modelo, e
   **link pro Backtest** (`?eval=` , reusa o deep-link da Fatia 4). Ordenadas por
   severidade: primeiro onde **o juiz se acha certo e o usuário discorda** (juiz
   superestimou , o caso mais perigoso), depois pelo tamanho do gap.

3. **Padrões de erro.** Agregado dos `patterns` das perícias não-corretas
   (efetivas) das conversas in_app, contados desc (onde focar / "localizar o
   erro"); e a lista dos **comentários negativos do usuário** (matéria-prima de
   correção), cada um com link pro Backtest.

## 3. Fora de escopo v1 (deferido, com motivo)

- **Autocorreção / geração de correções de código pelo agente.** É a parte mais
  ambiciosa e **unbounded**; exige design próprio (qual artefato corrige, como
  validar, gate humano, risco de regressão) e não cabe ser construída
  autonomamente sem requisitos finos. Fica como **onda B3.2** (registrar em
  RADAR). O v1 entrega o diagnóstico que alimenta essa correção (humana por ora).
- **Clusterização semântica (pgvector)** dos comentários/erros: a infra antiga
  (`recomendacaoEmbedding`) está deprecada; reintroduzir embedding é onda futura.

## 4. Decisões

- **Fórmula de acerto:** a mesma do B2 (`computeAccuracy` = certos/total), para
  consistência entre abas.
- **Status efetivo:** perícia usa `humanStatus ?? status` (ajuste humano manda),
  igual ao resto do monitoramento.
- **Só in_app real:** o cruzamento ignora `backtest`/`playground`/`whatsapp` (o
  voto do usuário hoje só existe na bubble in_app; manter o recorte coerente com
  a aba Bubble).
- **Pura e testável:** matriz, severidade e agregação de patterns em helpers
  puros (`aprendizado-helpers.ts`), com testes; a action só busca e monta.

## 5. Reviews (críticas aplicadas)

- **Review #1 → v2:** risco de "discordância" inflada por perícia PENDENTE
  (não-terminal). Correção: só cruza perícia terminal (`periciaBucket != null`).
  Risco de poluição por replay: aplicar o mesmo filtro `channel: in_app` da Bubble.
- **Review #2 → v3:** severidade precisa destacar o caso "juiz certo, usuário
  errado" (overconfidence) e não só o gap absoluto. Correção: severidade =
  `(judgeScore - userScore)` primário (positivo = juiz superestimou) + gap como
  desempate. Adicionado o link pro Backtest em cada discordância e em cada
  comentário (sem isso o admin não navega da causa pro detalhe). Numeração/labels
  reusam `EvalStatusBadge`/`RATING_META` (sem reinventar cores).

## 6. Entregáveis

- `src/lib/actions/aprendizado-helpers.ts` (puro) + `aprendizado.ts` (action).
- `src/app/(protected)/agente/monitoramento/aprendizado/page.tsx`.
- 4ª aba em `monitoramento-nav.tsx`.
- `src/components/agent/monitoramento/aprendizado-content.tsx` + sub-componentes.
- Testes dos helpers + da action (mock prisma, padrão da casa).
