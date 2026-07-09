# F6 , Construtor com metodologia (brainstorm guiado + motor de geração orquestrado)

> Spec de design. Branch `feat/nex-reconstrucao`. **F6 SÓ LOCAL** (nunca mergear
> para `main` sem aprovação explícita do usuário). Data: 2026-06-27.
> Status: **v3** (incorpora 2 reviews adversariais , ver §13). Pronta para o plano.

## 1. Contexto e problema

O Construtor de relatórios (F6) já tem uma **Jornada Guiada**: entrevista
conversacional (modo "jornada") → reflexo de entendimento → cards de opção →
botão Gerar → animação → refino em 2-pane. Hoje a IA monta a ficha
silenciosamente a cada turno; o "Gerar" promove a ficha a `SavedReport`.

O usuário pediu uma virada de qualidade e de método (palavras dele):

- A entrevista é uma fase de **brainstorm/coleta**: a IA entende a fundo, **uma
  pergunta de cada vez**, curta, preferindo **cards clicáveis**. Sem listas
  numeradas de escolha no texto, sem "próxima parte/camada".
- Quer **ver o progresso das perguntas** (X de N), estimado já na 1ª mensagem e
  **reajustado** quando ela perceber mais complexidade.
- O botão **Gerar fica ESCONDIDO** até a IA julgar a coleta completa. A IA **não
  titubeia**: se mandarem "gera logo", ela explica o que falta e não pula a
  qualificação.
- A **metodologia pesada** roda **só no clique do Gerar**, **nos bastidores**,
  **rápido**, com **tela de espera** (frases girando + barra de % real, sem tempo
  numérico).
- As revisões internas garantem **4 dimensões**: completude, visualização certa,
  estrutura/narrativa, inteligência/insight.

Decisões travadas (não rediscutir): bastidores; profundidade "equilibrado"; gate
liberado pela IA (Gerar escondido até elegível); motor orquestrado (Abordagem A);
espera com frases + barra % real; geração só no Gerar.

## 2. Objetivos e não-objetivos

**Objetivos:** brainstorm leve com roteiro **ancorado em dimensões reais** (X de
N) visível; Gerar escondido até elegível **por evidência objetiva**; motor de
geração orquestrado que roda só no Gerar e produz relatório melhor nas 4
dimensões; **progresso real** (SSE) → barra coerente + frases; loop de
**regenerar barato** pós-reveal; honestidade visível também na geração; tudo
testável (TDD), sem regressão.

**Não-objetivos (YAGNI):** não expor as fases internas; não rodar metodologia
pesada por turno; não mostrar tempo numérico; não tocar domínios fora do catálogo
(estoque); não mexer no Agente Nex (chat/WhatsApp); sem novas dependências;
sem deploy (F6 só local); não persistir métricas/notas da geração (diferido).

## 3. Princípio central , corrige a tensão "imersão x bastidores"

**A imersão mora na ENTREVISTA** (a conversa guiada, o roteiro que cresce, os
cards, o reflexo de entendimento). **A GERAÇÃO é deliberadamente opaca e termina
num reveal.** A spec proíbe "meio-expor" as fases internas na UI: a tela de espera
mostra frases amigáveis e específicas + barra de %, nunca os termos
blueprint/spec/plano nem o conteúdo das críticas.

## 4. Evidência objetiva sem build pesado (o eixo da correção)

> Reviews #1.1 e #2.3 (bloqueante): trocar o gate por `dimensoesTocadas`
> (auto-relato do modelo) destruiria a checagem de viabilidade-no-catálogo que o
> design original faz de propósito. Correção: o brainstorm captura **intenção
> estruturada leve** (não a ficha pesada, mas também não prosa solta), validada
> contra o catálogo **durante** a coleta.

### 4.1 Intenção estruturada

Durante a entrevista a IA registra, via tool `registrar_seccao_pretendida`, uma
lista leve de seções pretendidas , **sem** `config` completo, **sem** build:

