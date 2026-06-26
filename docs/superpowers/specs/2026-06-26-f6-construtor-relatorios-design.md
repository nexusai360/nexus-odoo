# F6 , Construtor de Relatórios (SPEC v2)

> **Status:** SPEC v2 (incorpora as 2 reviews adversariais da v1). Falta a 2ª
> rodada de review sobre esta v2 antes da v3.
> **Branch de trabalho:** `feat/nex-reconstrucao` (decisão do usuário 2026-06-26).
> **Regra de raiz (inegociável):** TUDO desta fase fica **somente local** e **não
> sobe para produção** sem aprovação explícita do usuário. Sem merge para `main`,
> sem deploy, sem migration em prod. Ver bloco no topo do `CLAUDE.md`.
> **Metodologia:** SPEC v1 → 2 reviews → v2 (aqui) → review → v3 → PLAN v1→v3 →
> execução (superpowers, ondas/tasks, TDD, `ui-ux-pro-max` em todo front-end,
> consistência com o design da plataforma).

> **Mudou v1 → v2 (resumo dos achados aplicados):**
> - A ficha **reusa o `ReportEntry` da F3** (não cria modelo paralelo). O motor de
>   render é o `report-view.tsx` existente, estendido.
> - Contrato de dado por fonte = **`outputSchema` do `ToolEntry`** (já existe).
> - **Recusa honesta (Caminho 3)** e "limitado pelos fatos existentes" de volta.
> - **RBAC de consumo entra na onda 1** (gate de domínio reavaliado no consumo).
> - **Persistência modelada** (modelo Prisma `SavedReport`).
> - **Onda 1 recortada de novo** (a fundação de render já existe, então a onda 1
>   foca no que falta: persistir ficha dinâmica + agente + MCP de construção).
> - **Catálogo de componentes com formato concreto** + exemplo fim a fim.
> - **Medição de IA desenhada**; **provedor fechado em OpenAI `gpt-5-mini`**.
> - Loop de **reparo de ficha**, **enums fechados** e **teto de iterações** no agente.

---

## 1. Objetivo

Dar a `super_admin`/`admin` um **construtor de relatórios in-app** onde a pessoa
**descreve em linguagem natural** o relatório e a plataforma o **monta sozinha**, a
partir de uma **biblioteca de componentes padronizada**, e pode **publicar** o
relatório para perfis que o consomem. Caminho primário: **prompt**. Edição manual
existe, porém **limitada** (ajustar o que já está posto, nunca criar estrutura nova).

Duas formas de entrega, em ondas distintas:
- **Relatório de tela cheia:** página inteira, acessível na seção **Relatórios**
  (cards clicáveis). É a onda 1.
- **Widget + Painéis:** widget adicionável a um **Painel** montável; tamanho por
  **grid de encaixe** (tamanhos discretos), quantidade limitada por parâmetro. Onda 3.

Valor central: montar por conversa e ajustar na mão sobre **uma mesma ficha
declarativa**, **sem nunca gerar código em produção**, e **só alcançando o que já
existe como dado** (com recusa honesta quando não dá).

---

## 2. Fundação que JÁ existe (a F6 estende, não recria)

A F3 entregou a base declarativa. A F6 a reusa:

- **Ficha:** `ReportEntry` (`src/lib/reports/types.ts` + `catalog.ts`):
  `{ id, titulo, dominio, descricao, icone, modeloFonte, temporal?, secoes[] }`.
- **Seções:** `secoes[] { id, template, fato, config, filtros[] }`, com
  `template ∈ { KPIRow, DataTable, BarChart, LineChart, PieChart }` (a biblioteca
  inicial já existe e está testada).
- **Filtros:** modelados por seção (`filtros: [{ tipo: "armazem" }, { tipo: "familia" }]`),
  com controles de UI prontos (`report-filters`, `warehouse-filter`, `family-filter`,
  `period-bar`, presets via modelo Prisma `ReportPreset`).
- **Motor de render:** `src/app/(protected)/relatorios/[id]/report-view.tsx` +
  `src/components/charts/*` + `src/components/reports/*`. Já desenha `ReportEntry`.
- **Fonte de dado:** `modeloFonte`/`fato` resolvem para as `queries/*.ts`
  (ex.: `querySaldoProduto`, `queryValorArmazem`), com shape conhecido. O wrapper
  `report-data.ts` injeta estado/freshness.
