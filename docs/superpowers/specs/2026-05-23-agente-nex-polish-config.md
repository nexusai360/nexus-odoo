# SPEC v1 — Agente Nex: polish de configuração, catálogo, prompt e busca

Data: 2026-05-23
Branch: `feat/f4-leitura-expansao`
Autor: Claude (sessão autônoma)
Status: rascunho

> Versão 1 inicial. Vai passar por duas reviews críticas (`v2`, `v3`) antes de virar PLAN.

---

## 1. Resumo executivo

O usuário rodou a primeira bateria de uso real do Agente Nex (bubble in-app) e
da tela de configuração e relatou um conjunto grande de problemas que afetam
três áreas distintas, embora interligadas:

1. **Configuração do Agente Nex (UI/UX)** — recursos, raciocínio, modelo,
   sugestões, chave de API, prompt, consumo, playground e plugar MCPs estão
   com layout apertado, dropdowns desalinhados, controles em posições ruins,
   texto incorreto e bugs de runtime (Prisma).
2. **Comportamento do agente em conversa** — o agente faz pergunta demais
   antes de responder, sugestões clicáveis ficam ambíguas, a animação de
   "consultando…" some/aparece em flicker, e a busca por produtos não é
   tolerante a acento/grafia.
3. **Controle de ativação** — o toggle "Agente Nex ativo" mistura bubble in-app
   e WhatsApp num único interruptor, e isso precisa virar um seletor com três
   estados independentes (off / só bubble / só WhatsApp / ambos).

A SPEC trata todos esses pontos como uma onda só de polish porque várias
mudanças tocam os mesmos arquivos (`resources-toggles.tsx`,
`reasoning-card.tsx`, `llm-config-form.tsx`, `run-agent.ts`, `compose.ts`,
`agent-config.ts`, schema Prisma).

**Resultado esperado:** ao terminar, o usuário entra na configuração, consegue
ler todas as seções com respiro visual, ajusta os controles intuitivamente, e
ao testar o agente recebe respostas mais diretas, com animação fluida de
"consultando", busca tolerante a acento e sugestões objetivas.

---

## 2. Inventário de problemas (entrada do usuário)

### 2.1 Bug de runtime — Prisma client desatualizado

**Sintoma:** ao mudar nível de esforço do raciocínio ou número máximo de
sugestões, o `upsert` joga `PrismaClientValidationError` com `Unknown argument
maxSuggestions`. Ocorre porque o cliente Prisma gerado em
`src/generated/prisma/` está stale (anterior à migration
`20260522232100_agent_max_suggestions`).

**Status:** já corrigi rodando `prisma generate` durante o diagnóstico. Vai
ficar coberto no PLAN como uma pré-condição da execução (instrução de
restart do `next dev` após pull).

### 2.2 Comportamento do agente em conversa

#### 2.2.1 Sugestões clicáveis ambíguas
A sugestão "Mostre os lançamentos financeiros recentes" leva o agente a
**pedir confirmação** ("você quer quais registros?", "qual período?") em vez
de simplesmente responder. Sugestões clicáveis precisam ser objetivas o
suficiente para o agente **responder direto**, sem outra rodada de pergunta.

#### 2.2.2 Excesso de perguntas de clarificação
Mesmo fora das sugestões clicáveis, o agente cai num padrão "diligente
demais": pede confirmação de período, escopo, formato, antes de responder.
A meta é equilíbrio entre precisão e fluidez: dar bom senso de defaults
("mês atual = mês do calendário") e só perguntar quando a ambiguidade for
realmente bloqueante.

#### 2.2.3 Cobertura de opções incompleta
Em "somente os que vencem em 05/2026", a sugestão que o próprio agente
ofereceu não cobria essa opção; o usuário teve que digitar à mão. O prompt
não deve sugerir uma lista parcial que omite a fatia óbvia do dado.

#### 2.2.4 Animação "consultando…" com flicker
Quando o agente chama uma tool, aparece uma linha "consultando financeiro"
por uns 2 segundos, some, sobra um ícone vazio antes de a resposta vir. A
transição esperada é: tool-call → frame animado contínuo "consultando X"
(com 2-3 frames de loading) → assim que chega a resposta, o frame congela
em estado "consultado X" (estático) e a resposta aparece logo abaixo.

#### 2.2.5 Busca de produto não tolera acento/grafia
Buscar "mola espiral em aço" devolve 0 resultados; tirando o cedilha
(`aco`) devolve 2 (mas o real são 4). A busca tem que ser normalizada:
remover acento, case-insensitive, e idealmente fazer fuzzy match curto.

