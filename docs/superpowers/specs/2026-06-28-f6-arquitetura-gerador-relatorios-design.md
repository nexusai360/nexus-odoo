# F6 , Arquitetura do gerador de relatórios (reforma estrutural do cérebro)

> Spec de design (v1, entra em 2 reviews adversariais antes do plano). Branch
> `feat/nex-reconstrucao`. **F6 SÓ LOCAL, não sobe sem aprovação.** Data: 2026-06-28.
>
> **Supersede** `2026-06-28-f6-arquetipos-relatorio-design.md` (a ideia de "3
> arquétipos fixos de estoque" foi rejeitada pelo usuário: não escala ao escopo
> gigante do Odoo e tratava o sintoma, não a raiz). Esta spec ataca a **arquitetura
> da geração** (o cérebro), não um relatório específico.

## 1. O problema (estrutural, comprovado nas evidências)

O construtor gera um **Frankenstein**. Evidências reais (prints 2026-06-28 + o
relatório "Relatório de Estoque Nexus"):

- **KPIs repetidos/sem sentido:** o mesmo número (R$ 49.447.434,34) aparece em
  três cartões ("VALOR IMOBILIZADO", "VALOR TOTAL", "VALOR TOTAL" de novo). Rótulo
  literalmente duplicado.
- **Título que mente sobre o dado:** seção "Ranking de itens com estoque negativo"
  renderiza **valor por marca/família** (JOHNSON R$ 45 mi). O título e o dado não
  se falam.
- **Redundância visual:** quatro gráficos de barra horizontal quase idênticos
  (negativos, por armazém, por marca, por família) empilhados, sem hierarquia nem
  narrativa.
- **Filtros fixos e mortos:** barra fixa no topo com placeholders ("Marca (ex.:
  Matrix)", "Qualquer temp") que não filtram nada ao vivo.
- **Entrevista que não converge:** 9 rodadas, quase tudo "sim / quero todos / os
  dois". O agente **acumula** cada resposta como "mais uma seção" e despeja uma
  seção por dimensão coletada.

### 1.1 O alvo (a régua de qualidade): dashboard "Consumo do Agente Nex"

`src/components/agent/consumo/consumo-content.tsx`. O que faz ele ser excelente:

- **Filtros-pílula não-fixos** (Hoje / Esta semana / Este mês / Tudo /
  Personalizado com date range a partir de 22/05/2026) + dropdowns de recorte;
  mudar qualquer um **re-resolve e re-renderiza tudo ao vivo**.
- **KPIs distintos** (Conversas, Chamadas, Tokens entrada, Tokens saída, Custo
  total), abreviação MI/BI/TRI correta, subtítulo (ex.: "≈ US$ 10.4995" no custo).
- **Par tendência + distribuição:** área interativa "Custo por dia" com **setinha
  de navegação de período** (JUN/26 ◄ ►) ao lado do donut "Distribuição por
  provedor" com total no centro. Tooltip no hover com valor exato.
- **Tabela com drilldown** (expandir a linha), colunas definidas, **paginação de 3
  zonas** (mostrando X-Y de N | navegação + page-jump | resultados por página).
- **Narrativa:** um assunto só (custo/uso) visto por ângulos que conversam.

### 1.2 Causa raiz (por que o cérebro produz salada)

1. **Não existe vocabulário semântico.** O LLM recebe "fatos" e "shapes" crus e
   inventa seções. Não há um conceito de **métrica** (identidade, significado,
   unidade, recortes válidos, se tem série temporal). Sem isso ele erra o
   título↔dado e repete KPI.
2. **A geração é free-form aditiva.** O prompt "designer" pede `secoes[]` livres; a
   curadoria determinística (`curar-blueprint.ts`) só faz dedup por assinatura
   fraca e teto de contagem. Não força KPIs distintos, título honesto, gráfico
   certo, nem narrativa.
