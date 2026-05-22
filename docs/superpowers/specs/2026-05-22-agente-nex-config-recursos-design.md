# Reorganização da Configuração do Agente Nex + Modo Raciocínio + Catálogo Atualizável

> **SPEC v1** — design inicial. Passará por duas reviews críticas (v2, v3)
> antes de virar plano. Data: 2026-05-22. Branch: `feat/f4-leitura-expansao`.
> Agente: `claude-agente-nex-config-recursos`.

## 1. Objetivo

Três frentes, entregues numa só leva (decisão do usuário):

1. **Reorganização de telas** — a seção "Recursos" sai da tela de Prompt e vai
   para a tela de Configuração; respiro visual entre "Chave de API" e "Consumo
   desta chave".
2. **Modo raciocínio** — novo recurso na seção Recursos: liga/desliga o modo
   thinking do modelo por ambiente (3 status), com seletor de nível de esforço
   e exibição de custo. Travado quando o modelo não suporta raciocínio.
3. **Catálogo de modelos atualizável** — botão "atualizar" no cabeçalho Modelo
   e scripts por provedor que mantêm o catálogo (nomes, preços, modelos novos)
   sem quebrar a plataforma.

## 2. Requisitos confirmados

Do pedido do usuário e das decisões de brainstorming (2026-05-22):

- A seção Recursos é configuração, não prompt → vai para a tela de Configuração.
- Respiro entre "Chave de API" e "Consumo desta chave": **pequeno**, sutil.
- Modo raciocínio fica **antes** da Entrada de áudio na seção Recursos.
- Modo raciocínio segue o mesmo padrão visual dos outros cards de recurso.
- 3 status (Desativado / Playground / Produção), igual aos demais recursos.
- Travado em "Desativado" quando o modelo ativo não suporta raciocínio.
- Seletor de **nível** de raciocínio (minimal / low / medium / high, e mais
  quando o modelo oferecer) num menu suspenso, no card.
- Exibir o **custo** do raciocínio com **tag de preço** no padrão das tags dos
  modelos.
- **Raciocínio adaptativo**: o nível escolhido é o teto; o modelo modula
  internamente quanto pensa conforme a complexidade (decisão confirmada).
- Vale para Playground e para o agente em produção (bubble + WhatsApp),
  conforme o status escolhido.
- Catálogo: arquitetura **híbrida** (base no código + atualizações no banco) —
  decisão técnica delegada ao Claude (ver §6).
- Scripts de atualização por provedor; preço via **pricing versionado +
  curadoria** (decisão confirmada).
- Entrega única cobrindo as 3 frentes (decisão confirmada).

## 3. Coordenação multi-agente (REGRA DO USUÁRIO)

Há o agente `claude-agente-nex-melhorias` ativo no mesmo território. Regra
firme do usuário: nos **arquivos compartilhados** eu sempre espero ele terminar
antes de tocar; nos **arquivos exclusivos meus** avanço em paralelo.

| Arquivo | Quem toca | Minha conduta |
|---|---|---|
| `src/components/agent/resources-toggles.tsx` | ele (Fase E3) + eu | **Esperar ele terminar** |
| `src/lib/actions/agent-config.ts` | ele + eu | **Esperar ele terminar** |
| `prisma/schema.prisma` | `f4-leitura` + `melhorias` + eu | **Esperar terminarem** |
| `src/lib/agent/llm/providers/openai.ts` | ele (Fase E2) | **Esperar / coordenar** |
| `src/app/(protected)/agente/prompt/page.tsx` | só eu | exclusivo |
| `src/app/(protected)/agente/configuracao/page.tsx` | só eu | exclusivo |
| `src/components/agent/llm-config-form.tsx` | só eu | exclusivo |
| `src/lib/agent/llm/catalog.ts` | só eu | exclusivo |
| componente novo de raciocínio (arquivo novo) | só eu | exclusivo |
| `scripts/sync-models-*` (arquivos novos) | só eu | exclusivo |

**Sobreposição de feature — modo raciocínio.** O plano do `claude-agente-nex-melhorias`
tem uma "Fase E" que também adiciona controle de raciocínio (`reasoningEffort`
em `AgentSettings`, controle na tela de Recursos, wiring no provider). O pedido
detalhado do usuário (3 status + nível + custo + tag + travamento) é **mais rico**
e foi dado a este agente. **Decisão de coordenação:** o controle de raciocínio
(UI + modelo de dados + persistência) é escopo deste agente; o
`claude-agente-nex-melhorias` não deve duplicar a Fase E. O wiring do parâmetro
na requisição LLM é ponto único — quem chegar primeiro coordena com o outro.
Este ponto precisa ser alinhado pelo usuário entre os dois terminais.

## 4. Frente 1 — Reorganização de telas