- **Contrato de dado por fonte:** cada `ToolEntry` do catálogo MCP já carrega
  `outputSchema` (`mcp/catalog/types.ts`). É o contrato que o construtor usa para
  saber o que uma fonte entrega.

Consequência: o F6 **não inventa** ficha, motor nem biblioteca base. Ele adiciona:
(1) **persistir `ReportEntry` dinâmicos** criados pelo usuário; (2) o **agente
construtor**; (3) o **MCP de Construção**; (4) a **tela de chat+preview**;
(5) ao longo das ondas, **novos templates** (mapa, etc.), edição manual e painéis.

---

## 3. Decisões canônicas (travadas com o usuário)

1. **Config-driven, nunca code-gen.** Relatório é `ReportEntry` validado por schema
   (Zod). Motor genérico renderiza. A IA produz/edita a ficha, nunca escreve
   React/SQL para produção. Risco zero de quebrar a plataforma.
2. **MCP separado e exclusivo.** Servidor MCP próprio para construção, distinto do
   MCP do Nex. Mesma base de engenharia como molde, catálogo e tools exclusivos.
   **Mecanismo de dado:** o MCP de Construção referencia a **camada de queries
   compartilhada** (`src/lib/reports/queries` + catálogo de fontes) por **import**,
   não chama o servidor MCP do Nex em runtime (sem acoplamento cross-processo). A
   separação é de **catálogo e responsabilidade** (construir vs responder), não de
   duplicação de dados.
3. **Agente construtor: provedor OpenAI `gpt-5-mini`** (mesmo de produção/Nex),
   padrão de orquestração agente↔tools do Nex, porém isolado (prompt, catálogo e
   sessão próprios). Decisão fechada (atualiza a ideia antiga de usar a API do Claude).
4. **Design pela `ui-ux-pro-max` em design-time, embutido nos componentes.** A IA
   não desenha em runtime; só escolhe e parametriza peças que já nasceram lindas e
   consistentes com a plataforma.
5. **Biblioteca grande, diversa e milimetricamente documentada** (ver §6: formato do
   catálogo de componentes). A documentação é o que faz o agente achar o componente
   certo.
6. **Edição manual limitada** (ver §8): ajustar o existente, nunca criar estrutura.
7. **Limitado pelos fatos existentes + recusa honesta (Caminho 3).** O construtor só
   alcança o que há como `fato_*`/query auditada. Quando o pedido não cabe, **recusa
   com honestidade** ("esse dado não existe ainda / consigo de tal forma") e **registra
   o gap** (reusa `feature_requests`/`registrar_lacuna`). Nunca alucina dado.
8. **Só local até aprovação** (regra de raiz).

---

## 4. Arquitetura macro

```
┌──────────────────────────────────────────────┐
│  Construtor (tela): chat + pré-visualização   │
│  reusa mecânica do Playground + bubble do Nex │
└───────────────┬───────────────────────────────┘
                │ prompt
                ▼
┌──────────────────────────────┐  tools (enum)  ┌─────────────────────────┐
│  Agente construtor (OpenAI)  │───────────────▶│  MCP de Construção       │
│  loop com teto de iteracoes  │◀───────────────│  (servidor próprio)      │
│  + loop de reparo de ficha   │  ReportEntry    │  tools exclusivas:       │
└──────────────┬───────────────┘                │  catalogo + montar ficha │
               │ produz/edita                    │  + prever_dado (import)  │
               ▼                                  └────────────┬────────────┘
┌──────────────────────────────┐                              │ import (não RPC)
│  ReportEntry (ficha) validada │                             ▼
│  + estado rascunho/publicado  │            ┌──────────────────────────────┐
│  persistida em SavedReport    │            │  Camada de queries existente  │
└──────────────┬─────────────────┘           │  src/lib/reports/queries/*    │
               │ renderiza                     │  + outputSchema (contrato)    │
               ▼                               └──────────────────────────────┘
┌──────────────────────────────┐
│  Motor de render (F3 estendido)│  gate de domínio reavaliado no CONSUMO
│  + biblioteca de componentes   │
└──────────────────────────────┘
```

### 4.1 Resolução de fonte (sem SQL livre)

- Cada `secao` referencia um par `modeloFonte`/`fato` que mapeia para uma **query
  auditada existente** (registry de fontes). Nunca SQL livre.