3. **O relatório renderizado é estático.** Resolvido server-side uma vez; sem
   filtros-pílula ao vivo, sem interatividade real (ao contrário do Consumo).
4. **A entrevista mistura coleta com design.** Acumula tudo que o usuário diz e
   transforma cada item num bloco.

## 2. Princípio estrutural (a virada)

> **A coerência não pode depender do "bom gosto" do LLM de runtime, nem de skills
> no runtime.** Superpowers e ui-ux-pro-max são skills de **build-time** (do dev).
> O agente de runtime é só um LLM com prompt + tools MCP; ele **não invoca skill
> nenhuma**. Logo, a inteligência de design tem que estar **embutida, por
> construção**, num sistema que o LLM apenas preenche e refina. Incoerência deve
> ser **impossível por invariante**, não "improvável por sorte".

Três camadas de garantia, da mais forte para a mais fraca:

1. **Gramática de composição** (build-time, código): só existem blocos opinativos e
   regras de arranjo. O LLM não pode emitir layout fora da gramática.
2. **Processo editorial do LLM** (runtime, multi-passo): compositor propõe, crítico
   refina contra as regras de design e a realidade do dado. Pode gastar várias
   chamadas, desde que cada uma agregue valor (o usuário liberou a contagem).
3. **Revisor determinístico** (build-time, código): rede final que rejeita/conserta
   qualquer violação de invariante, independente do que o LLM fez.

## 3. Arquitetura do cérebro

```
Entrevista convergente ──▶ Intenção curada
                                  │
        Catálogo de métricas ─────┤
        semântico (vocabulário)   ▼
                       ┌─────────────────────────────────┐
                       │  PROCESSO EDITORIAL (LLM, N passos)
                       │  1. Compositor (raciocínio alto):  │
                       │     intenção + métricas → PLANO    │
                       │     (blocos da gramática + binds)  │
                       │  2. Crítico/refinador (alto):      │
                       │     audita plano vs regras+dado    │
                       │     → plano corrigido              │
                       └───────────────┬─────────────────┘
                                       ▼
                       Revisor determinístico (código, 0 LLM)
                       força invariantes (KPIs distintos,
                       título↔dado, chart certo, narrativa)
                                       ▼
                       Build determinístico → BuilderReportEntry
                                       ▼
                       Renderer INTERATIVO (filtros-pílula ao
                       vivo + charts interativos + drilldown),
                       reusando a infra real do Consumo
```

### 3.1 Catálogo de métricas semântico (a base da inteligência)

O conceito que falta. Hoje há `fato_*` + `shape` (`source-registry.ts`,
`capabilities.ts`). Em cima disso, um **catálogo de métricas** declarativo, cada
métrica com:

- `id` estável e único (ex.: `estoque.valor_total`, `estoque.itens_negativos`).
- `rotulo` curado + `descricao` curta (vira o subtítulo do KPI / título da seção).
- `unidade`/`formato`: moeda BRL, contagem (com MI/BI/TRI), percentual, dias.
- `dimensoes` (recortes válidos): armazém, marca, família, local, faixa de dias.
- `temSerieTemporal`: bool (governa se pode virar gráfico de tendência/setinha).
- `pergunta`: a pergunta de negócio que ela responde ("quanto vale o estoque?",
  "quantos itens estão negativos?").
- `chartPreferido` + `chartsValidos`: derivados das regras do ui-ux-pro-max.
- `fato`/`shape`/`produtor`: a ponte para `source-registry.ts` (reuso total da
  resolução de dados que já existe).

Esse catálogo é o **vocabulário** que o LLM-editor manipula. Ele não vincula
"fato cru a um gráfico"; ele escolhe **métricas** e as encaixa em **slots** de
blocos. É o que escala para todo o Odoo: novos domínios = novas métricas
registradas, não novos relatórios hardcoded. Alinha com a decisão canônica #9
(F4 cobre todos os domínios) e com a ideia de MCP semântico.

