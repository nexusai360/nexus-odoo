# F6 , Jornada Guiada de Construção de Relatório (design / spec v1)

> Data: 2026-06-27. Branch: `feat/nex-reconstrucao`. Fase: F6 (Construtor).
> **REGRA DURÁVEL: F6 só local. Nada de merge/deploy sem aprovação explícita do usuário.**
> Metodologia: esta spec passa por 2 reviews adversariais (v2, v3) antes do plano.

## 1. Contexto e problema

O construtor atual (Relatórios 2.0) deixa o usuário "pedir um relatório do nada":
ele manda um prompt e recebe uma ficha pronta, sem acompanhamento. Não há jornada,
não há mapeamento do que ele quer, não há orientação sobre o que o sistema consegue
ou não consegue fazer. O usuário fica no escuro: não sabe quais parâmetros existem,
o que pode pedir, o que dá para sugerir. O resultado é raso e a experiência é ruim.

O objetivo desta feature é substituir esse fluxo por uma **jornada guiada de criação**:
a IA conduz uma conversa adaptativa, entende a fundo o que o usuário quer (objetivo,
dados, indicadores, visualização, filtros, layout, período), mostra opções de
componentes da biblioteca, padroniza as escolhas e só então gera, com muito mais
assertividade. A sensação alvo é "a IA me entendeu, estamos na mesma sintonia".

## 2. Visão e princípios (regem toda a spec)

1. **Adaptativo, nunca engessado.** Não é um formulário nem um wizard de passos
   fixos. Um prompt muito bom decide QUAIS perguntas fazer, em que ordem, mesclando
   quando o usuário já respondeu, aprofundando quando é complexo, pulando o que não
   se aplica. O número de perguntas é relativo à complexidade e à clareza (um
   relatório simples pode fechar em ~4; um complexo pode pedir ~10+). As 7 dimensões
   de cobertura (seção 6) são um MAPA do que precisa ficar entendido, não um roteiro.