### 4.1 Mover a seção Recursos

Estado atual:
- `prompt/page.tsx` renderiza 4 cards: Identidade base, Comportamento,
  **Recursos** (`<ResourcesToggles>`), Base de conhecimento.
- `configuracao/page.tsx` renderiza 1 card: `<LlmConfigForm>`.

Alvo:
- `prompt/page.tsx` fica com 3 cards: Identidade base, Comportamento, Base de
  conhecimento. Subtítulo do `PageHeader` deixa de citar "recursos".
- `configuracao/page.tsx` passa a renderizar 2 cards: `<LlmConfigForm>` e, abaixo,
  um card "Recursos" com `<ResourcesToggles>`. Subtítulo do `PageHeader` passa a
  citar os recursos.
- A lógica de carregamento que hoje vive em `prompt/page.tsx` (montar
  `credentialsByProvider`, `initialResources`, chamar `getAgentSettings` /
  `listCredentials`) **migra** para `configuracao/page.tsx`. A `prompt/page.tsx`
  para de carregar credenciais e o bloco `initialResources`.

`<ResourcesToggles>` é movido **sem mudança de comportamento** nesta frente — só
de tela. A frente 2 adiciona o card de raciocínio dentro dele.

### 4.2 Respiro Chave de API ↔ Consumo

Dentro do `llm-config-form.tsx`, entre o seletor "Chave de API" e o bloco
"Consumo desta chave", aumentar o espaçamento vertical de forma **sutil** (um
degrau na escala de espaçamento do projeto, p.ex. de `mt-2`/`mt-3` para o
próximo degrau). Sem separadores novos, sem espaço grande. O valor exato é
calibrado na implementação consultando `ui-ux-pro-max`.

## 5. Frente 2 — Modo raciocínio

### 5.1 Modelo de dados (`AgentSettings`)

Dois campos novos em `AgentSettings`:
- `reasoningCheckpoint` — `CheckpointState` (`OFF` | `PLAYGROUND` | `PRODUCTION`),
  default `OFF`. Igual aos checkpoints de áudio/imagem.
- `reasoningEffort` — `String?` (`minimal` | `low` | `medium` | `high` e os
  extras por modelo). `null` = nível default do provider.

> **Coordenação de schema:** o `claude-agente-nex-melhorias` também planejou
> `reasoningEffort`. Antes de migrar, checar `git log -3 -- prisma/schema.prisma`
> e o estado do `AgentSettings`: se ele já adicionou `reasoningEffort`, este
> agente só adiciona `reasoningCheckpoint`; senão adiciona os dois. Esperar
> qualquer migration em curso terminar (regra de coordenação §3).

### 5.2 Catálogo — capacidade de raciocínio

O `ModelEntry` em `catalog.ts` ganha um campo opcional:

```ts
/** Suporte a modo raciocínio (thinking). Ausente = não suporta. */
reasoning?: {
  /** Níveis de esforço aceitos, do menor ao maior. */
  levels: ReasoningLevel[];
};
```

`ReasoningLevel` é um union (`"minimal" | "low" | "medium" | "high"` e extras
como `"max"` quando o provider oferecer). O preenchimento de quais modelos
suportam e com quais níveis exige **pesquisa** (ver §7).

### 5.3 UI — card "Modo raciocínio"

Novo `ResourceCard` no `ResourcesToggles`, posicionado **antes** da Entrada de
áudio. Estrutura:
- Ícone (cérebro), título "Modo raciocínio", subtítulo explicando o recurso.
- `FeatureCheckpoint` (3 status) à direita, como nos demais cards.
- **Quando o modelo de produção ativo não suporta raciocínio**: o
  `FeatureCheckpoint` fica travado em `OFF` (`disabled`), com nota curta
  ("O modelo atual não suporta raciocínio").
- **Quando suporta**: na área do card aparece o **seletor de nível** (menu
  suspenso `CustomSelect`/`SearchableSelect`) com os níveis do modelo, e a
  **exibição de custo**: o custo de output do modelo ativo (base do custo de
  raciocínio, já que os tokens de thinking são cobrados como tokens de saída) e
  uma **tag** no padrão `TierBadge` indicando o impacto de custo do nível
  selecionado (minimal = menor, high = maior). A tag é uma indicação de
  impacto, não um preço/1M fechado — os tokens de raciocínio variam por
  pergunta.
- Layout exato (posição do seletor de nível vs status, espaçamento) definido na
  implementação com `ui-ux-pro-max`, mantendo a consistência com os outros cards.

### 5.4 Wiring na requisição LLM