### 3.2 Gramática de composição (blocos opinativos + invariantes)

Um **relatório** não é uma lista de seções livres. É uma sequência ordenada de
**blocos** de um catálogo fechado, desenhados com ui-ux-pro-max e os componentes
reais do Consumo:

| Bloco | Componente real | Slots | Regra |
|---|---|---|---|
| **Tira de KPIs** | `KpiCard` (`components/reports/kpi-card.tsx`) | 3 a 5 métricas escalares | exatamente 1 por relatório, no topo; métricas **distintas** (sem repetir identidade/valor); formato MI/BI/TRI + subtítulo |
| **Tendência + distribuição** | `InteractiveAreaChart` + `DonutWithCenter` | 1 métrica temporal + 1 dimensão de composição | só com métrica `temSerieTemporal`; donut só com ≤6 categorias; setinha de período |
| **Ranking interativo** | `InteractiveBarChart` | 1 métrica + 1 dimensão (recorte) | barras ordenadas desc, valor no rótulo; reage ao filtro-pílula ao vivo; ≤15 categorias senão tabela |
| **Tabela detalhe** | `ReportDataTable` | 1 conjunto de linhas + colunas | colunas definidas; drilldown quando há detalhe por linha; paginação + resultados/página |

**Invariantes duras da gramática (o que torna o Frankenstein impossível):**

1. **No máximo 1 tira de KPIs**, sempre no topo.
2. **KPIs distintos por identidade de métrica** (não por string): proíbe "VALOR
   TOTAL" duas vezes e "valor imobilizado == valor total".
3. **Título de seção derivado da métrica vinculada** (não texto livre do LLM):
   proíbe "negativos" exibindo "valor por marca".
4. **Arco narrativo fixo:** panorama (KPIs) → análise (tendência/ranking/donut) →
   detalhe (tabela). Ordenação imposta por código.
5. **Gráfico certo por dado** (regras ui-ux-pro-max, viram código): tendência ⇒
   linha/área e exige `temSerieTemporal` + ≥4 pontos; comparação/ranking ⇒ barra
   ordenada; proporção ⇒ donut só ≤6 categorias (senão barra); nunca dois gráficos
   do mesmo (tipo+métrica+recorte).
6. **Teto de blocos** (ex.: 6) para manter enxuto.
7. **Todo gráfico é interativo e filtrável** (tooltip + reação a filtro); barra
   estática + filtro fixo morto é proibido.

### 3.3 Processo editorial do LLM (multi-passo, cada passo justificado)

O usuário liberou a contagem de chamadas desde que cada uma seja **necessária**.
Pipeline editorial:

- **Passo 1 , Compositor (raciocínio alto, 1 chamada).** Recebe a intenção curada
  + o catálogo de métricas (vocabulário) + a gramática (blocos e invariantes
  descritas em prompt). Devolve um **Plano** estruturado: título honesto, objetivo,
  e a lista ordenada de blocos com seus binds (métrica→slot, dimensão, filtros
  iniciais). **Não** emite componentes nem HTML; emite escolhas dentro da
  gramática, validadas por Zod.
- **Passo 2 , Crítico/refinador (raciocínio alto, 1 chamada).** Recebe o Plano +
  uma amostra real dos dados resolvidos (para checar o dado, não só a forma) e
  audita adversarialmente contra: invariantes da gramática, honestidade
  título↔dado, KPIs distintos, gráfico certo, narrativa, e "isto responde à
  intenção?". Devolve um Plano corrigido + lista de ajustes aplicados. É o
  "refinamento entre agentes" que o usuário pediu, mas com papel claro e limitado.
- **(Condicional) Passo 3 , Resolução de ambiguidade.** Só dispara se o crítico
  marcar o plano como inviável/ambíguo (ex.: intenção cruza dois domínios). Senão,
  não roda (sem chamada desperdiçada).

Contrato (`Plano`) é uma estrutura fechada e versionada; os passos trocam `Plano`,
nunca prosa. Streaming de progresso real (fases + frases) reusa `progresso.ts`.