```ts
// journey/intencao.ts  (pure)
export interface SeccaoPretendida {
  fato: string;                 // ex.: "fato_estoque_saldo"
  shapeDerivado?: string;       // resolve a fonte junto com `fato` (registry)
  template: ReportTemplate;     // KPIRow | BarChart | PieChart | LineChart | DataTable
  recorte?: string;             // "por armazem" | "por marca" | "por familia" ...
  rotulo?: string;              // nome curto que a pessoa usou
}
export interface IntencaoColeta {
  secoes: SeccaoPretendida[];
  semKpiDeclarado?: boolean;
}
```

A tool **valida cada seção contra o registry** (`obterContrato(fato, shapeDerivado)`
existe?) e **descarta com aviso na hora** o que estiver fora do catálogo (vendas,
financeiro, 3D) , a honestidade acontece na entrevista, não depois. Isso é a
**evidência objetiva** que o gate usa: não é booleano de auto-relato, é
fato↔fonte casado no catálogo real.

### 4.2 Gate de elegibilidade (Gerar escondido)

`entendimentoElegivel(s)` passa a olhar a **intenção estruturada** + roteiro:

- **dados:** existe ao menos uma `SeccaoPretendida` com `obterContrato` válido.
- **visualização:** existe seção com template de gráfico/tabela
  (BarChart/PieChart/LineChart/DataTable).
- **indicadores:** existe seção `KPIRow` **ou** `semKpiDeclarado === true`.
- **objetivo:** `entendimento` presente (>= 20 chars) **e** `turnosUsuario >= 2`.
- **roteiro cumprido:** todas as dimensões relevantes cobertas (§4.3).

Enquanto não elegível, `podeOferecerGeracao=false` → **o botão Gerar não
renderiza**. Mantém-se a natureza "por evidência" (fato↔fonte), só que sem montar
a ficha pesada por turno. Sem regressão do princípio original.

### 4.3 Roteiro ancorado em dimensões (sem número inventado, sem deadlock)

> Reviews #1.3, #2.1, #2.2 (bloqueante): número free-form do LLM + `respondidas`
> por contagem de turno => indicador falso, deadlock por superestimativa,
> "gera logo" empurrando o contador. Correção: **derivar o roteiro das 7
> dimensões reais** de `state.ts`, não de um inteiro livre.

```ts
// journey/roteiro.ts  (pure)  , DERIVADO, nao um contador paralelo
export interface RoteiroPerguntas { total: number; respondidas: number; etapas: string[]; }

export function roteiroDerivado(s: JourneyState): RoteiroPerguntas;
```

- `dimensoesRelevantes` (no `JourneyState`): começa com o **núcleo**
  (`objetivo, dados, visualizacao, indicadores`). A IA pode marcar **opcionais**
  (`filtros, layout, periodo`) como relevantes via tool
  `marcar_dimensao_relevante({ dimensao, motivo })` quando perceber complexidade
  , é aqui (e só aqui) que o `total` cresce, sempre **justificado**.
- `total = dimensoesRelevantes.length` (limite natural: **máx 7**, sem loop
  infinito). `respondidas = ` nº de dimensões relevantes **cobertas**. "Coberta"
  para o núcleo = tem evidência objetiva (§4.2); para opcionais =
  `dimensoesTocadas` marcada após captura real.
- **"gera logo" não avança o roteiro** (não cobre dimensão nova) → a firmeza
  (§4.4) e o indicador não brigam mais. O indicador é honesto: reflete dimensões
  cobertas, não turnos.
