# Reorganização da Configuração do Agente Nex + Modo Raciocínio + Catálogo Atualizável

> **SPEC v3 (FINAL)** — após a Review #1 e a Review #2 (12 achados materiais
> aplicados; histórico no fim). Pronta para o plano. Data: 2026-05-22.
> Branch: `feat/f4-leitura-expansao`. Agente: `claude-agente-nex-config-recursos`.

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

**Ordem de implementação (diretriz firme).** A implementação começa pelos
arquivos **exclusivos**: `catalog.ts`, a camada de sync do catálogo, os scripts
CLI, o componente novo de raciocínio, `llm-config-form.tsx` e as duas pages
(`prompt/page.tsx`, `configuracao/page.tsx`). Os arquivos **compartilhados**
(`resources-toggles.tsx`, `agent-config.ts`, `prisma/schema.prisma`,
`providers/openai.ts`) só são tocados depois de confirmar, via
`docs/agents/active/` e `git log`, que o `claude-agente-nex-melhorias` terminou
neles. Se ele ainda estiver neles quando a parte exclusiva acabar, a sessão
aguarda.

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
- A lógica de carregamento dos **recursos** que hoje vive em `prompt/page.tsx`
  (montar `credentialsByProvider` e `initialResources`, chamar `listCredentials`)
  **migra** para `configuracao/page.tsx`. A `prompt/page.tsx` **continua**
  chamando `getAgentSettings` (Identidade/Comportamento ainda usam `settings`) e
  `listKbDocumentsAction` (Base de conhecimento); apenas para de montar o bloco
  `initialResources` e de carregar credenciais. A `configuracao/page.tsx` passa
  a chamar `getAgentSettings` e `listCredentials` (algumas dessas chamadas ela
  já faz hoje — reusar).

`<ResourcesToggles>` é movido **sem mudança de comportamento** nesta frente — só
de tela. A frente 2 adiciona o card de raciocínio dentro dele. Mover a *tela* de
Recursos não afeta o componente do Playground (`playground-content.tsx`): são
coisas distintas — a tela é a configuração, o Playground é a sessão de teste.

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

**Resolução do nível efetivo (fallback).** O `reasoningEffort` salvo pode ficar
inválido quando o modelo de produção muda (modelo novo não aceita o nível
salvo, ou não suporta raciocínio). Regra: ao montar a requisição e ao renderizar
o card, o nível efetivo é `reasoningEffort` **se** estiver em
`model.reasoning.levels`; senão, o **maior** nível disponível do modelo; se o
modelo não suporta raciocínio, não há nível e o recurso é tratado como `OFF`.
Nunca enviar à API um nível que o modelo não aceita.

A action `updateAgentResources` e seu schema Zod (em `agent-config.ts`) ganham
os campos `reasoningCheckpoint` e `reasoningEffort`. `agent-config.ts` é arquivo
**compartilhado** — tocado conforme a ordem de implementação da §3.

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

Como o catálogo é híbrido (§6), a tabela de overrides no banco espelha o
`ModelEntry` **completo** — incluindo `reasoning`. Assim um modelo que entre
pelo botão "atualizar" também consegue declarar suporte a raciocínio, e o merge
preserva o campo.

### 5.3 UI — card "Modo raciocínio"

Novo `ResourceCard` no `ResourcesToggles`, posicionado **antes** da Entrada de
áudio. Estrutura:
- Ícone (cérebro), título "Modo raciocínio", subtítulo explicando o recurso.
- `FeatureCheckpoint` (3 status) à direita, como nos demais cards.
- O modelo que determina o suporte é o **modelo de produção ativo** (o
  `LlmConfig` marcado como ativo, exibido na tela de Configuração). É o único
  modelo de conversação configurável — o Playground usa o mesmo modelo.
