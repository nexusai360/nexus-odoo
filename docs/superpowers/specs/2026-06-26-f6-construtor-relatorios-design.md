# F6 , Construtor de Relatórios (SPEC v3)

> **Status:** SPEC v3 (final para o PLAN). Incorpora 2 rodadas de review adversarial
> (4 pareceres em Opus) e verificação contra o código real.
> **Branch de trabalho:** `feat/nex-reconstrucao` (decisão do usuário 2026-06-26).
> **Regra de raiz (inegociável):** TUDO desta fase fica **somente local** e **não
> sobe para produção** sem aprovação explícita do usuário. Sem merge para `main`,
> sem deploy, sem migration em prod. Ver bloco no topo do `CLAUDE.md`.
> **Metodologia:** SPEC v1 → review → v2 → review → v3 (aqui) → PLAN v1→v3 →
> execução (superpowers, ondas/tasks, TDD, `ui-ux-pro-max` em todo front-end,
> consistência com o design da plataforma).

> **Correções v2 → v3 (achados da 2ª review, verificados no código):**
> - **O motor de render da F3 NÃO é genérico:** é um dispatcher estático
>   (`QUERIES = { "saldo-produto": fn, ... }; if (!query) notFound()` em
>   `relatorios/[id]/page.tsx`). Ficha dinâmica cairia em 404. **Construir o motor
>   genérico é a maior frente da onda 1** (§4 nova seção).
> - **Não existe registry `fato → query`:** hoje é 1 wrapper hardcoded por relatório
>   (`getRelatorioSaldoProduto`...), com derivações (top-N, KPIs) embutidas. A onda 1
>   constrói o registry + adaptadores de fonte.
> - **`outputSchema` vive só no catálogo do MCP do Nex**, não em `src/`. O contrato
>   de fonte do construtor é um **catálogo de fontes próprio** (módulo neutro), não o
>   do Nex (evita o acoplamento que a decisão #2 proíbe).
> - **Compatibilidade é template × shape-DERIVADO**, não template × fonte (uma fonte
>   alimenta KPIRow/DataTable/Pie com shapes diferentes produzidos por derivação).
> - **`ReportEntry` ganha campos** (diff explícito em §4.4); **KPIRow é reescrito**
>   para config-driven (hoje usa `variante` hardcoded).
> - **MCP de construção = biblioteca de handlers**; onda 1 chama in-app direto; o
>   servidor MCP é casca para externalização futura (trade-off documentado, §4.6).
> - **Onda 1 cortada:** rascunho PESSOAL do admin (sem publicação/RBAC de consumo,
>   que vão para onda posterior), **1 template** (DataTable), critério de aceite com
>   número fixo.
> - **Provedor:** reusa a infra LLM multi-provedor existente (`src/lib/agent/llm`),
>   default OpenAI `gpt-5-mini`.

---

## 1. Objetivo

Dar a `super_admin`/`admin` um **construtor de relatórios in-app** onde a pessoa
**descreve em linguagem natural** o relatório e a plataforma o **monta sozinha**, a
partir de uma **biblioteca de componentes padronizada**, só alcançando o que já
existe como dado (com **recusa honesta** quando não dá). Caminho primário: **prompt**;
edição manual existe, porém **limitada**. Em ondas posteriores, o relatório pode ser
**publicado** para perfis consumidores e virar **widget** num **painel**.

Duas formas de entrega, em ondas distintas: **relatório de tela cheia** (onda 1) e
**widget + painéis** com grid de encaixe (onda 3).

---

## 2. Fundação que JÁ existe vs o que falta construir

**Já existe (F3), reusável:**
- O **tipo** `ReportEntry` e o formato de `secoes[] { template, fato, config, filtros[] }`.
- Os **templates de render** `DataTable`, `BarChart`, `PieChart`, `LineChart` (em
  `src/components/charts/*`) , razoavelmente config-driven (a favor).
- **Controles de filtro** prontos (`report-filters`, `warehouse-filter`, `period-bar`...).
- As **queries** de dado (`src/lib/reports/queries/*`, ex.: estoque comprovado).
- O **gate de domínio** `visibleDomains`/`guardDominio` (hoje chamado dentro dos wrappers).

**NÃO existe (a onda 1 constrói):**
- **Motor de render genérico** (hoje a rota resolve por id estático e dá 404 para id novo).
- **Registry de fontes** `fato → { query, adaptadores de shape, contrato }`.
- **Catálogo de fontes e de componentes** enumerável (para os enums do agente).
- **`KPIRow` config-driven** (hoje usa `variante` hardcoded por relatório).
- **Persistência de ficha dinâmica** (`SavedReport`).
- O **agente construtor** + as **tools de construção** + a **tela chat/preview**.

---

## 3. Decisões canônicas (travadas)

1. **Config-driven, nunca code-gen.** Relatório é `ReportEntry` validado por schema.
2. **MCP de construção separado do Nex** (catálogo/tools exclusivos). Implementado como
   **biblioteca de handlers TS**; o servidor MCP é a casca de exposição (§4.6).
3. **Agente construtor: modelo selecionável na Configuração, mesmo padrão do Agente Nex.**
   Reusa toda a infra LLM existente (`src/lib/agent/llm`): credenciais (`LlmCredential`),
   catálogo de modelos (`LlmModelEntry`/`effective-catalog`), client (`get-client`) e billing
   (`LlmUsage`). O construtor tem sua **própria configuração de modelo ativo** (provedor +
   modelo), editável numa tela no padrão da `agente/configuracao` (puxa as credenciais já
   cadastradas em `agente/chaves`). Default sugerido: OpenAI `gpt-5-mini`, mas é o usuário
   quem escolhe na tela. Orquestração no padrão do Nex, isolada (prompt/catálogo/sessão
   próprios). Ver §4.8.
4. **Design pela `ui-ux-pro-max` em design-time**, embutido nos componentes; IA não
   desenha em runtime.
5. **Biblioteca milimetricamente documentada** (formato em §6).
6. **Edição manual limitada** (§8).
7. **Limitado pelos fatos + recusa honesta (Caminho 3).** Sem fonte → recusa + log de gap.
8. **Só local até aprovação** (regra de raiz).

---

## 4. Arquitetura

### 4.1 Motor de render genérico (a MAIOR frente da onda 1, nova)

Hoje `relatorios/[id]/page.tsx` resolve dados por `QUERIES[id]` estático. A F6 cria um
caminho de render para fichas dinâmicas:
- **Rota dinâmica** `/relatorios/d/[savedId]` que carrega o `SavedReport`, valida a ficha
  contra o catálogo atual, e renderiza seção a seção.
- **Resolver de seção:** para cada `secao`, o motor pega `secao.fato` no **registry de
  fontes**, executa a query, aplica o **adaptador de shape** pedido pelo `template`, e
  injeta no componente. Estados loading/erro/vazio por seção.
- **Guard de domínio no resolver:** antes de executar a fonte, reavalia o domínio contra
  o usuário (consumo), reusando `visibleDomains`. Ponto único de gate (resolve o que hoje
  está espalhado nos wrappers).
- Reaproveita os componentes de render (`DataTable`, etc.); o que muda é a **orquestração**
  (de estática para dirigida pela ficha).

### 4.2 Registry de fontes e adaptadores de shape

- **Registry:** `fato → { query, dominio, contrato }`. Onda 1: as fontes de estoque
  comprovadas. Enumerável (alimenta os enums do agente).
- **Adaptadores de shape:** a derivação que hoje vive nos wrappers (top-N para BarChart/Pie,
  KPIs para KPIRow) vira função nomeada por **shape derivado**: `kpis`, `tabela`,
  `agregacaoCategorica` (rotulo/valor), `serieTemporal`. Cada fonte declara **quais shapes
  derivados** oferece. A compatibilidade é **template × shape-derivado**, não template × fonte.
- **Contrato de fonte** (catálogo próprio do construtor, módulo neutro, NÃO o `outputSchema`
  do Nex): campos disponíveis por shape derivado, para o agente saber o que cada fonte entrega.

### 4.3 Ficha (`ReportEntry` estendido)

Reusa o tipo da F3 com os campos novos (diff explícito):
`+ tipo` (`tela_cheia` | `widget`), `+ parametros[]` (runtime, com binding a seções),
`+ schemaVersion`. O `secoes[]` ganha a possibilidade de declarar o **shape derivado**
que a seção consome. KPIRow é reescrito para renderizar de `config` arbitrário (sem `variante`).

### 4.4 Persistência (`SavedReport`, migration dev local)

`{ id, tipo, titulo, entry (JSON), schemaVersion, status (rascunho|publicado), criadoPor,
visibilidadeConsumo (roles String[], default vazio), etag, criadoEm, atualizadoEm }`.
- Onda 1 usa só `status=rascunho` e `criadoPor` (relatório pessoal). `visibilidadeConsumo`
  e `publicado` são onda posterior. `etag` para escrita otimista (§8).
- Relação com `ReportPreset` (presets de filtro do catálogo estático): **fora de escopo da
  onda 1**; presets de relatório dinâmico entram quando publicação entrar.

### 4.5 Agente construtor (robustez)

- **Enums fechados** derivados do registry/catálogo reais (templates, fontes, shapes, filtros,
  ícones do set existente). O agente não referencia chave inexistente.
- **Teto de iterações** no loop agente↔tools.
- **Loop de reparo:** ficha que falha (schema OU compatibilidade template×shape) volta como
  feedback estruturado; N tentativas; depois fallback honesto.
- **Recusa honesta** quando não há fonte; registra gap.

### 4.6 MCP de construção (biblioteca de handlers; servidor é casca)

As tools de construção são **funções TS** num catálogo próprio: `listar_componentes`,
`descrever_componente`, `listar_fontes`, `prever_dado`, `criar_relatorio`, `adicionar_secao`,
`editar_secao`, `remover_secao`, `definir_filtro`, `validar`. Cada uma valida a ficha.
- **Onda 1:** o agente roda **in-app** e chama esses handlers via tool-calling **direto**
  (sem processo separado). Isso entrega o conceito sem o custo de um 3º servidor.
- **Servidor MCP separado:** é uma **casca** que expõe os MESMOS handlers pelo protocolo MCP,
  para o uso externo futuro que o usuário quer (plugar em ChatGPT/Claude). Entregue quando a
  externalização for necessária, não na onda 1.
- **Trade-off (honesto):** Server Actions resolveriam o caso in-app com menos superfície; o
  servidor MCP separado existe pela visão de externalização do usuário. Por isso os handlers
  nascem como biblioteca neutra (servível dos dois jeitos), pagando o custo do servidor só
  quando ele agregar valor real.

### 4.7 Tela de construção (chat + preview)

Layout dividido: conversa (reusa a mecânica de chat do **Playground do Nex** e a **animação
de "pensando" da bubble**) + pré-visualização. **Preview em dois níveis:** validar estrutura
da ficha (barato, a cada turno) e renderizar com dado (sob demanda / amostra limitada, para
não re-consultar o cache pesado a cada turno). Localização na navegação e refino visual ficam
comigo (com a skill), sem validação tela-a-tela.

### 4.8 Configuração de modelo do construtor (reusa o padrão do Agente Nex)

O construtor tem uma seção de configuração de LLM **espelhando o padrão visual e funcional
da `agente/configuracao`** (a tela "Configuração > Recursos" do Nex, com o mesmo estilo de
cards e seleção de modelo/custo). Nela o `super_admin` escolhe **provedor + modelo** que o
construtor usa, a partir do **catálogo existente** (`LlmModelEntry`/`effective-catalog`) e das
**credenciais já cadastradas** em `agente/chaves` (`LlmCredential`). Não duplica credenciais.
- A "config ativa" do construtor é própria (não compartilha o `LlmConfig` do Nex, para que
  trocar o modelo do construtor não afete o Nex): um registro de config marcado por uso
  (`uso: "construtor"`) ou um modelo análogo, decidido no plano.
- O runtime resolve o client por `get-client` + a config ativa do construtor.
- Consumo é registrado em `LlmUsage` (billing já existente), o que **realiza a medição** de
  §9 sem reinventar contagem de tokens.

---

## 5. RBAC e visibilidade

- **Acesso ao construtor:** só `super_admin`/`admin`. Papéis reais: `super_admin`, `admin`,
  `manager`, `viewer` (não há "owner"; dono = `criadoPor`).
- **Onda 1:** relatório é **rascunho pessoal** do criador (só ele e `super_admin` veem). Sem
  publicação ainda.
- **Onda posterior , publicação para consumo:** `visibilidadeConsumo` (roles) define quem vê
  o relatório pronto; ao abrir, o **guard de domínio** (§4.1) reavalia a fonte contra quem
  consome. Esse é o ponto que faz o construtor servir para distribuir relatório.
- Auditoria de criar/editar/abrir.

---

## 6. Biblioteca de componentes e catálogo documentado

Cada componente é fechado e parametrizável, desenhado com `ui-ux-pro-max`, consistente com
a plataforma. **Formato do catálogo** (legível por humano e máquina), por entrada:
`chave`, `nome`, `paraQueServe`, `quandoUsar`/`quandoNaoUsar`, `shapeDerivadoExigido`
(qual shape do registry consome), `parametros`, `interacao` (hover/tooltip/drill/seleção,
declaradas desde já mesmo se implementadas depois), `tokensVisuais` (espaçamento/sombra/
hover/efeito/animação por estado, referenciando tokens do design system).

> **Exemplo fim a fim (`PieChart`):**
> ```
> chave: "PieChart"; nome: "Gráfico de pizza"
> paraQueServe: "Distribuição de 1 medida entre poucas categorias (<= ~8)."
> quandoUsar: "Composição/participação (ex.: estoque por família)."
> quandoNaoUsar: "Séries temporais; muitas categorias; comparação precisa."
> shapeDerivadoExigido: "agregacaoCategorica" (campos: rotulo, valor)
> parametros: { rotulo, formato: moeda|numero|percentual, paleta: <lista fixa>, ordenar }
> interacao: { hover: realce do setor, tooltip: valor+percentual, drill: opcional }
> tokensVisuais: { sombra: card.sm, hover: realce.tonal, animacao: entrada.scale.150ms }
> ```

**Ícones:** na onda 1 o conjunto é **fechado** (o set existente de `resolveReportIcon`), e o
enum do agente só aceita esses nomes (nome inválido = erro de validação, não fallback
silencioso). O "seletor de ícone com busca" da edição manual entra quando o set for expandido
(onda de UI), não na onda 1.

Catálogo onda 1: **DataTable** (1 template, o mais config-driven). Demais (`KPIRow` reescrito,
`BarChart`, `PieChart`) entram na sequência da onda 1/2. Avançados (`LineChart`,
`comparativo_periodo`, `badge_status`, `mapa_brasil` com hover destacando estado; 3D é o teto)
nas ondas de acervo.

---

## 7. Decomposição em ondas

- **Onda 1 , Construtor mínimo ponta a ponta (rascunho pessoal):**
  1. `SavedReport` + migration (dev local) + CRUD de rascunho.
  2. **Motor genérico** (rota `/relatorios/d/[savedId]`, resolver de seção, guard no resolver).
  3. **Registry de fontes** + **adaptadores de shape** (fontes de estoque comprovadas).
  4. **Catálogo de fontes e de componentes** (DataTable) + contrato.
  5. **Tools de construção** (biblioteca de handlers) + validação + compatibilidade.
  6. **Agente construtor** (infra LLM existente, enums fechados, teto, loop de reparo, recusa honesta).
  7. **Tela chat + preview** (reusa Playground/bubble; preview em 2 níveis).
  8. **Config de modelo do construtor** (§4.8, tela no padrão do Nex, reusa credenciais/
     catálogo) + **teto de IA** (reusa billing `LlmUsage` + bloqueio ao atingir).
  9. **Critério de aceite (§11).**
  (Sem publicação, sem RBAC de consumo, sem widget/painel, sem grid.)
- **Onda 2 , Acervo + edição manual (tela cheia):** `KPIRow` config-driven, `BarChart`,
  `PieChart`; edição manual limitada (título, trocar template compatível, ícone, reordenar).
- **Onda 3 , Publicação + consumo:** `status=publicado`, `visibilidadeConsumo`, guard de
  domínio no consumo, seção Relatórios com cards por perfil.
- **Onda 4 , Painéis e widgets:** `tipo=widget`, grid de encaixe, limites por painel.
- **Onda 5 , Acervo avançado + showcase:** série/linha, comparativos, **mapa do Brasil** (hover
  destacando estado; 3D como teto). Servidor MCP externo (casca) se/quando externalizar.
- **Seguintes:** mais domínios, exportação.

---

## 8. Edição manual limitada (onda 2)

Permitido: editar título/subtítulo; trocar template por outro **compatível com o mesmo shape
derivado** (lista filtrada); trocar ícone (do set); reordenar seções; ajustar rótulos. **Cor:**
travada na semântica por padrão; troca só em paletas semanticamente seguras. **Proibido na mão:**
criar seção/fonte, escrever fórmula, mudar a fonte (só por prompt). Resize/posição de widget é
onda 4. Concorrência: `etag` + escrita otimista (conflito → recarrega e reaplica).

---

## 9. Segurança, limites e custo de IA

- **Sem code-gen:** agente só emite `ReportEntry` validado (schema + compatibilidade). Fonte
  sempre por referência a query auditada.
- **Medição de IA (onda 1):** reusa o **billing existente** (`LlmUsage` + `usage-logger`),
  que já contabiliza tokens/custo por chamada. O construtor só acrescenta o **teto duro** por
  período (na config do construtor, §4.8, só super_admin); ao atingir, **bloqueia** novas
  construções com mensagem. Modelo escolhido na config do construtor (§4.8), via catálogo e
  whitelist existentes.
- **Limites:** nº de seções por relatório (e, onda 4, widgets por painel) parametrizáveis.

---

## 10. Versionamento

`schemaVersion` na ficha; migrators por bump. Ao abrir ficha salva, valida contra o catálogo
atual: fonte/template órfão → **estado de erro explícito** (nunca quebra silenciosa).

---

## 11. Critério de aceite da onda 1 (linha de chegada objetiva)

Contra o **dado real** do cache (E2E), a onda 1 está validada quando:
- de um conjunto fixo de **8 prompts-alvo de estoque** (definidos no plano), **pelo menos 7/8**
  produzem **ficha válida** que **renderiza** sem erro;
- em **≥ 6/8**, o agente escolhe um **template plausível** para o shape do dado (golden cases
  com asserção tolerante: valida ficha + classe de template, não a ficha exata);
- **2 pedidos sem fonte** produzem **recusa honesta** + log de gap (zero alucinação);
- o **teto de IA** bloqueia ao ser atingido (teste determinístico);
- `tsc` raiz+mcp 0, `jest` verde, sem regressão.

---

## 12. Riscos e mitigações

- **Motor genérico é grande.** Reconhecido como a frente principal da onda 1; 1 template só.
- **Derivação de shape espalhada nos wrappers.** Extraída para adaptadores nomeados, testáveis.
- **Agente errar ficha/escolha.** Enums fechados + loop de reparo + teto + golden tolerantes.
- **Acoplamento ao Nex.** Catálogo de fontes próprio; handlers como biblioteca neutra.
- **Custo do servidor MCP.** Adiado; onda 1 chama handlers in-app.
- **Custo de IA.** Medição + teto duro na onda 1.
- **Preview pesado.** Dois níveis (validar barato / render sob demanda).
- **Fonte do exemplo.** Verificar no início do plano quais cortes de estoque existem.
- **Vazamento para produção.** Regra de raiz.

---

## 13. Fora de escopo (YAGNI por ora)

Editor arrasta-e-solta livre; IA gerando código em runtime; skill em runtime; exportação/
agendamento; servidor MCP externo na onda 1 (vem com a externalização).

---

## 14. Pontos fechados

1. Provedor/modelo: **selecionável na config do construtor** (§4.8, padrão do Agente Nex,
   reusa `LlmCredential`/`LlmModelEntry`/`LlmUsage`); default sugerido OpenAI `gpt-5-mini`.
2. Ficha: **`ReportEntry` estendido** (diff em §4.3), não modelo paralelo.
3. Motor: **genérico novo** (a F3 é estática); maior frente da onda 1.
4. MCP: handlers como **biblioteca**; servidor é casca para externalização futura.
5. Onda 1: tela cheia, estoque, **rascunho pessoal**, 1 template (DataTable).
6. Grid de painel: encaixe discreto (onda 4).

> **Verificação no início do PLAN (não bloqueante):** rodar contra o cache real para fixar os
> 8 prompts-alvo da onda 1 em fontes 100% disponíveis (confirmar se "estoque por estado" tem
> fato; se não, usar armazém/família/valor que já existem).