2. **Maturidade gateia o fim.** Não existe botão "Gerar" sempre visível/desabilitado
   esperando acender. A IA pergunta até entender o suficiente ("maturidade"). Antes
   disso o usuário não consegue gerar; se apressar ("gera logo"), a IA não gera: ela
   desconversa com gentileza e volta às perguntas estruturais. A partir da maturidade,
   as perguntas passam a oferecer, no próprio enunciado, a saída ("...ou prefere que
   eu já monte e você ajusta depois?"). Quando o usuário aceita a saída, vai para a
   **tela de resumo**; é só ali que o botão "Gerar relatório" aparece.
3. **Honestidade de capacidade.** A IA conhece o catálogo real de capacidades. Para
   o que não dá, a resposta é sempre "ainda não é possível" (nunca "não dá", "não
   consigo", "impossível"), explicando o que existe e oferecendo o caminho mais
   próximo. Hoje o catálogo é só estoque (seção 7).
4. **Reuso total.** Mesma ficha (`BuilderReportEntry`), mesmas tools de mutação, e
   exatamente os mesmos componentes visuais do dashboard "Consumo do Agente Nex"
   (KpiCard, InteractiveAreaChart, InteractiveBarChart, DonutWithCenter, Table +
   paginação, CustomSelect) que o renderer já usa.

## 3. Escopo

**Dentro (esta spec):**
- A jornada conversacional adaptativa com modelo de maturidade.
- A trilha de progresso visível (estado de cobertura das dimensões).
- O catálogo de capacidades (capability map) que alimenta o prompt e as opções.
- As prévias híbridas (thumbnail para arranjos/layout, prévia viva do componente
  real para o gráfico/KPI escolhido).
- A tela de resumo + botão "Gerar relatório" + animação de geração.
- A transição da tela centralizada (jornada) para o layout 2-painéis (refino),
  reusando o workspace atual.
- As novas tools de controle de jornada e a extensão do `runBuilder`/SSE/painel.

**Fora (ondas futuras, decididas com o usuário):**
- Novos domínios de dado além de estoque (ex.: comercial/vendas/pedidos para o
  "fluxo de produto" com "em pedido"/"vendido"). A jornada trata isso como
  "ainda não é possível".
- Reforma do preview do 2-pane (remover o canvas de zoom/pan, rolagem vertical
  só, largura 75%, botão expandir com animação de recolher o chat em vez de modal).
  Será uma onda própria depois desta.
- Tipos de gráfico novos (3D e afins) e ampliação da biblioteca de componentes.

## 4. Arquitetura (Opção A , blueprint incremental)

A jornada é uma nova **fase conversacional** dentro do construtor, não um sistema
paralelo. Conforme o usuário responde, a IA vai montando a MESMA ficha
(`BuilderReportEntry`) que o construtor já usa, chamando as tools de mutação que já
existem (`criar_relatorio`, `adicionar_secao`, `definir_filtro`, `mover_secao`,
`definir_cor_secao`, etc.) mais novas **tools de controle de jornada** (seção 8).

Consequências:
- As prévias vivas saem de graça: a ficha está sempre renderizável pelo
  `ReportRenderer` que já existe.
- O "Gerar relatório" no resumo apenas **finaliza/persiste** o que já foi montado e
  troca a UI da fase de jornada para a fase de refino (2-pane). Não há "geração
  mágica no fim": a ficha foi sendo construída ao longo da conversa.
- Reusa `runBuilder`, o SSE `/api/builder/stream`, a persistência em `SavedReport`
  e o `BuilderChatPanel`.

A diferença de comportamento vem do **system prompt** (modo entrevistador antes da
maturidade) e do **estado de jornada** carregado junto da conversa.

## 5. Modelo de jornada e maturidade

A conversa tem três fases lógicas (a UI reflete cada uma):

- **Fase ENTREVISTA (centered chat).** A IA conduz a conversa adaptativa, fazendo
  perguntas para preencher o mapa de cobertura. Pode (e deve) já ir montando a ficha
  por baixo (seções provisórias) para alimentar prévias, mas o foco visual é a
  conversa. Enquanto NÃO houver maturidade: tentativas de "gerar logo" são
  desconversadas; a IA reconduz às perguntas estruturais.
- **Fase RESUMO.** Disparada quando (a) a IA sinaliza maturidade E (b) o usuário
  aceita a saída oferecida no enunciado de uma pergunta. A IA monta um resumo
  estruturado de tudo que foi escolhido (objetivo, dados, indicadores, visualizações,
  filtros, layout, período) e a UI mostra esse resumo com o botão "Gerar relatório".
- **Fase REFINO (2-pane).** Após "Gerar": animação de geração, e a UI passa para o
  layout atual (chat à esquerda, preview à direita) onde o usuário ajusta com as
  tools que já existem.

**Maturidade** é um julgamento do próprio modelo, emitido por uma tool de controle
(`avaliar_maturidade`/`sinalizar_pronto`, seção 8). Critério (no prompt): a IA só
sinaliza maturidade quando as dimensões do NÚCLEO estão entendidas com clareza
(Objetivo, Dados, Indicadores, Visualização) e ela tem o necessário para montar um
relatório bom; dimensões complementares (Filtros, Layout/Cor, Período) podem entrar
com defaults inteligentes sugeridos por ela. O número de perguntas é livre: a IA
para de perguntar quando entende, não quando atinge uma contagem.

**Guarda anti-geração-precoce.** O backend só permite a transição ENTREVISTA -> RESUMO
quando o estado de jornada marca `maturidade=true`. Se o cliente pedir o resumo sem
maturidade (ou o modelo tentar atalhar), o backend recusa e a IA responde reconduzindo.
É defesa estrutural, não só de prompt.

## 6. Mapa de cobertura (7 dimensões)

Estado por conversa, atualizado pela IA via tool `marcar_cobertura`. Cada dimensão
tem um status: `pendente` | `em_andamento` | `coberta` | `nao_se_aplica`.

1. **Objetivo** , a pergunta de negócio que o relatório responde. (núcleo)
2. **Dados/recorte** , qual(is) fato(s)/dimensão principal (produto, armazém, marca,
   família, movimento, parados, top movimentados). (núcleo)
3. **Indicadores (KPIs)** , o que medir; a IA sugere KPIs inteligentes. (núcleo)
4. **Visualização** , tabela, barras, pizza/rosca, linha, ou combinação. (núcleo)
5. **Filtros interativos** , marca, armazém, família, dias parado, sentido. (complementar)
6. **Layout & Cor** , ordem das seções e cor. (complementar)
7. **Período/temporalidade** , snapshot atual x evolução no tempo; só aparece quando
   o relatório envolve movimento/entradas-saídas. (complementar/condicional)

A trilha de progresso na UI reflete esse estado. Maturidade exige o núcleo (1 a 4)
em `coberta`; complementares podem ficar com default sugerido.

## 7. Catálogo de capacidades (capability map)

Fonte única de verdade do que o construtor sabe fazer hoje, consumida pelo prompt
(para honestidade) e pela UI (para montar opções). Derivado do que já existe:
`listarFontes()` (fatos de estoque), `TEMPLATES_ONDA1` (KPIRow, BarChart, PieChart,
LineChart, DataTable), tipos de filtro (`ReportFilterTipo`), paleta de cores
(`CORES_SELECIONAVEIS`).

Estrutura proposta (`src/lib/reports/builder/capabilities.ts`):
- **dominios**: hoje só `estoque` (catálogo declara os demais como "ainda não").
- **fontes**: lista derivada de `listarFontes()` com rótulo amigável e exemplos de
  perguntas que cada fonte responde.
- **visualizacoes**: os 5 templates com "quando usar" e o shape exigido.
- **filtros**: os 5 tipos com rótulo e quando se aplicam.
- **cores**: tokens da paleta.
- **naoSuportado**: lista explícita de coisas comuns que o usuário pode pedir e que
  "ainda não é possível" (ex.: vendas/pedidos, faturamento, 3D, exportar PDF),
  cada uma com a frase honesta e o caminho mais próximo. Alimenta tanto o prompt
  quanto a UI (quando o usuário esbarra, a IA explica com clareza).

Este catálogo é a base do prompt: ele para de "supor dados" e passa a orientar.

## 8. Tools novas de controle de jornada

Acrescentadas ao `BUILDER_TOOLS` (todas `muta: true` sobre o estado de jornada, não
sobre a ficha), despachadas no `executarTool`:

- `marcar_cobertura({ dimensao, status, resumo? })` , atualiza o mapa de cobertura
  (dimensao ∈ as 7; status ∈ pendente/em_andamento/coberta/nao_se_aplica). `resumo`
  é a frase curta do que ficou decidido naquela dimensão (alimenta a tela de resumo).
- `avaliar_maturidade({ pronto, motivo })` , a IA declara se já entende o suficiente.
  Backend só aceita `pronto=true` se o núcleo (dimensões 1 a 4) estiver `coberta`.
- `montar_resumo()` , gera o snapshot estruturado das escolhas (lido do estado de
  cobertura + da ficha) para a fase RESUMO. Só permitido com maturidade.

A ficha continua sendo mexida pelas tools existentes. O estado de jornada (cobertura,
maturidade, fase, resumo) vive junto da conversa (seção 9).

## 9. Estado/blueprint e persistência

Hoje a conversa persiste em `builder_conversations`/`builder_messages` e a ficha em
`SavedReport`. Acrescentamos o **estado de jornada** por conversa:

- `BuilderConversation` ganha um campo JSON `journeyState` (migration manual aditiva,
  protocolo de schema; F6 só dev). Shape:
  ```
  {
    fase: "entrevista" | "resumo" | "refino",
    cobertura: Record<Dimensao, { status, resumo? }>,
    maturidade: boolean,
    resumo?: { objetivo, dados, indicadores, visualizacoes, filtros, layout, periodo } // montado na fase resumo
  }
  ```
- O SSE `done` passa a incluir `journeyState` (além de ficha/savedId/etag já
  existentes). O `BuilderChatPanel`/workspace reage à `fase` para trocar o layout.
- Defaults: conversa nova começa em `fase="entrevista"`, cobertura toda `pendente`,
  `maturidade=false`.

## 10. Fluxo de UI

**Entrada (tela centralizada, estilo ChatGPT).** Ao abrir "Novo relatório", o chat
ocupa o centro da tela (sem o split). Mensagem inicial da IA convida: "vamos montar
seu relatório, me conta o que você gostaria de ver". Trilha de progresso (as 7
dimensões) visível no topo ou lateral, refletindo a cobertura.

**Durante a entrevista.** A IA conduz adaptativamente. Quando propõe opções, usa as
**prévias híbridas** (seção 11). A trilha vai acendendo as dimensões cobertas. Sem
maturidade, a saída ("quer que eu já monte?") não é oferecida; se o usuário forçar,
a IA reconduz.

**Maturidade alcançada.** As perguntas da IA passam a oferecer a saída no enunciado.
Quando o usuário aceita -> a IA chama `montar_resumo` -> a UI entra na **fase RESUMO**:
um cartão de resumo com tudo que foi escolhido (objetivo, dados, KPIs, visualizações,
filtros, layout, período) e, só aqui, o botão **"Gerar relatório"**.

**Gerar.** Clique -> **animação de geração** (tela toda, transição). Ao concluir,
a UI passa para a **fase REFINO**: layout 2-painéis atual (chat à esquerda, preview à
direita) com a ficha já montada e persistida. Dali pra frente é o construtor atual
(ajustes via tools, edição inline, filtros interativos).

Observação: a reforma estética do preview do 2-pane (canvas, 75%, expandir) é onda
futura; aqui apenas reusamos o 2-pane como está.

## 11. Prévias híbridas

Quando a IA oferece opções:
- **Thumbnails (estruturais)** , para arranjos/layout e ordem das seções: cartões
  leves (ícone + nome + 1 linha) representando cada arranjo. Vivem numa pequena
  biblioteca estática (`src/components/reports/builder/journey/option-thumbs.tsx`).
- **Prévia viva (componente real)** , para o gráfico/KPI escolhido: renderiza o
  componente REAL em miniatura (os mesmos `InteractiveBarChart`/`DonutWithCenter`/
  `InteractiveAreaChart`/`KpiCard`/`ReportDataTable`) com dados de amostra do próprio
  catálogo, como card clicável.

Mecanismo: a IA emite as opções como parte da mensagem (estrutura própria de
"escolha", renderizada pelo painel como cards selecionáveis); a seleção do usuário
volta como a resposta dele e a IA aplica via tools. As opções e seus previews saem do
capability map (seção 7), nunca inventadas.

## 12. Honestidade, RBAC, billing e quota (reuso)

- **Honestidade**: o marcador `SEM_FONTE:`/recusa já existente continua valendo para
  domínios fora do catálogo; a jornada o usa com a linguagem "ainda não é possível"
  e o caminho mais próximo, registrando `FeatureRequest` (gap) como hoje.
- **RBAC**: a página e as actions seguem o gate atual (admin/super_admin) , sem
  mudança.
- **Billing/quota**: a jornada consome mais turnos de LLM que o fluxo antigo. Reusa
  `logUsage origin="construtor"` e o teto de quota já existente; o prompt deve ser
  econômico (perguntas objetivas, sem enrolar). Risco a vigiar: custo por relatório.

## 13. Estratégia de testes

- **TDD nas unidades puras**: estado de cobertura/maturidade (transições, guarda
  anti-geração-precoce), capability map (forma + "naoSuportado"), as 3 tools novas
  (validação + efeito no estado), montagem do resumo.
- **Componentes (jsdom)**: trilha de progresso (reflete cobertura), cards de opção
  (thumb + prévia viva renderizam e selecionam), tela de resumo (mostra escolhas +
  botão Gerar só na fase resumo), troca de fase (entrevista -> resumo -> refino).
- **E2E real (obrigatório, regra de raiz)**: rodar a jornada contra o LLM real +
  cache de estoque real, conferindo: a IA entrevista, recusa gerar antes da
  maturidade, oferece a saída após maturidade, monta resumo coerente, e o "Gerar"
  produz uma ficha válida que renderiza com os componentes reais. Conferir também a
  honestidade ("ainda não é possível") num pedido fora do catálogo (ex.: "quantos
  produtos vendidos").
- `tsc` raiz limpo; eslint (sem travessão); jest builder verde.

## 14. Componentes (novos x reuso)

**Reuso (sem reescrever):** `ReportRenderer` e todos os componentes do Consumo,
`BuilderChatPanel`, `BuilderWorkspace` (ganha as fases), `runBuilder` (ganha o estado
de jornada), SSE stream, tools de mutação, `SavedReport`/conversa.

**Novos:**
- `src/lib/reports/builder/capabilities.ts` , capability map + helpers.
- `src/lib/reports/builder/journey/state.ts` , tipos + transições puras (cobertura,
  maturidade, fase) com guarda anti-geração-precoce.
- tools novas em `tools/` (marcar_cobertura, avaliar_maturidade, montar_resumo).
- prompt da jornada (modo entrevistador) em `agent/prompt.ts` (ou um novo
  `agent/prompt-jornada.ts`).
- UI: `journey/progress-trail.tsx`, `journey/option-cards.tsx` (thumb + prévia viva),
  `journey/journey-summary.tsx` (resumo + Gerar), e a casca centralizada +
  animação de geração no workspace.

## 15. Ordem de implementação (alto nível, detalha no plano)

1. Capability map + estado de jornada (puro, TDD).
2. Tools novas + extensão do `runBuilder`/SSE/estado na conversa (migration aditiva).
3. Prompt da jornada (entrevistador adaptativo + honestidade + maturidade).
4. UI: casca centralizada + trilha de progresso.
5. UI: cards de opção (thumb + prévia viva).
6. UI: tela de resumo + botão Gerar + animação + troca para 2-pane.
7. Verificação E2E real + ajustes.

## 16. Riscos e mitigações

- **Prompt fraco -> experiência engessada ou rasa.** Mitiga: prompt iterado, E2E real
  conferindo a sensação de condução; o capability map dá repertório à IA.
- **Geração precoce.** Mitiga: guarda estrutural no backend (não só prompt).
- **Custo de LLM por relatório.** Mitiga: prompt objetivo; vigiar quota/billing.
- **Complexidade da UI de fases.** Mitiga: reusar o 2-pane atual no refino; a fase
  nova de verdade é só a centralizada + resumo.
```