> **Por que multi-passo e não 1 só:** o compositor erra (todo LLM erra binds e
> títulos); um crítico dedicado pegando o erro contra o **dado real** é o que
> separa "salada" de "relatório". O custo extra é 1 chamada de alto raciocínio,
> que o usuário autorizou explicitamente em troca de qualidade. O revisor
> determinístico (3.4) ainda fecha o que escapar, sem custo de token.

### 3.4 Revisor determinístico (rede final, código, 0 chamada)

Recebe o Plano (pós-crítico) e **garante** as invariantes de 3.2 antes de
construir, consertando ou removendo o que violar: dedup de KPIs por identidade,
bloqueio/ajuste de título incoerente, fusão/descarte de gráficos redundantes,
corte por teto, reordenação narrativa, downgrade donut→barra quando >6 categorias,
exigência de série temporal para tendência. Substitui o `curar-blueprint.ts` atual
por uma versão muito mais forte e testável (TDD por invariante).

### 3.5 Renderer interativo (no nível do Consumo)

O relatório renderizado deixa de ser estático:

- **Filtros-pílula não-fixos** no topo (rolam junto): período + date range (a
  partir de 22/05) **apenas** nos blocos com métrica temporal; pílulas de **recorte**
  (armazém/marca/família/faixa de dias) onde é foto do momento. Reuso de
  `PeriodPills` (`components/reports/period-pills.tsx`) e `PeriodNavigator`
  (`components/dashboard/period-navigator.tsx`).
- **Re-resolução ao vivo:** mudar filtro re-resolve as seções afetadas e
  re-renderiza, reusando `relatorio-filtros.ts` + `carregar-relatorio-dinamico.ts`
  (que já fazem isso para relatórios salvos) e o padrão de re-fetch do Consumo.
- **Charts interativos** (tooltip + setinha) e **tabela com drilldown + paginação +
  resultados/página** já existem (`report-renderer.tsx` foi reescrito para os
  componentes do Consumo); o trabalho é **ligar a interatividade/filtros**, não
  recriar componente.

### 3.6 Entrevista convergente

A jornada para de acumular. Objetivo: do pedido inicial a um Plano gerável em
**poucas trocas** (meta ≤3 perguntas de verdade) ou direto:

- O agente da entrevista extrai uma **intenção curada** (objetivo + recortes +
  janela temporal), não uma pilha de seções. Pergunta só o que muda o desenho.
- **Atalho "gerar já":** com a primeira fala já dá para compor um relatório padrão
  do domínio detectado; o usuário pode pular a entrevista. Coleta vira refino
  opcional depois.
- Reuso/ajuste de `journey/*`, `prompt-jornada.ts`, `roteiro.ts`,
  `viabilidade.ts`, `intencao.ts`.

### 3.7 Preview/canvas limpo (pedido explícito do usuário)

- **Arrancar** o canvas/pan e **todas** as animações de mão (esticar, etc.).
- Manter só: **zoom (redimensionar)** + **rolagem vertical**.
- Botão **ampliar que esconde a conversa** (não modal): expande o preview ocupando
  o espaço da conversa; **X** traz a conversa de volta.
- **Remover a barra de filtro fixa** feia (substituída pelos filtros-pílula ao vivo
  do 3.5, que pertencem ao relatório, não a uma barra cromada).
- Arquivos: `builder-workspace.tsx`, `builder-preview.tsx`, `builder-chat-panel.tsx`.

## 4. Reuso vs reescrita (mapa do código)

**Reusar quase como está:**
- `source-registry.ts`, `resolve-source.ts`, `shape-adapters.ts`, queries
  `reports/queries/*` (resolução de dados).
- Componentes reais: `KpiCard`, `InteractiveAreaChart`, `InteractiveBarChart`,
  `DonutWithCenter`, `ReportDataTable`, `PeriodPills`, `PeriodNavigator`,
  `PageJumpNavigator`.