- **Quando esse modelo não suporta raciocínio**: o `FeatureCheckpoint` fica
  travado em `OFF` (`disabled`), com nota curta ("O modelo atual não suporta
  raciocínio").
- **Quando suporta e o status está `!= OFF`**: a área do card expande (mesmo
  padrão dos cards de áudio/imagem) e aparece o **seletor de nível** (menu
  suspenso) com os níveis declarados pelo modelo, e a **exibição de custo**:
  o custo de **saída** do modelo ativo em `$ /1M tokens` (é a tarifa real
  cobrada sobre os tokens de raciocínio, que contam como tokens de saída) com
  a `TierBadge` do próprio modelo, mais uma frase curta deixando claro que o
  raciocínio consome tokens de saída e que níveis maiores geram mais desses
  tokens. Não se inventa um preço/1M fictício para o nível: o volume de tokens
  de raciocínio varia por pergunta; o que é concreto e honesto é a tarifa de
  saída do modelo.
- Layout exato (posição do seletor de nível vs status, espaçamento) definido na
  implementação com `ui-ux-pro-max`, mantendo a consistência com os outros cards.

### 5.4 Wiring na requisição LLM

Quando `reasoningCheckpoint` libera o recurso para o ambiente corrente
(Playground ou produção) e o modelo ativo suporta raciocínio, a requisição ao
provider inclui o parâmetro de esforço (`reasoning_effort` na OpenAI). O nível
enviado é o **nível efetivo** (§5.1 — `reasoningEffort` salvo, com fallback para
o maior nível do modelo). O comportamento adaptativo é nativo do modelo: o
nível é o teto e o modelo modula. Quando o recurso está `OFF` para o ambiente,
nada é enviado e o modelo opera no default.

**Escopo de provider.** Esta entrega cobre o provider **OpenAI** (`reasoning_effort`
com níveis minimal/low/medium/high), que é o provider do modelo ativo. Anthropic
e Gemini usam orçamento de tokens de thinking, não níveis — o mapeamento para
esses providers fica como extensão futura (§8). O campo `reasoning.levels` no
catálogo já permite cada modelo declarar seus próprios níveis quando a extensão
for feita.

> O wiring por provider toca `src/lib/agent/llm/providers/openai.ts`. O
> `claude-agente-nex-melhorias` declarou esse arquivo. Coordenar (§3) — esperar
> ele terminar antes de tocar.

## 6. Frente 3 — Catálogo de modelos atualizável

### 6.1 Arquitetura híbrida (decisão técnica)

- `catalog.ts` permanece a **base versionada no código** — sempre presente; é o
  piso garantido. Se o banco for recriado/esvaziar, a plataforma cai na base e
  não fica sem catálogo.
- Tabela nova no banco (`LlmModelEntry` ou similar) guarda **adições e
  atualizações** (modelos novos descobertos, preços atualizados).
- Catálogo efetivo em runtime = **merge** da base do código com os registros do
  banco (o do banco tem precedência por id). Banco vazio = usa só a base.
- **Estratégia para manter as funções síncronas** (decisão de design, não de
  plano): `getModel`/`listModels`/`calculateCost` etc. são síncronas hoje e
  usadas no caminho quente (`usage-logger.ts` roda a cada chamada LLM). O
  catálogo efetivo é mantido num **cache em memória do processo**, carregado no
  primeiro acesso e revalidado (a) na instância que escreve, logo após a escrita
  na tabela de overrides, e (b) por **TTL curto** nas demais. O cache é por
  processo: em produção com várias instâncias, a propagação cross-instância é
  via TTL — aceitável para um catálogo de modelos, que não exige consistência
  imediata entre instâncias. As funções públicas continuam **síncronas**, lendo
  do cache — **nenhum consumidor atual muda de assinatura**. Há um ponto de
  entrada assíncrono (`ensureCatalogLoaded()`) chamado no boot/Server Action que
  popula o cache; se o cache ainda não carregou, as funções caem na base do
  código (nunca quebram).

### 6.2 Botão "atualizar" + Server Action

- Botão "atualizar" ao lado do cabeçalho "Modelo" no `llm-config-form.tsx`.
- Ao clicar: Server Action consulta a API oficial do provedor selecionado
  (listagem de modelos), compara com o catálogo efetivo, e faz upsert dos
  modelos novos / mudanças na tabela do banco. Retorna um resumo do que mudou.
- Preço: a API do OpenRouter fornece preço; OpenAI/Anthropic/Gemini não — para
  esses, o modelo novo entra com `pricing: null` (sinalizado para curadoria) e
  o restante (nome/id) é preenchido. `costKnown=false` já trata preço ausente.
- A Server Action é super_admin (gate da tela) e tem proteção contra cliques
  repetidos: o botão entra em estado `loading` durante a consulta e um rate
  limit curto evita disparos em rajada. A consulta é só listagem de modelos
  (barata, sem inferência), mas degrada com elegância quando a chave de API do
  provedor está ausente ou inválida (mensagem clara, sem quebrar a tela).

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
**pesquisa web** no plano. O resultado é registrado em **dois lugares**: o
campo `reasoning` em `catalog.ts` (consumido pelo código) e um documento em
`docs/superpowers/research/` com a tabela modelo → suporte → níveis, a fonte
(doc oficial de cada provedor) e a data de verificação — esses dados mudam, e a
rastreabilidade evita decisões com informação velha. Sem isso, o travamento do
card de raciocínio não é confiável.

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
- **Teste do catálogo híbrido**: com a tabela de overrides vazia, o catálogo
  efetivo deve ser idêntico à base do código (a plataforma não fica sem
  modelos); com um override, o modelo do banco tem precedência.
- Code review + UI review na etapa [10].

## 11. Histórico de revisão

### Review #1 (spec v1 → v2) — 6 achados materiais aplicados

1. **Fallback do `reasoningEffort`** — adicionada a regra de resolução do nível
   efetivo em §5.1 (nível salvo se válido; senão o maior do modelo; sem suporte
   → tratado como OFF).
2. **Modelo que determina o suporte** — §5.3 explicita: o modelo de produção
   ativo (`LlmConfig` ativo); o Playground usa o mesmo modelo.
3. **Custo do raciocínio** — §5.3 trocou a definição vaga ("tag de impacto")
   por algo concreto e honesto: custo de saída do modelo em `$/1M` + `TierBadge`
   do modelo + frase explicativa. Sem inventar preço/1M para o nível.
4. **Catálogo síncrono** — §6.1 deixou de empurrar a decisão para o plano:
   fixou cache em memória revalidado, funções públicas continuam síncronas,
   fallback para a base se o cache não carregou.
5. **Wiring multi-provider** — §5.4 fixou o escopo no provider OpenAI;
   Anthropic/Gemini viram extensão futura (§8).
6. **`prompt/page.tsx`** — §4.1 explicita o que a página continua carregando
   (`getAgentSettings`, `listKbDocumentsAction`) e o que deixa de carregar.

Pontos menores também aplicados: rate limit/degradação da Server Action (§6.2);
teste de catálogo com banco vazio (§10); nota de que mover a tela de Recursos
não afeta o Playground (§4.1).

### Review #2 (spec v2 → v3) — 6 achados materiais aplicados

1. **Frente 2 ↔ Frente 3** — §5.2 amarra: a tabela de overrides do banco
   espelha o `ModelEntry` completo, incluindo `reasoning`; o merge preserva o
   campo.
2. **Cache por instância** — §6.1 precisou: o cache é por processo; a
   propagação cross-instância em produção é via TTL curto, aceitável para um
   catálogo.
3. **Seletor de nível com o recurso OFF** — §5.3 fixou: o seletor de nível e o
   custo só aparecem quando o modelo suporta **e** o status `!= OFF`, como nos
   cards de áudio/imagem.
4. **`updateAgentResources`** — §5.1 explicita que a action e o Zod ganham os 2
   campos novos, e que `agent-config.ts` é compartilhado (ordem da §3).
5. **Rastro da pesquisa** — §7 passou a exigir, além do `catalog.ts`, um
   documento de research com fonte e data de verificação.
6. **Ordem de implementação** — §3 ganhou a diretriz firme: exclusivos
   primeiro, compartilhados só após o `claude-agente-nex-melhorias` terminar.

Pontos menores registrados: layout do card em `narrow` vs `wide` a calibrar
com `ui-ux-pro-max`; o botão "atualizar" age sobre o provedor selecionado no
formulário.

A spec v3 não tem mais achado material pendente — pronta para o plano.