- **Sem retração do CTA:** assim que `podeOferecerGeracao` vira true, o `total`
  **congela** (a IA não marca novas dimensões relevantes depois de elegível) , o
  botão Gerar, uma vez exibido, não some (review #1.9).

### 4.4 Firmeza contra pressa (não titubear)

Regra de prompt: se pedirem para gerar antes de cobrir o roteiro, a IA **não
gera**, responde curto explicando *o que falta* (a dimensão pendente) e faz a
próxima pergunta. Defesa estrutural: o botão nem aparece e o backend só roda o
pipeline com `podeOferecerGeracao=true`; "gera logo" digitado volta como turno
normal. É defesa por gate, não só por prompt.

## 5. Motor de geração orquestrado (clique do Gerar)

> Reviews #2.5/#2.6 (material, YAGNI): `plano`+`revisao_plano` como fases LLM são
> cerimônia , ordenar 3-5 seções é determinístico. Correção: **4 fases**, só **2
> chamadas LLM** (blueprint + 1 revisão adversarial). Ordenação narrativa vira
> função pura no build.

### 5.1 Contrato

```ts
// agent/geracao/pipeline.ts
export type FaseGeracao = "blueprint" | "revisao" | "build" | "validacao";
export interface ProgressoGeracao { fase: FaseGeracao; pct: number; frase: string; }

export interface EntradaGeracao {
  entendimento: string;
  intencao: IntencaoColeta;     // a intenção estruturada coletada (nao só prosa)
  historico: { role: "user" | "assistant"; content: string }[];
  user: { id: string };
}
export interface SaidaGeracao {
  ficha: BuilderReportEntry;
  omitidos: string[];           // o que foi descartado fora do catálogo (VISÍVEL no reveal)
}
export async function pipelineGeracao(
  entrada: EntradaGeracao,
  onProgresso: (p: ProgressoGeracao) => void,
  deps?: GeracaoDeps,           // injeta cliente LLM (mock nos testes)
): Promise<SaidaGeracao>;
```

### 5.2 As 4 fases

1. **blueprint** , 1 chamada LLM (raciocínio **médio**). Recebe `intencao` +
   `entendimento` e devolve seções **machine-applicable**: schema **Zod** com os
   args EXATOS das tools de build , `{ template, fato, shapeDerivado, config }` por
   seção (eixos, métrica, recorte, título), filtros, e a **justificativa** ligada
   ao objetivo. Cada seção é validada contra `obterContrato(fato, shapeDerivado)`
   e `TEMPLATES_VALIDOS`; o que não casa vai para `omitidos`. (Review #1.2/#2.6:
   é o blueprint que produz config aplicável, não um "plano" depois.)
2. **revisao** , 1 chamada LLM **adversarial** (raciocínio **alto**),
   parametrizada pelas **4 dimensões**: aponta lacuna de completude, visual
   errado, narrativa fraca e falta de insight; devolve o blueprint **corrigido**
   (mesmo schema Zod) ou "sem reparos" **com justificativa por dimensão** (não
   pode carimbar). Acrescenta inteligência: ordena os destaques (ex.: estoque
   negativo no topo), sugere o KPI inteligente.
3. **build** , **sem LLM**, determinístico. Ordena as seções numa narrativa
   (`ordenarNarrativa`: panorama → comparação → detalhe, função pura) e aplica o
   blueprint via o **dispatcher de tools já existente** (`despachar`/handlers de
   `criar_relatorio`/`adicionar_secao`/`definir_filtro`), montando a
   `BuilderReportEntry`.
4. **validacao** , **sem LLM**. Checagem estrutural: toda seção com `fato` do
   catálogo, `template` válido, título; ao menos 1 visualização; KPIs quando
   pedidos. Repara o reparável. **Escopo honesto (review #1.10):** cobre
   completude/visual *estruturais*; narrativa/insight são responsabilidade da
   fase 2.

> Custo: **2 chamadas LLM** (blueprint médio + revisão alta). Build/validação sem
> LLM. Meta de tempo **~12-22s** (revisada para baixo, review #1.6/#2.11), a
> **confirmar no E2E**; se estourar, rebaixar revisão ou medir e ajustar a
> promessa (não descobrir tarde).

### 5.3 Progresso real → barra coerente (pesada por duração)

> Reviews #1.7/#2.4 (material): pct igual por fase faz a barra rastejar e saltar.
> Correção: pesar o pct pela **duração esperada** (fases LLM dominam; build/valida
> ~0) e animar **dentro** da fase por heartbeat real do stream de tokens.

`progresso.ts` (pure) define o mapa fase→(faixa de pct) + frases específicas:

```
blueprint  → 5%  ..55%   (fase LLM longa; barra avança por heartbeat de tokens)
revisao    → 55% ..92%   (fase LLM longa; idem)
build      → 92% ..97%   (rápido)
validacao  → 97% ..100%  (rápido)
```

- O pipeline emite `onProgresso` ao **entrar** na fase (pct base) e, durante as
  fases LLM, **heartbeats** conforme tokens chegam (avanço real dentro da faixa).
  A barra **nunca recua**; cada faixa corresponde a trabalho real. Sem vão morto
  parado nem salto de 92→100 instantâneo dominando a tela.
- **Frases girando** específicas por fase (não genéricas , review #2.8), trocando
  a cada ~2.5s com crossfade. Ex.: blueprint = "Entendendo o que vale destacar",
  "Escolhendo os gráficos certos"; revisao = "Conferindo se a história fica
  clara", "Checando se não falta nada importante".
- **reduced-motion:** sem giro/tween; barra avança por fase concluída.

### 5.4 Falhas e honestidade

- Erro/parse na **revisão**: degrada com elegância , segue com o blueprint da
  fase 1; ajusta pct/frase para **não anunciar** trabalho que não ocorreu (review
  #1.7).
- Erro no **blueprint** ou build vazio: emite `error` no SSE; a UI sai da espera e
  volta à entrevista com recado curto ("não consegui montar agora, me dá mais um
  detalhe?"). Nada quebrado é salvo (a ficha só promove se válida).
- **Honestidade visível (review #2.9, bloqueante de honestidade):** se
  `omitidos` não estiver vazio, o reveal mostra uma frase clara ("não incluí X
  porque ainda não há fonte"). Nunca descartar em silêncio.

### 5.5 Loop de regenerar barato (pós-reveal)

> Review #2.7 (material): toda a espera eleva expectativa; se decepciona, hoje cai
> no refino manual. Correção: um caminho de **re-rodar barato**.

Depois do reveal, além do refino 2-pane (que continua), um campo "ajustar e
regenerar": a pessoa diz em linguagem natural o que mudar ("o gráfico devia ser
por marca"); o backend **reaproveita o blueprint** da última geração + o ajuste e
re-roda **só blueprint(ajuste)+build** (sem nova entrevista, sem nova revisão por
padrão). Rápido. O blueprint da última geração é guardado no `journeyState`
(`ultimoBlueprint`), não persistido em tabela nova.

## 6. Transporte (SSE)

`/api/builder/stream` ganha:

- `{"type":"progress","fase","pct","frase"}` durante o pipeline (inclui
  heartbeats dentro das fases LLM, mantendo a conexão viva , review #1.6).
- `{"type":"roteiro","total","respondidas","etapas"}` ao fim de cada turno de
  brainstorm.
- `acao:"gerar"` **elegível** → roda `pipelineGeracao`; promove a ficha a
  `SavedReport` (fluxo de hoje) e emite `done` com `savedId/etag/ficha/omitidos/
  journeyState(fase=refino, ultimoBlueprint)`.
- `acao:"gerar"` **sem** elegibilidade → não roda pipeline; turno normal (IA
  explica o que falta).
- `acao:"regenerar"` → reaproveita `ultimoBlueprint` (§5.5).
- **`export const maxDuration`** na route ajustado para acomodar o pipeline
  (review #1.6). Tipos de front (`SseEvent`, `BuilderDonePayload`) ganham
  `progress`, `roteiro`, `omitidos`.

## 7. Limpeza da fase `resumo` (órfã)

> Review #1.5 (material): `FaseJornada="resumo"`, `montar_resumo` e o trecho da
> route ficam órfãos no fluxo novo (entrevista → Gerar → espera → refino).

O fluxo novo **não tem** etapa de resumo intermediária: a elegibilidade revela o
Gerar; o clique dispara o pipeline; o reveal cai no refino. Portanto:

- `FaseJornada` passa a `"entrevista" | "refino"` (remove `"resumo"`).
- Remove a tool `montar_resumo`/`montarResumo` e o tratamento de `fase==="resumo"`
  na route, e os componentes do resumo contestável (JourneySummary) , ou marca
  como mortos e remove com teste. Sem deixar caminho sem dono.

## 8. UI

> `ui-ux-pro-max` obrigatório em toda a UI, inline na sessão principal.

### 8.1 Indicador de roteiro (entrevista)
`roteiro-indicador.tsx`: pílula discreta "Pergunta 3 de 7" + segmentos
preenchidos. Topo da coluna (`max-w-2xl`), abaixo da tag de data; sutil. Quando
uma dimensão opcional vira relevante, **anima a inserção do novo segmento com um
micro-rótulo** do motivo (ex.: "+ recorte por marca") , o crescimento é raro e
justificado, não um "5→7" seco (review #2.10). Some no refino.

### 8.2 Botão Gerar escondido
Renderiza só com `podeOferecerGeracao`. Entrada com micro-animação. Não retrai
(total congela ao ficar elegível, §4.3). Sem placeholder enquanto escondido.

### 8.3 Tela de espera (geração)
`geracao-overlay.tsx`: barra de % real (preenchimento animado por heartbeat,
gradiente violeta) + frase girando específica (crossfade). Sem tempo numérico.
Microinterações sóbrias; respeita reduced-motion. Ao 100%, transição suave para o
2-pane do refino. Se `omitidos`, mostra a frase de honestidade no reveal.

### 8.4 Ajustar e regenerar (pós-reveal)
Campo discreto no refino: "ajustar e regenerar" → dispara `acao:"regenerar"` com
o texto, mostra a mesma overlay (mais curta). O refino 2-pane manual continua para
quem quiser editar à mão.

## 9. Dados / persistência

- `JourneyState` ganha (aditivo, **sem migration**, vai no Json existente):
  `intencao: IntencaoColeta`, `dimensoesRelevantes: Dimensao[]`,
  `ultimoBlueprint?` (para regenerar). Remove `resumo`.
- Ficha só vira `SavedReport` no Gerar (igual a hoje).
- `omitidos` viaja no `done` e some após o reveal (não persiste). `notas` da
  crítica: não persistidas (diferido, YAGNI).

## 10. Testes (TDD)

Puros (Jest, sem I/O):
- `intencao.ts`: registrar valida contra `obterContrato`; descarta fora do
  catálogo; `semKpiDeclarado`.
- `roteiro.ts`: `roteiroDerivado` = dimensões relevantes/cobertas; cresce só por
  dimensão marcada; teto 7; congela ao elegível.
- `state.ts`: gate por intenção+roteiro (evidência objetiva, não auto-relato);
  núcleo exige fato↔fonte; legado preservado (ver §11).
- `progresso.ts`: faixas monotônicas pesadas por duração; frases por fase não
  vazias e específicas.
- `geracao/blueprint|revisar|validar`: parse/Zod, args machine-applicable,
  descarte fora do catálogo (`omitidos`), justificativa por dimensão na revisão.
- `geracao/pipeline.ts`: com `clienteRoteirizado` (mock) encadeia 4 fases, emite
  progresso crescente (com heartbeats), devolve ficha válida; degrada quando a
  revisão falha (segue com blueprint, pct coerente); aborta limpo quando blueprint
  falha; `omitidos` propaga.
- `ordenarNarrativa`: panorama→comparação→detalhe.

Integração:
- `route.test`: `acao:"gerar"` elegível → `status → progress* → done(savedId,
  omitidos)`; sem elegibilidade → não roda pipeline; brainstorm → `roteiro`;
  `acao:"regenerar"` reusa blueprint.

UI:
- `roteiro-indicador`: X de N; cresce com micro-rótulo.
- `geracao-overlay`: barra segue pct dos eventos; frase troca; reduced-motion;
  honestidade de `omitidos`.

E2E real (`scripts/`): brainstorm → Gerar → relatório montado contra o cache
real; conferir seções coerentes, barra completa, **latência medida** (valida a
meta de §5.2).

## 11. Migração / legado

- `JourneyState` legado sem `intencao`/`dimensoesRelevantes`: ao carregar,
  inicializa `intencao={secoes:[]}` e `dimensoesRelevantes=[núcleo]`. Conversas em
  `fase:"resumo"` legado caem em `entrevista` (a fase some). Conversas com
  `SavedReport` linkado entram em `refino` (como hoje). Sem migration.
- Sem `roteiro` (legado): `roteiroDerivado` calcula a partir do núcleo; nunca cai
  num "gate antigo por ficha" (que ficaria preso, review #1.4).

## 12. Riscos e mitigação

- **Latência:** 2 chamadas LLM (blueprint médio + revisão alta) + heartbeat SSE +
  `maxDuration`. Medir no E2E; se >~22s, rebaixar revisão. (review #1.6/#2.11)
- **Auto-crítica vira carimbo:** revisão exige apontar por dimensão; "sem reparos"
  precisa justificar. (review pré-existente)
- **Barra incoerente:** pct pesado por duração + heartbeat real; nunca recua;
  degrade ajusta pct/frase. (review #1.7/#2.4)
- **Gate frouxo:** evidência fato↔fonte mantida (intenção estruturada), não
  auto-relato. (review #1.1/#2.3)
- **Roteiro travado/inflado:** derivado de dimensões finitas (≤7), congela ao
  elegível, "gera logo" não avança. (review #1.3/#2.1/#2.2)
- **Decepção pós-espera:** loop de regenerar barato + honestidade visível. (review
  #2.7/#2.9)
- **Custo por cliente:** turnos de brainstorm são high-reasoning (decisão do
  usuário) + 2 chamadas no Gerar. Documentado; sem custo escondido por turno de
  geração. (review #1.11)

## 13. O que mudou da v1 para a v3 (reviews aplicadas)

- Gate volta a ser **por evidência objetiva** (intenção estruturada validada no
  catálogo), não por `dimensoesTocadas` auto-relatado. [#1.1, #2.3]
- Roteiro **derivado das 7 dimensões reais** (teto 7, congela ao elegível,
  "gera logo" não avança), em vez de inteiro free-form + contagem de turnos.
  [#1.3, #2.1, #2.2, #1.9]
- Pipeline **6→4 fases / 2 chamadas LLM** (corta plano+revisao_plano; ordenação
  vira função pura). Blueprint emite seções machine-applicable com
  `shapeDerivado`+`config`. [#2.5, #2.6, #1.2]
- Barra de % **pesada por duração** + heartbeat real de tokens; SSE heartbeat +
  `maxDuration`. [#1.7, #2.4, #1.6]
- **Honestidade visível** na geração (`omitidos` no reveal). [#2.9]
- **Loop de regenerar barato** pós-reveal. [#2.7]
- **Limpeza da fase `resumo`** órfã. [#1.5]
- `EntradaGeracao` carrega **intenção estruturada**, não só prosa. [#1.8]
- Princípio explícito **imersão (entrevista) x bastidores (geração)**. [#2.8]
- Latência rebaixada e a **confirmar no E2E**; validação determinística com escopo
  honesto. [#1.6, #2.11, #1.10]

## 14. Plano de fases (execução)

1. `intencao.ts` (registrar/validar contra catálogo) + testes.
2. `roteiro.ts` (`roteiroDerivado`, dimensões, teto, congela) + testes.
3. `state.ts`: gate por intenção+roteiro; remove `resumo`; legado; testes.
4. Tools `registrar_seccao_pretendida` + `marcar_dimensao_relevante`; fios no
   run-builder (jornada não constrói ficha pesada); SSE `roteiro`; testes.
5. `progresso.ts` (faixas por duração + frases) + testes.
6. `geracao/blueprint.ts` (Zod machine-applicable + omitidos) + testes.
7. `geracao/revisar.ts` (4 dimensões, justificativa) + testes.
8. `geracao/build.ts` (`ordenarNarrativa` + dispatcher) + `validar.ts` + testes.
9. `geracao/pipeline.ts` (orquestra 4 fases, heartbeat, degrade, omitidos) + testes.
10. SSE: `acao:"gerar"` → pipeline + `progress` + `maxDuration`; promoção;
    `acao:"regenerar"`; route tests.
11. UI `roteiro-indicador` (ui-ux-pro-max) + Gerar escondido + fios.
12. UI `geracao-overlay` (ui-ux-pro-max) + reveal + honestidade + regenerar.
13. Prompt da jornada: roteiro (marcar dimensão), firmeza, registrar intenção, sem
    build; prompts do blueprint e da revisão (4 dimensões).
14. Verificação E2E real + `dev:fresh` + rebuild de container quando aplicável +
    medir latência.

## 15. Fora de escopo

Persistir notas/métricas da geração; domínios além de estoque; qualquer
deploy/produção (F6 só local).