### 2.3 Configuração — seção "Recursos"

#### 2.3.1 Espaçamento do título
Título "Recursos" está colado na borda superior do card. Precisa de margem
equivalente ao card de cima.

#### 2.3.2 Modo raciocínio — custo por nível
O "custo de saída do modelo" é exibido como valor único independente do
nível de esforço. O usuário quer ver custo por nível (mínimo/baixo/médio/
alto), espelhando o padrão da lista de modelos no provedor (onde cada
modelo lista preço e tags). Verificar se cada provedor cobra preços
diferentes por nível.

> **Realidade da cobrança:** OpenAI/Anthropic/Google cobram **o mesmo preço
> por token de saída** independente do `reasoning_effort` — o que muda é
> **quantos tokens** o modelo gera (níveis mais altos geram mais reasoning
> tokens). Tem que comunicar isso bem na UI: mesma tarifa por token, mas
> "estimativa de consumo" cresce com o nível.
>
> Decisão (a confirmar nas reviews): mostrar tarifa fixa + um indicador
> qualitativo de consumo esperado por nível ("mínimo: ~0,3x tokens base /
> alto: ~3-8x tokens base"). Isso é educacional e não risco-de-precisão.

#### 2.3.3 Texto de modelo incompatível
"O modelo de produção atual não suporta raciocínio. Escolha o modelo
compatível na conexão acima para liberar este recurso." → reescrever em
linguagem natural mais leve.

#### 2.3.4 Recursos: expandir / recolher por card
Cada `ResourceCard` precisa de um chevron `▾`/`▸` que recolhe a parte
configurável (provedor / modelo / chave / nível / máx sugestões), deixando
só cabeçalho + checkpoint visível. O estado expandido / recolhido é por
sessão (não persiste no banco) — preferência local do usuário.

#### 2.3.5 Renomear "Sugestões clicáveis" → "Sugestão de pergunta"
Mudar título e referências de UI. Não muda nome de campo no banco
(`suggestions_*` permanece).

#### 2.3.6 Reposicionar seletor "Máximo por resposta"
O grupo `[1][2][3][4][5]` está alinhado à direita, encolhido. Mover para
linha própria, ocupando alinhamento natural com os outros controles
(esquerda) e com label clara à esquerda. Manter o visual de pill-group.

### 2.4 Configuração — seção "LLM" (Conexão / Modelo)

#### 2.4.1 Dropdown menor que o botão
Quando se abre a lista de Provedor ou Modelo, o popover sai com largura
**menor** que o trigger. Precisa casar com a largura do trigger. Vale
investigar `popover-trigger-width` no `radix-ui` ou na implementação
custom.

#### 2.4.2 Tela larga demais
Os botões ficam esticadões. Reduzir largura máxima do conteúdo (`max-w-*`)
para algo mais respirado em telas 1440+. Vale para todas as telas do
agente (configuração, chaves, prompt, consumo, playground, plugar MCPs).

#### 2.4.3 Botão "Atualizar catálogo" desalinhado
Depois que o botão foi adicionado, o alinhamento entre Provedor e Modelo
quebrou — o Modelo está mais baixo, o botão escorregou para um canto. Vai
ser refeito com `flex` + `items-end` para garantir baseline consistente.

#### 2.4.4 Sync de catálogo enche o banco de lixo
Clicar "Atualizar" gera N entradas com `preço sob consulta`, descrições
vazias, sem filtro de data, sem tag. Regras a aplicar:
  - Só modelos lançados de **2024-01-01 em diante**.
  - Só modelos com pricing conhecido (descartar `null/null` se possível).
  - Não substituir descrições já existentes no catálogo base — só
    sobrescrever quando o sync trouxer uma descrição mais rica.
  - Não criar duplicatas: `upsert` por `(provider, modelId)`.
  - Limitar a uma whitelist por provedor (modelos de produção, sem
    snapshots e previews experimentais), exceto se já existirem.

### 2.5 Demais telas do agente — respiro

Telas: `configuracao`, `chaves`, `prompt`, `consumo`, `playground`,
`plugar-mcps`. Todas com mesmo problema de largura. Plugar MCPs ainda tem
um problema específico: conteúdo alinhado à esquerda mas com espaço morto
gigante à direita. Centralizar / equilibrar margem.

### 2.6 Ativação do Agente Nex (bubble vs WhatsApp)

Hoje há um único `bubbleEnabled` (boolean) ligado ao toggle "Agente Nex
ativo". Precisa virar um seletor com três opções (segmented control) ou
duas chaves independentes:

- **Off:** desativa a bubble in-app **e** as respostas via WhatsApp.
- **Só Bubble:** bubble aparece, WhatsApp não responde.
- **Só WhatsApp:** WhatsApp responde, bubble não aparece.
- **Ambos:** bubble e WhatsApp ativos.

Modelagem proposta: trocar `bubbleEnabled` por dois campos
`bubbleEnabled` + `whatsappEnabled` (ambos booleans, default `true`).
Toda integração que hoje lê `bubbleEnabled` continua funcionando; novo
ponto checa `whatsappEnabled` antes de processar mensagem do WhatsApp.

UI: caixa no topo da configuração com dois toggles individuais e um
sumário ("ativo no chat in-app e no WhatsApp" / "ativo só no chat" /
"ativo só no WhatsApp" / "desativado em todos os canais").

---

## 3. Decisões de design por item

### 3.1 Prisma client (bloqueio)

- Não altera schema. Apenas garante `prisma generate` no fluxo de dev.
- Adicionar nota no README / docs/git-workflow.md: "após pull, rodar
  `pnpm prisma generate` se a migration adicionar campo".

### 3.2 Prompt do agente (objetividade + bom senso)

Trabalhar em `src/lib/agent/prompt/compose.ts` e nos prompts de tool.

Diretrizes a injetar no system prompt (ou no template base):

1. **Defaults razoáveis:**
   - Período "recente" / "atual" → assumir mês do calendário (1 a último
     dia do mês corrente).
   - Período "últimos N dias" → janela rolante.
   - Em dúvida entre interpretações: usar a mais comum, anunciar de forma
     curta no início da resposta ("vou considerar mês de maio/2026 — me
     diga se quiser outra janela").
2. **Limite de perguntas:** **uma** pergunta de clarificação por turno só
   é permitida se a resposta direta for *bloqueada* pela ambiguidade. Não
   pedir confirmação de múltiplos pontos.
3. **Sugestões clicáveis = perguntas objetivas:** instruir o modelo a só
   emitir sugestões com forma "pergunta completa que pode ser respondida
   direto" (ex.: "Liste contas a receber em aberto em 05/2026 por
   cliente"), nunca "Quer ver tal coisa?".
4. **Cobertura de opções:** quando sugerir "escolha uma das opções X / Y
   / Z", o modelo deve cobrir todas as fatias naturais da pergunta (no
   mínimo: tudo, somente em aberto, somente no período X, somente vencidos
   se for divida).
5. **Não pedir confirmação de pergunta já clicada:** quando o input do
   usuário é exatamente a sugestão anterior, agir direto (sem fazer
   nova rodada de clarificação).

Garantia: cada diretriz vai ter teste em `compose.test.ts`
(asserções sobre o prompt rendered) e teste de execução em
`run-agent.test.ts` (mocking LLM e checando shape da resposta).

### 3.3 Busca tolerante a acento

A camada de read tools tem funções como `consultar_produto_por_nome`. A
implementação atual provavelmente faz `WHERE name ILIKE '%term%'`.
Mudanças:

1. Normalização Unicode (`NFD`) + remoção de combining marks no termo de
   busca **e** na coluna comparada. Postgres: usar `unaccent(name) ILIKE
   unaccent(:term)`.
2. Extensão `unaccent` precisa estar instalada (a migration adiciona se
   ainda não estiver: `CREATE EXTENSION IF NOT EXISTS unaccent`).
3. Para nomes com cedilha digitado errado pelo usuário (`arco` vs `aço`),
   aplicar uma segunda passada com fuzzy: `pg_trgm` (`similarity()` ≥ 0.4)
   ou um pré-processamento substituindo dígrafos comuns (`c` ↔ `ç`, `ao`
   ↔ `ão`, `oe` ↔ `ões`). Decisão (a fechar): começar com `unaccent` +
   `pg_trgm`; se o cliente continuar errando, ampliar para fuzzy de
   substituição manual.

### 3.4 Animação "consultando…" — UX da bubble

Especificação visual e de estado:

| Estado | Visual | Duração |
|---|---|---|
| Tool start | linha com spinner contínuo + texto "Consultando \<dominio\>…" | enquanto pendente |
| Tool end | linha congela (sem spinner) com check sutil + texto "Consultado \<dominio\>" | permanente |
| Erro tool | linha vira ícone de alerta + texto "Falhou ao consultar \<dominio\>" | permanente |

Implementação: o componente que renderiza a linha de tool-call lê do
estado `inflight | done | error` e roteia para o estilo correto. Sem
remover/recriar o nó (que é a raiz do flicker atual — desmonta enquanto a
resposta chega).

Mapa de domínios: o `toolName` (ex.: `consultar_financeiro`) vira label
amigável ("financeiro", "estoque", "comercial", "produto", "fiscal",
"base de conhecimento"). Tabela de mapeamento em
`src/lib/agent/tools/labels.ts`.

### 3.5 Reasoning — custo por nível

Modelo:
- Manter `outputPerMTok` no catálogo (tarifa por token de saída).
- Acrescentar em `ReasoningCard` um aviso curto: "Tarifa fixa por token
  de saída; níveis maiores geram mais tokens de raciocínio."
- Adicionar coluna informativa "consumo estimado" por nível, em escala
  (1x / 2x / 4x / 8x) — não é precificação, é orientação.

### 3.6 Texto de modelo incompatível

De: "O modelo de produção atual não suporta raciocínio. Escolha o modelo
compatível na conexão acima para liberar este recurso."

Para: "O modelo selecionado não tem suporte a raciocínio. Para liberar
este recurso, escolha um modelo compatível na seção de conexão acima."

### 3.7 Expandir / recolher por card

`ResourceCard` ganha prop `defaultCollapsed?: boolean` e estado interno
`collapsed` (toggable via chevron). Quando recolhido, `children` não
renderiza (`hidden` com `aria-hidden`). Estado persistido em
`localStorage` por chave `agent-config:resource-card:<id>` para sobreviver
ao refresh.

### 3.8 Renomear sugestões clicáveis

Trocar todas as ocorrências em UI ("Sugestões clicáveis" → "Sugestão de
pergunta"). Atualizar `aria-label`, subtitle, testes que asseguram texto.

### 3.9 Reposicionar máximo de sugestões

Layout novo: linha completa abaixo do título, label à esquerda, controle
pill-group também à esquerda (não justify-between). Mantém visual atual
de botões, só muda alinhamento.

### 3.10 Dropdown casa com trigger

Trocar implementação do popover para usar `Radix Popover`/`Select` com
`Popover.Content` aplicando `style={{ width: 'var(--radix-popover-trigger-width)' }}`
(ou equivalente no `Select`). Aplicar em `CustomSelect` e em
`SearchableSelect` no mesmo passo — ambos têm o mesmo bug.

### 3.11 Tela mais respirada

Adotar `max-w-4xl` (≈ 896px) em vez do atual (que parece estar em
`max-w-5xl`/`6xl`). Padding lateral `px-6 lg:px-8`. Aplicar em:
- `(protected)/agente/configuracao/page.tsx`
- `(protected)/agente/chaves/page.tsx`
- `(protected)/agente/prompt/page.tsx`
- `(protected)/agente/consumo/page.tsx`
- `(protected)/agente/playground/page.tsx`
- `(protected)/agente/plugar-mcps/page.tsx`

Em "Plugar MCPs", o conteúdo lateral à direita está em coluna fixa
desbalanceada — usar `grid lg:grid-cols-[1fr,320px] gap-6` consistente.

### 3.12 Atualizar catálogo de modelos

Em `sync-catalog.ts` aplicar filtros (data, pricing, whitelist) **antes**
de fazer `upsert`. Botão "Atualizar" vai mostrar toast com sumário ("12
modelos sincronizados, 3 ignorados sem pricing, 8 ignorados por idade").
Layout do botão: ficar ancorado na lateral direita do card de Modelo,
alinhado ao topo do label "Modelo", em vez de virar bloco solto.

### 3.13 Ativação Agente Nex (bubble + WhatsApp)

Banco:
- Adicionar `whatsappEnabled BOOLEAN NOT NULL DEFAULT true` em
  `agent_settings`.
- Manter `bubbleEnabled` como hoje.

Backend:
- `getAgentSettings()` retorna ambos.
- WhatsApp webhook (em F5, ainda não 100% pronto) **checa** os dois.
- Bubble in-app continua olhando `bubbleEnabled`.

UI:
- Substituir card único "Agente Nex ativo" por card "Disponibilidade do
  Agente Nex" com dois toggles dentro: "Bubble no app" e "WhatsApp"
  (este último com label "em breve" se F5 ainda não estiver disponível;
  ainda assim a chave grava no banco).

Texto do estado: "Ativo no chat in-app e no WhatsApp" / "Ativo só no
chat" / "Ativo só no WhatsApp" / "Desativado em todos os canais".

---

## 4. Mudanças de banco

| Tabela | Coluna | Tipo | Default | Migration |
|---|---|---|---|---|
| `agent_settings` | `whatsapp_enabled` | `BOOLEAN NOT NULL` | `true` | nova |
| extensão | `unaccent` | — | — | `CREATE EXTENSION IF NOT EXISTS unaccent` |
| extensão | `pg_trgm` | — | — | `CREATE EXTENSION IF NOT EXISTS pg_trgm` |

(Verificar na review #2 se `pg_trgm` é mesmo necessário ou se `unaccent`
sozinho resolve o cenário "mola espiral em aço".)

---

## 5. Mudanças de backend

- `src/lib/agent/prompt/compose.ts`: novas diretrizes de objetividade,
  defaults razoáveis, política de sugestões.
- `src/lib/agent/tools/*.ts`: tools de busca por nome usam
  `unaccent(name) ILIKE unaccent(:term)`.
- `src/lib/agent/tools/labels.ts` (novo): mapeamento `toolName → label
  humano` para a animação.
- `src/lib/agent/llm/sync-catalog.ts`: filtros de data, pricing e
  whitelist.
- `src/lib/actions/agent-config.ts`: aceita e grava `whatsappEnabled`.
- `prisma/schema.prisma`: campo `whatsappEnabled`.

---

## 6. Mudanças de UI

| Arquivo | Mudança |
|---|---|
| `src/components/agent/resources-toggles.tsx` | renomear "Sugestões clicáveis", mover "Máximo por resposta", expandir/recolher por card |
| `src/components/agent/reasoning-card.tsx` | reescrever texto incompatível, mostrar tabela de consumo por nível |
| `src/components/agent/llm-config-form.tsx` | botão "Atualizar" reposicionado, popover-width casado com trigger, layout responsivo |
| `src/components/ui/custom-select.tsx` | popover-trigger-width |
| `src/components/ui/searchable-select.tsx` | popover-trigger-width |
| `src/components/agent/agent-bubble.tsx` (e dependências de tool-call) | animação "consultando" sem flicker |
| `src/components/agent/agent-availability-card.tsx` (novo) | seletor bubble+whatsapp |
| Páginas `(protected)/agente/**/page.tsx` | `max-w-4xl`, padding lateral, centralização |

---

## 7. Mudanças de prompt

(Detalhe em §3.2)

Testes alvo:
- "pergunta vinda de sugestão clicada → resposta direta, zero
  clarificação"
- "pergunta com 'recente' → modelo assume mês corrente sem perguntar"
- "modelo sugere opções → todas as fatias do dado cobertas"

---

## 8. Verificação esperada

1. `pnpm tsc --noEmit` limpo.
2. `pnpm eslint` limpo.
3. `pnpm test` passa, com testes novos cobrindo:
   - Prompt: defaults, política de sugestões.
   - Tools: busca acento-insensível.
   - Catálogo sync: filtros aplicados.
   - Availability: 4 estados.
4. `pnpm build` limpo.
5. Verificação manual no `next dev`:
   - Trocar nível de raciocínio: sem erro Prisma; UI mostra nível e
     consumo.
   - Trocar máx sugestões: sem erro Prisma.
   - Ativar/desativar bubble e WhatsApp independentemente.
   - Buscar "mola espiral em aço" no bubble: encontra 4 resultados.
   - Clicar sugestão clicável: resposta direta sem perguntas.
6. `gsd-code-review` em todos os arquivos tocados.
7. `gsd-ui-review` nas telas do agente.

---

## 9. Fora do escopo

- F5 (WhatsApp end-to-end) não está sendo entregue aqui; só o controle
  de ativação no banco e na UI fica pronto.
- F4 Onda 2 (write tools) intocada.
- Não vamos refatorar o catálogo de modelos por completo, só aplicar
  filtros no sync.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Mudar prompt quebra os 70 testes de eval existentes | Rodar `pnpm test:eval` (se existir) antes/depois; ajustar baselines com cuidado |
| `unaccent` exige extensão no Postgres prod | Migration idempotente `CREATE EXTENSION IF NOT EXISTS` |
| Renomear "Sugestões clicáveis" pode quebrar testes que asseguram a string | Atualizar testes no mesmo commit |
| Adicionar `whatsappEnabled` sem migração no Tauga prod | Não aplicável — banco é o cache interno, não o Odoo |

---

## 11. Próximo passo

→ Review #1 (adversarial) sobre esta v1. Saída: v2.