- O **contrato** de cada fonte é o `outputSchema` correspondente: define os campos
  disponíveis (KPIs, colunas, séries). O agente lê esse contrato via `prever_dado`
  e só monta seções cujo `template` é compatível com o shape da fonte (ex.: `PieChart`
  exige uma dimensão categórica + uma medida; `KPIRow` exige escalares).
- A **compatibilidade fonte×template** é validada: além do schema da ficha, há uma
  checagem de que a fonte entrega o shape que o template precisa. Ficha que passa no
  Zod mas é incompatível é rejeitada com mensagem, não renderiza quebrada.

### 4.2 Filtros e parâmetros

- **Filtro de seção** (já na F3): `filtros: [{ tipo }]`, fixo na ficha.
- **Parâmetro de ficha (runtime):** período/armazém/família que o consumidor ajusta
  ao ver o relatório, refluindo em várias seções. Modelado no topo da ficha como
  `parametros[]` com binding `parametro → seções`. A F3 já tem `temporal` +
  controles de filtro; a F6 generaliza para "um parâmetro liga a N seções".
- Ordem de resolução: parâmetros de ficha (runtime) sobrepõem defaults; filtros de
  seção restringem dentro disso.

### 4.3 Persistência (modelo Prisma novo)

`SavedReport` (migration só em dev local, regra de raiz):
- `id`, `tipo` (`tela_cheia` | `widget`), `titulo`, `entry` (JSON do `ReportEntry`),
  `schemaVersion`, `status` (`rascunho` | `publicado`), `criadoPor` (userId),
  `visibilidadeConsumo` (quais roles/usuários consomem), `criadoEm`/`atualizadoEm`.
- Versão do schema da ficha para migração (ver §10).
- Auditoria de criação/edição/execução reusa o padrão atual.

### 4.4 Agente construtor (robustez)

- **Enums fechados:** os inputs das tools de construção usam enums derivados do
  catálogo real (templates válidos, fontes válidas, tipos de filtro). O agente não
  pode referenciar chave inexistente.
- **Teto de iterações:** o loop agente↔tools tem máximo de passos; ao estourar, para
  com mensagem honesta (não loop infinito de tools).
- **Loop de reparo:** se a ficha não passa na validação (schema ou compatibilidade
  fonte×template), o erro volta ao agente como feedback estruturado para uma nova
  tentativa, limitada a N tentativas; depois, fallback honesto.
- **Recusa honesta:** se não há fonte para o pedido, o agente diz o que não dá e
  registra o gap, sem inventar.

### 4.5 Tela de construção (chat + preview)

Layout dividido: conversa de um lado, pré-visualização ao vivo do outro. Reusa a
mecânica de chat do **Playground do Nex** e a **animação de "pensando" da bubble**.
O preview re-renderiza a ficha **com debounce** (não dispara consulta a cada
caractere). Localização na navegação e refino visual ficam comigo (com a skill).

---

## 5. RBAC, visibilidade e consumo

- **Acesso ao construtor:** só `super_admin`/`admin`. `manager`/`viewer` não constroem.
- **Papéis reais do projeto:** `super_admin`, `admin`, `manager`, `viewer` (não existe
  papel "owner"; o "dono" é o `criadoPor`). A visibilidade usa esses papéis.
- **Visibilidade de autoria:** `super_admin` vê todos os relatórios salvos; `admin` vê
  os seus (e os publicados para ele).
- **Publicação para consumo (na ficha desde a onda 1):** `visibilidadeConsumo` define
  quais perfis/usuários veem o relatório pronto. É isso que faz o construtor servir
  para distribuir relatório (senão seria ferramenta pessoal do admin).
- **Gate de domínio no CONSUMO (onda 1):** ao **abrir** um relatório, o acesso à
  `fonte`/domínio é reavaliado contra **quem consome** (reusa `visibleDomains`), não
  só contra o criador. Um consumidor nunca vê dado de domínio que não poderia ver no
  dashboard.
- Tudo auditado (criar/editar/publicar/abrir).

---

## 6. Biblioteca de componentes e catálogo documentado

A biblioteca cresce por ondas e **nunca fecha**. Cada componente é fechado e
parametrizável, desenhado com `ui-ux-pro-max`, consistente com a plataforma.

**Formato do catálogo (legível por humano e máquina)** , cada entrada:
- `chave` (ex.: `PieChart`), `nome`, `paraQueServe`.
- `quandoUsar` / `quandoNaoUsar` (orienta a escolha do agente).
- `dadoIdeal`: shape de dado que o componente espera (dimensões/medidas), casado com
  o `outputSchema` das fontes compatíveis.