- `relatorio-filtros.ts`, `carregar-relatorio-dinamico.ts` (re-resolução ao vivo).
- `build.ts`/`tool-bridge.ts`/`mutators.ts` (Plano→`BuilderReportEntry` por
  dispatcher determinístico) , adaptados ao novo Plano.
- `progresso.ts` (barra + frases), quota/`logUsage`, SSE `stream/route.ts`.

**Reescrever/criar:**
- **Novo:** catálogo de métricas semântico (3.1).
- **Novo:** gramática de blocos + tipos do `Plano` (3.2) substituindo
  `blueprint-types.ts` free-form.
- **Reescrever:** `blueprint.ts` (vira compositor) + novo crítico/refinador (3.3).
- **Reescrever forte:** `curar-blueprint.ts` → revisor determinístico por
  invariante (3.4).
- **Ligar:** interatividade/filtros no renderer e no relatório salvo (3.5).
- **Ajustar:** entrevista convergente (3.6) e preview/canvas (3.7).

## 5. Eficiência e custo

- Entrevista: de ~9 trocas para ≤3 (ou pulável) , corta chamadas e frustração.
- Geração: 2 chamadas de alto raciocínio no caminho feliz (compositor + crítico),
  +1 só em ambiguidade real; revisor e build são código (0 token). Previsível e
  justificado, em vez de "um milhão de requisições" sem retorno.
- Regenerar barato: reusa o Plano e a amostra; só re-roda o que o ajuste pede.

## 6. Definição de pronto (qualidade comprovada, não carimbo)

- **Coerência por construção testada (TDD):** suíte de invariantes do revisor
  (KPIs distintos, título↔dado, sem gráfico redundante, narrativa, donut≤6,
  tendência exige série) cobrindo os casos exatos do Frankenstein.
- **E2E contra dado real (regra de raiz da §9 do CLAUDE.md):** subir o serviço,
  popular fatos, gerar relatórios de várias intenções (estoque) e conferir, na UI,
  que: KPIs não repetem, títulos batem com o dado, filtros mudam os gráficos ao
  vivo, drilldown e paginação funcionam, nada de Frankenstein.
- **Régua visual:** lado a lado com o Consumo, o relatório gerado tem o mesmo nível
  de diagramação, hierarquia e interatividade.
- **Latência:** medir o caminho feliz; alvo ≤25s; ajustar raciocínio se passar.

## 7. Escopo (onda 1) e não-objetivos

- **Onda 1:** domínio **estoque** (métricas já disponíveis nas queries). A
  arquitetura nasce genérica (catálogo de métricas), mas só estoque é registrado
  agora; financeiro/comercial/fiscal entram em ondas seguintes só registrando
  métricas, sem tocar o cérebro.
- **Não-objetivos:** não hardcodar relatórios prontos; não construir um relatório
  específico como entregável (o entregável é o **gerador**); não subir nada a
  produção (F6 só local).

## 8. Riscos e pontos para as reviews adversariais

- O catálogo de métricas pode ficar grande demais no prompt do compositor; avaliar
  resumo/seleção por domínio detectado.
- Re-resolução ao vivo precisa de chave de cache e de granularidade (re-resolver só
  a seção afetada) para não pesar.
- Distinguir "métrica temporal" exige checar de verdade quais queries têm série
  (hoje só `fato_estoque_movimento`); o catálogo não pode mentir sobre isso.
- O crítico ver o dado real custa uma resolução antes do build; definir amostra
  enxuta.
- Entrevista pulável não pode gerar relatório genérico ruim; o "padrão do domínio"
  precisa ser forte por si só.

> **Status:** v1. Próximo: 2 reviews adversariais (Opus) caçando erro/lacuna/
> exagero → spec v3 → plano (com double-check) → execução TDD com ui-ux-pro-max.
> F6 não sobe sem aprovação.
