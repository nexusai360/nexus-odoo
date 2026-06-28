# F6 , Arquitetura do gerador de relatórios (reforma estrutural do cérebro)

> **Spec v3** (v1 → 2 reviews adversariais Opus aplicadas → v3). Branch
> `feat/nex-reconstrucao`. **F6 SÓ LOCAL, não sobe sem aprovação.** Data: 2026-06-28.
>
> **Supersede** `2026-06-28-f6-arquetipos-relatorio-design.md` ("3 arquétipos fixos
> de estoque" foi rejeitado: não escala e trata sintoma). Esta spec ataca a
> **arquitetura da geração** (o cérebro), não um relatório específico.
>
> O §11 registra, para rastreio, o que mudou da v1 para a v3 por causa das reviews.

## 1. O problema (estrutural, comprovado nas evidências)

O construtor gera um **Frankenstein**. Evidências reais (prints 2026-06-28 + o
relatório "Relatório de Estoque Nexus"):

- **KPIs com o mesmo número:** R$ 49.447.434,34 aparece em **três cartões**
  ("VALOR IMOBILIZADO", "VALOR TOTAL", "VALOR TOTAL" de novo). Rótulo literalmente
  duplicado e valores colidentes.
- **Título que mente sobre o dado:** seção "Ranking de itens com estoque negativo"
  renderiza **valor por marca/família** (JOHNSON R$ 45 mi). Título e dado não se
  falam.
- **Redundância visual:** quatro gráficos de barra horizontal quase idênticos
  (negativos, por armazém, por marca, por família) empilhados, sem hierarquia nem
  narrativa.
- **Filtros fixos e mortos:** barra fixa no topo com placeholders ("Marca (ex.:
  Matrix)", "Qualquer temp") que não filtram nada.
- **Entrevista que não converge:** 9 rodadas, quase tudo "sim / quero todos / os
  dois". O agente **acumula** cada resposta como "mais uma seção".

### 1.1 O alvo (régua de qualidade): dashboard "Consumo do Agente Nex"

`src/components/agent/consumo/consumo-content.tsx`. O que o torna excelente:
filtros-pílula não-fixos (período + range a partir de 22/05) que re-resolvem tudo
ao vivo; KPIs distintos com MI/BI/TRI e subtítulo ("≈ US$ 10.4995"); par tendência
(área interativa "Custo por dia" com setinha de mês) + donut "Distribuição por
provedor" com total no centro; tabela com drilldown inline + paginação de 3 zonas;
e uma narrativa: um assunto só, ângulos que conversam.

> **Correção honesta (review):** o que torna o Consumo "vivo" é o **eixo temporal**
> (custo por dia/hora + navegação). O domínio **estoque é quase todo snapshot** (a
> foto do momento). Logo a régua **não é** "ter o mesmo eixo temporal do Consumo";
> é "ter o mesmo nível de **diagramação, hierarquia, coerência e interatividade
> possível para o dado**". Ver §2.1 (régua por natureza do dado).

### 1.2 Causa raiz

1. **Não existe vocabulário semântico.** O LLM recebe `fato`+`shape` crus e inventa
   seções; sem o conceito de **métrica** (identidade, significado, unidade,
   recortes, série temporal) ele erra título↔dado e repete KPI.
2. **Geração free-form aditiva.** O prompt "designer" pede `secoes[]` livres; a
   curadoria (`curar-blueprint.ts`) só dedup por assinatura fraca + teto. Não força
   KPIs distintos por valor, título honesto, gráfico certo, nem narrativa.
3. **Relatório renderizado estático.** Resolvido server-side uma vez; sem filtros ao
   vivo.
4. **Entrevista mistura coleta com design.** Acumula tudo e vira bloco.

## 2. Princípio estrutural (a virada)

> A coerência não pode depender do "bom gosto" do LLM de runtime, nem de skills no
> runtime (Superpowers/ui-ux-pro-max são skills de **build-time**, do dev; o agente
> de runtime é só um LLM com prompt + tools MCP, **não invoca skill**). A
> inteligência de design fica **embutida por construção**. Incoerência tem que ser
> **impossível por invariante**, não "improvável por sorte".

Camadas de garantia, da mais forte à mais fraca:

1. **Gramática de composição** (build-time, código): só existem blocos opinativos e
   regras de arranjo. O LLM não emite layout fora da gramática.
2. **Revisor determinístico** (build-time, código, 0 token): força **todas** as
   invariantes resolvendo o dado quando preciso. É a rede que garante o resultado.
3. **Processo editorial do LLM** (runtime): o compositor escolhe; um **juízo
   semântico** (crítico) avalia o que código não consegue (a escolha responde à
   intenção? a narrativa faz sentido?). Multi-passo só onde agrega.

### 2.1 Régua por natureza do dado (snapshot vs temporal)

| Natureza | Exemplos (estoque) | Régua de qualidade da onda 1 |
|---|---|---|
| **Snapshot** (foto) | saldo, negativos, valor por armazém/marca/família, parados | KPIs distintos (valor não-colidente) + **1 ranking interativo** (filtro de recorte ao vivo + tooltip) + **1 tabela** (paginação; drilldown se houver detalhe). **Sem pílula de período** (não há tempo). |
| **Temporal** (série) | movimento entradas/saídas (mensal), top movimentados | Tudo do snapshot **+** bloco **tendência+distribuição** (área interativa mensal + donut), **se houver ≥4 pontos** reais; senão, degrada para barra/tabela. Pílula/seletor de período **mensal** só aqui. |

Isto mata o "padding": relatório de snapshot **não** inventa tendência onde não há
dado.

## 3. Arquitetura do cérebro

```
Entrevista convergente ──▶ Intenção curada (+ domínio detectado)
                                  │
   Catálogo de métricas ─────────┤   (vocabulário DERIVADO do registry,
   filtrado por RBAC + domínio    ▼    filtrado por papel/domínio do usuário)
                       ┌──────────────────────────────────────┐
                       │ Compositor (LLM, raciocínio alto, 1x) │
                       │  intenção + métricas + gramática       │
                       │  → PLANO (blocos + binds métrica→slot) │
                       └───────────────┬──────────────────────┘
                                       ▼
                       Resolve AMOSTRA leve (LIMIT/agregado) das métricas do Plano
                                       ▼
                       ┌──────────────────────────────────────┐
                       │ Crítico semântico (LLM, alto, 1x)     │
                       │  só juízo que código NÃO faz:          │
                       │  "responde à intenção? narrativa boa?  │
                       │   métrica certa p/ a pergunta?"        │
                       └───────────────┬──────────────────────┘
                                       ▼
                       REVISOR DETERMINÍSTICO (código, 0 token)
                       resolve valores e força TODAS as invariantes
                       (KPIs distintos por VALOR, teto de blocos por
                       PAPEL, título derivado da métrica, donut≤6,
                       tendência exige série≥4, narrativa)
                                       ▼
                       Build determinístico → BuilderReportEntry
                                       ▼
                       Renderer INTERATIVO (filtros de recorte ao vivo +
                       charts c/ tooltip + tabela; período mensal só no
                       bloco temporal)  ── caminho de preview SEM savedId
```

### 3.1 Catálogo de métricas semântico (DERIVADO do registry)

O conceito que falta, mas **sem virar terceira fonte de verdade**. O que a métrica
**sabe sobre o dado** é **derivado** de `source-registry.ts` (o `SourceContract`):

- `fato`, `shape`, `dimensoes`, `campos`, **`temSerieTemporal`** (= a fonte oferece
  shape `serieTemporal`) e `freshness` vêm do registry. **Nunca redeclarados à mão**
  (senão o catálogo mente, exatamente o risco da v1).
- O catálogo **só acrescenta o curado-humano**: `id` estável, `rotulo`, `descricao`
  (vira subtítulo do KPI / título da seção), `unidade`/`formato` (BRL, contagem
  MI/BI/TRI, %, dias), `pergunta` de negócio, `chartPreferido`/`chartsValidos`.
- **Filtrado por RBAC + domínio:** `listarMetricas({ papel, dominios })` entrega ao
  compositor **só o vocabulário acessível** (camada 1 do RBAC 7-camadas, decisão #6)
  e **só do(s) domínio(s) da intenção** (evita estourar o prompt; escala a todo o
  Odoo registrando métricas, não relatórios).

### 3.2 Gramática de composição (blocos + invariantes corrigidas)

Um relatório é uma sequência ordenada de **blocos** de um catálogo fechado,
desenhados com ui-ux-pro-max e os componentes reais do Consumo:

| Bloco | Componente | Slots | Papel narrativo |
|---|---|---|---|
| **Tira de KPIs** | `KpiCard` | 3 a 5 métricas escalares | panorama |
| **Tendência + distribuição** (composto) | `InteractiveAreaChart` + `DonutWithCenter` | 1 métrica temporal + 1 dimensão | análise (temporal) |
| **Ranking interativo** | `InteractiveBarChart` | 1 métrica + 1 recorte | análise (comparação) |
| **Tabela detalhe** | `ReportDataTable` | linhas + colunas | detalhe |

**Invariantes duras (corrigidas para matar os Frankensteins literais):**

1. **Exatamente 1 tira de KPIs**, no topo.
2. **KPIs distintos por VALOR RESOLVIDO, não só por identidade.** O revisor (3.4)
   **resolve** os escalares e remove cartões com valor colidente (tolerância), além
   de identidade/rótulo iguais. (Mata "mesmo número em 3 cards".)
3. **Título de seção SEMPRE derivado da métrica vinculada** (não texto livre).
   (Mata "negativos" exibindo "valor por marca".)
4. **Teto de blocos por PAPEL narrativo, independente de recorte:** no máximo **1
   bloco de comparação/ranking** e **1 bloco temporal** por relatório; o excedente
   vira tabela ou é cortado. (Mata as 4 barras quase iguais , a chave **não** inclui
   recorte.)
5. **Arco fixo:** panorama (KPIs) → análise (tendência/ranking) → detalhe (tabela).
   Ordenação imposta por código.
6. **Gráfico certo por dado** (regras ui-ux-pro-max viram código): tendência ⇒
   área/linha e **exige `temSerieTemporal` + ≥4 pontos** (senão degrada); comparação
   ⇒ barra ordenada desc com rótulo de valor, ≤15 categorias (senão tabela);
   proporção ⇒ donut **só ≤6 categorias** (senão barra).
7. **Teto total de blocos** (ex.: 5) para enxugar.
8. **Todo gráfico é interativo** (tooltip) e **filtrável** pelos filtros do
   relatório; barra estática + filtro fixo morto é proibido.

### 3.3 Processo editorial do LLM (cada passo tem que merecer a chamada)

- **Passo 1 , Compositor (alto, 1 chamada).** Recebe a intenção + as métricas
  acessíveis (3.1) + a gramática (em prompt). Devolve o **Plano** (estrutura fechada
  validada por Zod): título, objetivo, blocos ordenados com binds (métrica→slot,
  recorte, filtros iniciais). Não emite componentes; emite escolhas dentro da
  gramática.
- **Resolve amostra leve.** Antes do crítico, um **resolvedor de preview** devolve só
  o que se precisa para julgar: cardinalidade por dimensão, top-N, faixa de valores,
  nº de pontos da série, e os escalares dos KPIs. Usa LIMIT/agregado (não resolve o
  dataset inteiro). Ordem: binds → amostra → crítico → revisor → build → resolução
  final no render.
- **Passo 2 , Crítico semântico (alto, 1 chamada).** **Não** re-checa invariante
  (isso é do revisor determinístico, grátis). Faz só o **juízo que código não faz**:
  "este conjunto de métricas responde à intenção do usuário?", "a métrica escolhida é
  a resposta certa para a pergunta?", "a narrativa tem sentido para um humano?",
  "falta o recorte que o usuário pediu?". Devolve Plano ajustado + justificativa.
- **Sem passo de cross-domínio na onda 1** (só estoque registrado; seria maquinário
  morto). Reintroduzido quando houver 2+ domínios com fatos.

> **Por que o crítico merece a chamada:** "responde à intenção" e "narrativa faz
> sentido" são juízos semânticos que invariante de código não cobre. Se o E2E
> mostrar que o compositor sozinho + revisor determinístico já bastam, o crítico vira
> opcional (a contagem de chamadas foi liberada pelo usuário, mas cada chamada tem
> que agregar; esta agrega na qualidade de **intenção**, não de forma).

### 3.4 Revisor determinístico (rede final que GARANTE, código, 0 token)

Recebe o Plano e, **resolvendo os valores quando necessário** (a tira de KPIs e
cardinalidades), força todas as invariantes do 3.2 antes do build: dedup de KPI por
**valor colidente** + identidade; título sempre derivado da métrica; teto de blocos
por **papel** (corta ranking/temporal excedente); donut→barra se >6; exige série≥4
para tendência (senão degrada); reordena no arco. Substitui `curar-blueprint.ts` por
uma versão muito mais forte, testada por invariante (TDD).

**Extensão ao refino (fecha o backdoor):** o caminho de refino (`mutators.ts` +
`stream/route.ts`) **também** passa pelo revisor antes de persistir o `SavedReport`,
e **título de seção deixa de ser texto livre** (sempre derivado da métrica;
`definirTituloSecao` arbitrário é removido/neutralizado e `editarSecao` reavalia o
título ao trocar métrica). Sem isso, o título-que-mente renasce no refino.

### 3.5 Renderer interativo (no nível possível para o dado)

- **Filtros do relatório, não-fixos** (rolam junto):
  - **Recorte** (armazém/marca/família/faixa de dias): em todo bloco; mudar
    re-resolve **ao vivo**. É a interatividade universal do snapshot.
  - **Período mensal:** **só** no bloco temporal (movimento), com granularidade
    **mensal** (não o `PeriodPills` day-based). Net-new (ver §4).
- **Caminho de filtro do PREVIEW (sem savedId):** a re-resolução ao vivo durante a
  geração resolve a partir do `BuilderReportEntry` **em memória** (não exige
  `obterRascunho(savedId)`). Para o relatório **salvo**, reusa
  `relatorio-filtros.ts`/`carregar-relatorio-dinamico.ts`. (Na v1, esses só serviam
  a relatório salvo; o preview interativo precisava de caminho próprio.)
- **Charts:** tooltip no hover (já existe nos componentes do Consumo). A **setinha de
  navegação de período** (máquina de estado de ~150 linhas no Consumo) é **escopada
  como net-new mensal** e **condicional** (só com ≥4 meses); na falta, área simples
  com tooltip, sem navegação.
- **Tabela:** paginação 3 zonas + resultados/página (já no `ReportDataTable`).
  **Drilldown inline é net-new** (hoje o componente não expande linha; o do Consumo é
  bespoke em `consumo-content`); onda 1 entrega drilldown **se** o produtor preservar
  detalhe por linha, senão tabela sem expansão (decisão no plano).
- **Subtítulo do KPI:** ligar `descricao` da métrica → prop `subtitle` do `KpiCard`
  (hoje o renderer passa `hint` fixo "no período"). Net-new pequeno.
- **Freshness:** cada métrica expõe a última sync do fato; o renderer mostra
  "atualizado há Xs" (decisão canônica #2; hoje os produtores retornam
  `freshness:null`, então precisa ser populado).

### 3.6 Entrevista convergente + "gerar já" reconciliado

A jornada para de acumular. Meta: do pedido a um Plano gerável em **≤3 perguntas**
de verdade, ou direto.

- O agente extrai uma **intenção curada** (objetivo + recortes + janela), não uma
  pilha de seções. Pergunta só o que muda o desenho.
- **"Gerar já" = template determinístico do domínio (0 LLM no atalho).** Pular a
  entrevista **não** cai no compositor livre (que geraria salada por falta de
  contexto). Cai num **template-padrão por domínio**: lista fixa de blocos+métricas
  montada por código, coerente por si. O LLM entra só no **refino opcional** depois.
- **Reconciliar com a "firmeza contra pressa"** já codada em `prompt-jornada.ts`: o
  gate atual esconde o Gerar até ter objetivo+dado+visual+indicadores e manda **não**
  gerar sob pressa. O novo gate: domínio detectado ⇒ "gerar já" liberado via
  template determinístico; a entrevista vira **refino** do template, não pré-requisito.
  Reescrever/remover a seção de firmeza para não brigar em runtime.

### 3.7 Preview/canvas limpo (pedido explícito)

- **Arrancar** canvas/pan e **todas** as animações de mão.
- Manter só **zoom (redimensionar)** + **rolagem vertical**.
- Botão **ampliar que esconde a conversa** (não modal); **X** traz de volta.
- **Remover a barra de filtro fixa** (substituída pelos filtros do relatório, §3.5).
- Arquivos: `builder-workspace.tsx`, `builder-preview.tsx`, `builder-chat-panel.tsx`.

## 4. Reuso vs criar (corrigido pelas reviews)

**Reusar quase como está:** `source-registry.ts`, `resolve-source.ts`,
`shape-adapters.ts`, queries `reports/queries/*`; componentes `KpiCard`,
`InteractiveAreaChart`, `InteractiveBarChart`, `DonutWithCenter`, `ReportDataTable`,
`PageJumpNavigator`; `build.ts`/`tool-bridge.ts`/`mutators.ts` (Plano→entry via
dispatcher, **adaptados** ao Plano e à seção composta); `progresso.ts`,
quota/`logUsage`, SSE `stream/route.ts`.

**Criar / reescrever (reclassificado , não era reuso):**
- **Novo:** catálogo de métricas derivado do registry (3.1); gramática + tipos do
  `Plano` (3.2); resolvedor de **amostra leve** (3.3); **revisor determinístico
  forte** substituindo `curar-blueprint.ts` (3.4).
- **Novo (seção composta):** tipo de seção **tendência+distribuição** no Plano +
  branch dedicado no renderer (área+donut) + mutator. **Não** era "1 seção = 1
  template".
- **Novo (temporal):** `periodoDe/periodoAte` em `FiltrosFonte` → produtores →
  `resolve-source` → `FiltrosRuntime` → `relatorio-filtros`, granularidade **mensal**;
  navegador mensal condicional (≥4 pontos). Hoje as queries aceitam `periodoDe/Ate`
  mas **nada** no builder usa.
- **Novo (preview ao vivo):** caminho de re-resolução do preview a partir do entry em
  memória (sem savedId).
- **Novo (drilldown):** expansão de linha no `ReportDataTable` (ou onda 1 sem
  drilldown) + preservar detalhe por linha no produtor.
- **Novo (pequenos):** `subtitle` do KPI por métrica; `freshness` populado e exibido.
- **Reescrever:** `blueprint.ts` → compositor; **novo** crítico semântico (3.3).
- **Ajustar:** entrevista + "gerar já" (3.6); preview/canvas (3.7); estender
  invariantes ao refino (3.4).

## 5. Eficiência e custo

- Entrevista: de ~9 trocas para ≤3 (ou "gerar já" determinístico, 0 LLM).
- Geração: **2 chamadas de alto raciocínio** no caminho feliz (compositor + crítico
  semântico); revisor, amostra e build são código. A amostra é leve (LIMIT/agregado),
  não duplica o dataset inteiro. Regenerar reusa Plano + amostra.
- "Gerar já": **0 chamada** (template determinístico).

## 6. Definição de pronto (qualidade comprovada)

- **Invariantes testadas (TDD)** cobrindo os casos exatos do Frankenstein: KPI com
  valor colidente é removido; 4 barras de recortes distintos viram 1 ranking;
  título sempre bate com a métrica; donut>6 vira barra; tendência sem série≥4
  degrada; refino não reintroduz título mentiroso.
- **E2E contra dado real (regra de raiz §9 CLAUDE.md):** subir o serviço, popular
  fatos, gerar relatórios de várias intenções de estoque e conferir na UI: KPIs não
  repetem valor, títulos batem, filtros de recorte mudam os gráficos ao vivo,
  paginação (e drilldown se escopado) funcionam, nada de Frankenstein, e "gerar já"
  entrega um relatório coerente.
- **Régua visual** (ajustada à natureza do dado, §2.1): diagramação, hierarquia e
  interatividade no nível possível; lado a lado com o Consumo no que é comparável
  (KPIs, ranking, tabela, e o par temporal quando há série).
- **Latência:** medir o caminho feliz; alvo ≤25s; ajustar raciocínio se passar.

## 7. Escopo (onda 1) e não-objetivos

- **Onda 1:** domínio **estoque**. Arquitetura genérica (catálogo derivado +
  gramática), mas só estoque registrado; demais domínios entram em ondas seguintes só
  registrando métricas, sem tocar o cérebro.
- **Não-objetivos:** não hardcodar relatórios prontos (o entregável é o **gerador**,
  não um relatório); não cross-domínio na onda 1; não subir a produção (F6 só local).

## 8. Riscos remanescentes (vigiar na execução)

- A **série mensal de movimento pode não ter ≥4 pontos** (sync recente): o bloco
  temporal precisa degradar com elegância (sem buraco visual). Confirmar contra o
  dado real antes de prometer o par temporal.
- O **resolvedor de amostra** tem que ser de fato leve; medir o custo de I/O.
- O **template-padrão por domínio** do "gerar já" precisa ser forte por si (é a cara
  do produto para quem pula a entrevista).
- **Re-resolução ao vivo** re-resolve hoje todas as seções; na onda 1 aceitar isso
  explicitamente ou cachear por (fato, shape, filtros). Corrigir de passagem o gap de
  `armazemId/familiaId` em `filtrosDaSecao`.

## 9. Métricas de estoque para a onda 1 (do `source-registry`)

Snapshot: `fato_estoque_saldo` (valor total, produtos, negativos), `*_armazem`
(valor por armazém), `*_marca`/`*_familia` (valor por marca/família), `*_parados`
(parados, valor imobilizado). Temporal: `fato_estoque_movimento` (entradas/saídas
mensal), `*_top_movimentados`. O catálogo expõe cada uma como métrica curada
(rótulo, pergunta, formato), derivando shape/série/dimensões do contrato.

## 10. Fluxo de execução (alto nível, detalhar no plano)

1. Catálogo de métricas derivado + filtrado (RBAC/domínio).
2. Gramática + tipos do `Plano` + revisor determinístico (TDD por invariante).
3. Resolvedor de amostra leve.
4. Compositor (reescreve `blueprint.ts`) + crítico semântico.
5. Build adaptado (seção composta) + seção composta no renderer.
6. Plumbing temporal mensal + filtros de recorte ao vivo + preview sem savedId.
7. Drilldown/subtítulo/freshness.
8. Entrevista convergente + "gerar já" determinístico + reconciliar firmeza.
9. Limpeza canvas/preview.
10. E2E contra dado real + medição de latência.

## 11. Mudanças da v1 → v3 (reviews aplicadas, rastreio)

- Invariante de gráfico redundante: de "(tipo+métrica+recorte)" para **teto por
  papel narrativo** (matava as 4 barras). [A#1]
- KPI distinto: de "por identidade" para **identidade + valor resolvido colidente**;
  revisor resolve os escalares. [A#2]
- Par área+donut+setinha: de "reuso/só ligar" para **seção composta net-new** (Plano
  + renderer + mutator). [A#3]
- Setinha/PeriodNavigator: reconhecida como **máquina de estado net-new mensal e
  condicional** (≥4 pontos), não prop reaproveitável. [A#4]
- Filtro temporal: **plumbing net-new** (5 arquivos), granularidade **mensal**, só no
  movimento; resto é snapshot com recorte. [A#5, B#1]
- Régua de pronto: reescrita por **natureza do dado** (snapshot vs temporal), sem
  exigir paridade temporal universal com o Consumo. [A#6]
- Crítico LLM: de "audita contra regras" (redundante) para **juízo semântico** que
  código não faz; invariantes 100% no revisor determinístico. [A#7, B#4]
- Backdoor do refino: invariantes **estendidas ao refino**; título sempre derivado.
  [A#8]
- Catálogo: **derivado do registry** (não 3ª fonte que mente sobre série). [A#9]
- Drilldown da tabela: reclassificado como **net-new**. [A#10, B#2]
- Re-resolução ao vivo: granularidade por-seção é **decisão explícita** (cache ou
  aceitar total). [A#11]
- Preview ao vivo: **caminho próprio sem savedId** (a infra citada exigia salvo).
  [B#3]
- "Gerar já": **template determinístico por domínio** + reconciliar "firmeza contra
  pressa". [B#5, B#6]
- Freshness ("atualizado há Xs"): **requisito explícito** no render/catálogo. [B#7]
- RBAC camada 1: catálogo **filtrado por papel/domínio**. [B#8]
- Passo cross-domínio: **removido da onda 1**. [B#9]
- Subtítulo do KPI: **ligar** descrição→subtitle (não estava pronto). [B#10]

> **Status:** v3 (2 reviews adversariais aplicadas). Próximo: plano v1 → 2 reviews
> (granularidade/integração/testabilidade) → plano v3 → execução TDD com
> ui-ux-pro-max inline na UI. F6 não sobe sem aprovação.