- `parametros`: opções expostas (agrupamento, formato de número, paleta da lista fixa,
  rótulos, ordenação).
- `interacao`: capacidades de interação suportadas (hover, tooltip, drill, seleção,
  cross-filter) , **declaradas desde já**, mesmo que só implementadas em ondas futuras.
- `tokensVisuais`: espaçamento/sombra/hover/efeito/animação por estado, referenciando
  os tokens do design system (não valores soltos).

> **Exemplo fim a fim (entrada de catálogo, `PieChart`):**
> ```
> chave: "PieChart"
> nome: "Gráfico de pizza"
> paraQueServe: "Distribuição de uma medida entre poucas categorias (até ~8)."
> quandoUsar: "Composição/participação (ex.: estoque por família)."
> quandoNaoUsar: "Séries temporais, muitas categorias, comparação precisa de valores."
> dadoIdeal: { dimensao: 1 categórica, medida: 1 numérica, linhas: "<= 8 ideal" }
> parametros: { rotulo, formato: moeda|numero|percentual, paleta: <lista fixa>, ordenar }
> interacao: { hover: realce do setor, tooltip: valor+percentual, drill: opcional }
> tokensVisuais: { sombra: card.sm, hover: realce.tonal, animacao: entrada.scale.150ms }
> ```

O contrato `interacao` é o que garante que componentes ricos (mapa do Brasil com
hover destacando estado, drill-down) **cabem na fundação** sem reescrever o motor:
a ficha já sabe declarar interação.

Catálogo inicial (onda 1, reusando F3): `KPIRow`, `DataTable`, `BarChart`, `PieChart`.
Avançados (ondas seguintes): `LineChart`/série, `comparativo_periodo`, `badge_status`,
`mapa_brasil` (hover destacando estado; efeito 3D é o teto, onda de showcase), etc.

---

## 7. Decomposição em ondas

A fundação de render e a biblioteca base já existem (F3). As ondas focam no que falta.

- **Onda 1 , Construtor de relatório de tela cheia (fatia fina REAL):**
  - Modelo `SavedReport` + persistência (rascunho/publicado) , migration dev local.
  - MCP de Construção com tools essenciais: `listar_componentes`, `descrever_componente`,
    `listar_fontes`, `prever_dado`, `criar_relatorio`, `adicionar_secao`, `editar_secao`,
    `remover_secao`, `definir_filtro`, `validar`.
  - Agente construtor (OpenAI) com enums fechados, teto de iterações e loop de reparo.
  - Tela chat + preview (reusa Playground/bubble), preview com debounce.
  - Reuso do motor `report-view.tsx` e dos templates `KPIRow/DataTable/BarChart/PieChart`.
  - **1 domínio: estoque** (queries já existem e comprovadas: `querySaldoProduto`,
    `queryValorArmazem` por armazém/família; "por estado" só se houver fato, ver §12).
  - RBAC: construtor gated a super_admin/admin; **gate de consumo por domínio** ativo.
  - Recusa honesta para pedido sem fonte.
  - Medição de IA mínima (ver §9): contador + teto duro por usuário/instância.
  - **Critério de aceite (§11).**
- **Onda 2 , Edição manual limitada (tela cheia):** trocar título, trocar template de
  uma lista compatível, trocar ícone (seletor com busca), reordenar seções, sobre a
  mesma ficha. Sem grid (ainda não há widget).
- **Onda 3 , Painéis e widgets:** `tipo: widget`, seção Painéis, grid de encaixe
  (tamanhos discretos), limites por painel, edição manual de widget (resize no grid).
- **Onda 4 , Acervo avançado + showcase:** série/linha, comparativos de período,
  badges, e o **mapa do Brasil com hover destacando estado** (efeito 3D como teto).
- **Ondas seguintes:** mais domínios, mais componentes, permissões finas, exportação.

Cada onda tem sua spec/plan de detalhe quando chegar.

---

## 8. Edição manual limitada (fronteira clara)

Permitido (onda 2, tela cheia): editar texto de título/subtítulo; trocar o template de
uma seção **por outro compatível com a mesma fonte** (lista filtrada); trocar ícone
(seletor com busca); reordenar seções; ajustar rótulos. **Cor:** travada na semântica
do componente por padrão; troca só dentro de paletas semanticamente seguras (não
permitir, por ex., pintar um KPI negativo de verde). **Proibido na mão:** criar
seção/fonte nova, escrever fórmula, mudar a fonte de dado (isso só por prompt).
Edição de widget no grid (resize/posição) é **onda 3**, não onda 2.