Quando `reasoningCheckpoint` libera o recurso para o ambiente corrente
(Playground ou produção) e o modelo ativo suporta raciocínio, a requisição ao
provider inclui o parâmetro de esforço (`reasoning_effort` na OpenAI; o
equivalente nos demais providers). O nível enviado é o `reasoningEffort`
configurado. O comportamento adaptativo é nativo do modelo: o nível é o teto e
o modelo modula. Quando o recurso está `OFF` para o ambiente, nada é enviado e
o modelo opera no default.

> O wiring por provider toca `src/lib/agent/llm/providers/*`. O
> `claude-agente-nex-melhorias` declarou `openai.ts`. Coordenar (§3).

## 6. Frente 3 — Catálogo de modelos atualizável

### 6.1 Arquitetura híbrida (decisão técnica)

- `catalog.ts` permanece a **base versionada no código** — sempre presente; é o
  piso garantido. Se o banco for recriado/esvaziar, a plataforma cai na base e
  não fica sem catálogo.
- Tabela nova no banco (`LlmModelEntry` ou similar) guarda **adições e
  atualizações** (modelos novos descobertos, preços atualizados).
- Catálogo efetivo em runtime = **merge** da base do código com os registros do
  banco (o do banco tem precedência por id). Banco vazio = usa só a base.
- As funções públicas (`getModel`, `listModels`, `calculateCost`, etc.) passam a
  ler do catálogo efetivo. A leitura é assíncrona ou usa um cache em memória
  revalidado — definido no plano (impacto: hoje são funções síncronas).

### 6.2 Botão "atualizar" + Server Action

- Botão "atualizar" ao lado do cabeçalho "Modelo" no `llm-config-form.tsx`.
- Ao clicar: Server Action consulta a API oficial do provedor selecionado
  (listagem de modelos), compara com o catálogo efetivo, e faz upsert dos
  modelos novos / mudanças na tabela do banco. Retorna um resumo do que mudou.
- Preço: a API do OpenRouter fornece preço; OpenAI/Anthropic/Gemini não — para
  esses, o modelo novo entra com `pricing: null` (sinalizado para curadoria) e
  o restante (nome/id) é preenchido. `costKnown=false` já trata preço ausente.

### 6.3 Scripts CLI por provedor

- `scripts/sync-models.ts` — script único que detecta/recebe o provedor e roda
  a sincronização (lista via API, compara, atualiza). Internamente despacha
  para a lógica de cada provedor (OpenAI, Anthropic, Gemini, OpenRouter).
- Os scripts e a Server Action compartilham a mesma camada de sincronização
  (`src/lib/agent/llm/sync-catalog.ts` — novo) para não duplicar lógica.
- Periodicamente, um modo do script "promove" overrides estáveis do banco de
  volta para o `catalog.ts` versionado (consolidação), mantendo a base no
  código atual.

## 7. Pesquisa necessária

O preenchimento de `reasoning` em `catalog.ts` (quais modelos suportam thinking
e com quais níveis) exige consultar a documentação oficial dos provedores
(OpenAI, Anthropic, Gemini, e os modelos via OpenRouter). É uma task de
**pesquisa web** no plano, com resultado revisável (uma tabela modelo →
suporte). Sem isso, o travamento do card de raciocínio não é confiável.

## 8. Não-objetivos

- Não reescrever o `ResourcesToggles` inteiro — só acrescentar o card de
  raciocínio e movê-lo de tela.
- Não migrar todo o catálogo para o banco — a base no código permanece.
- Não fazer scraping de páginas de pricing (decisão: pricing versionado).
- Não tocar a bubble, o playground de chat, o prompt nem o progresso — isso é
  escopo do `claude-agente-nex-melhorias`.
- Não implementar classificador de raciocínio (decisão: nível como teto).

## 9. Riscos

1. **Sobreposição com `claude-agente-nex-melhorias`** — modo raciocínio e
   arquivos compartilhados. Mitigado pela regra de coordenação §3.
2. **Catálogo síncrono → assíncrono** — `getModel`/`calculateCost` são síncronos
   hoje e usados em vários lugares (logger de uso, selects). Tornar o catálogo
   mutável não pode quebrar esses consumidores. O plano deve mapear todos os
   consumidores e definir a estratégia (cache em memória revalidado é o
   provável caminho para manter a API síncrona).
3. **Pesquisa de suporte a raciocínio** — informação que muda; a tabela precisa
   de fonte confiável e data de verificação.
4. **APIs dos provedores nos scripts** — exigem chave de API; o script precisa
   degradar com elegância quando uma chave falta.

## 10. Verificação

- `tsc` / `eslint` / `jest` / `next build` verdes.
- Teste manual contra dado real (regra de raiz `CLAUDE.md §9`): subir o app,
  conferir as duas telas reorganizadas, o card de raciocínio (travado e
  liberado), o botão atualizar, e exercer uma requisição com raciocínio ligado.
- Code review + UI review na etapa [10].