Concorrência: a ficha tem `schemaVersion` + etag; edição manual e por prompt usam
escrita otimista (quem grava confere o etag; conflito → recarrega e reaplica).

---

## 9. Segurança, limites e custo de IA

- **Sem code-gen:** agente só emite `ReportEntry` validado por schema + compatibilidade
  fonte×template. Fonte sempre por referência a query auditada.
- **Medição de consumo de IA (desde a onda 1):** unidade = **tokens por chamada**,
  contabilizados **por usuário** e **agregado da instância** (single-tenant). Teto
  **duro** por período (configurável em Configuração, só super_admin); ao atingir,
  **bloqueia** novas construções com mensagem (não degrada silenciosamente). O preview
  só chama a IA em turno de construção (debounce evita rajada). "Seleção de modelo por
  perfil" da ideia antiga é simplificada: modelo único configurável globalmente.
- **Limites do construtor:** nº de seções por relatório e (onda 3) de widgets por
  painel, parametrizáveis.

---

## 10. Versionamento e fichas salvas

- `schemaVersion` na ficha; **migrators versionados** por bump.
- Ao abrir uma ficha salva, ela é **validada contra o catálogo atual**: fonte/template
  órfão (renomeado/removido) gera **estado de erro explícito** no relatório (não quebra
  silenciosa), com caminho de correção.

---

## 11. Critério de aceite da onda 1 (linha de chegada objetiva)

A onda 1 está validada quando, contra o **dado real** do cache (E2E):
- um conjunto de **prompts-alvo** (mínimo definido no plano, ex.: 8 pedidos de estoque)
  produz **ficha válida** e **render correto** em pelo menos a maioria deles;
- o agente escolhe um **componente plausível** para o formato do dado (avaliado por
  golden cases com asserção **tolerante**: valida validade da ficha + classe de
  componente, não a ficha exata);
- um pedido **sem fonte** produz **recusa honesta** + log de gap (não alucinação);
- o **gate de consumo** impede um consumidor de ver domínio fora do seu acesso;
- o **teto de IA** bloqueia ao ser atingido.

---

## 12. Riscos e mitigações

- **Escopo épico.** Mitigado: a fundação de render já existe; onda 1 foca no que falta.
- **Agente escolher visualização ruim / ficha inválida.** Enums fechados + loop de
  reparo + teto de iterações + golden cases tolerantes + edição corretiva.
- **Combinação fonte×template impossível.** Checagem de compatibilidade além do Zod.
- **Inconsistência visual.** Design embutido (skill em design-time) + tokens.
- **Vazamento entre domínios no consumo.** Gate reavaliado no consumo (onda 1).
- **Custo de IA sem teto.** Medição + teto duro desde a onda 1.
- **Componentes ricos forçarem refazer a fundação.** Contrato `interacao` declarado
  desde já no catálogo.
- **Fonte do exemplo inexistente.** "Por estado" para estoque só entra se houver fato;
  onda 1 usa fontes comprovadas (armazém/família). Verificar no início do plano.
- **Vazamento para produção.** Regra de raiz (só local até aprovação).

---

## 13. Fora de escopo (YAGNI por ora)

- Editor "arrasta e solta" completo / criação livre de componentes pela pessoa.
- IA gerando código de componente em produção.
- Skill `ui-ux-pro-max` em runtime.
- Exportação (PDF/Excel), agendamento e envio automático (ondas posteriores, se desejado).

---

## 14. Pontos fechados (não são mais dúvidas)

1. Provedor: **OpenAI `gpt-5-mini`** (decisão do usuário).
2. Ficha: **reusa `ReportEntry` da F3** (não cria modelo paralelo).
3. Onda 1: **tela cheia**, domínio **estoque**, fontes comprovadas (armazém/família).
4. Grid de painel: **encaixe discreto** (onda 3).
5. MCP **separado** (decisão do usuário), referenciando a camada de queries por import.

> **Pendência de verificação técnica (no início do PLAN, não bloqueante agora):**
> confirmar contra o dado real quais cortes de estoque existem ("por estado" tem fato?)
> para fixar os prompts-alvo da onda 1 em fontes 100% disponíveis.
