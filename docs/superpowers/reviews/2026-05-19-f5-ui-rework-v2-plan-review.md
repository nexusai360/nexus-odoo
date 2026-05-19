# Review crítica do plano — F5 UI Rework v2

> Bloco 8.1. Double-check adversarial do plano `2026-05-19-f5-ui-rework-v2.md`
> antes da execução. Estado do código verificado em `feat/integracao-whatsapp`.

## Achados materiais

### A1 — `agente-nex/` vs `agente/` (rotas divergentes)
O mapeamento descreve as rotas do nexus-insights como `/agente-nex/*`. O
nexus-odoo já usa `/agente/*` com as sub-páginas **já criadas** (`chaves/`,
`configuracao/`, `consumo/`, `playground/`, `prompt/` — todas com `page.tsx`).
**Decisão:** manter `/agente/*`. Não renomear rota. O plano cita `agente-nex`
só como referência de origem. O grupo expansível do sidebar já existe ou será
verificado no Bloco 7.

### A2 — Componentes já portados (plano desatualizado)
O mapeamento recomenda "portar `custom-select`, `searchable-select`,
`tier-badge`". **Já existem** em `O/src/components/ui/`. Bloco 1/2/5 não
re-portam — apenas usam. Reduz escopo.

### A3 — Schema Prisma: campos faltantes (Bloco 1, 3, 4, notas de backend)
`AgentSettings` atual NÃO tem: `bubbleEnabled`, modelo de áudio
(`audioProvider`/`audioModel`), modelo de imagem (`imageProvider`/`imageModel`),
`imageInputEnabled`, e os estados de checkpoint. Hoje `audioInputEnabled` e
`kbEnabled` são `Boolean`. O plano (Task 3.6) exige 3 estados (off/playground/
prod). **Migration aditiva necessária:** trocar os booleans por enum
`FeatureCheckpoint { OFF, PLAYGROUND, PRODUCTION }` mantendo defaults; manter
colunas antigas seria ruído — substituir é aditivo se a migration preencher.
Decisão: novo enum + novas colunas `audioCheckpoint`, `imageCheckpoint`,
`kbCheckpoint`; manter `audioInputEnabled`/`kbEnabled` derivados ou descartá-los
na migration (descartar, com data migration que converte true→PRODUCTION).

`KbDocument` não tem estado de checkpoint — adicionar `checkpoint
FeatureCheckpoint @default(OFF)`. `KbKind` só tem PDF/TXT/URL — adicionar
`MARKDOWN`, `CSV`, `XML` (Task 4.3).

`LlmCredential` não tem saldo — adicionar `balanceUsd Decimal?`,
`balanceCurrency String?`, `balanceCheckedAt DateTime?`, `balanceStatus String?`
("ok"/"unavailable"/"error").

`PlaygroundSession` não existe — criar modelo novo (Task 6.3): `id`, `userId`,
`provider`, `model`, `promptSnapshot Json` (identidade/personalidade/tom/
guardrails da sessão), `costUsd`, `costBrl`, `createdAt`, `archivedAt`,
`title`. As mensagens da sessão: reusar `Message`/`Conversation`? Não —
`Conversation` é do chat de produção. **Decisão:** `PlaygroundMessage` próprio
relacionado a `PlaygroundSession`, OU armazenar mensagens em `Json` na sessão
(efêmero histórico FIFO no insights). Como o plano pede histórico persistente
com custo por sessão, criar `PlaygroundMessage` (role, content, tokens, cost).

### A4 — Saldo "a cada chamada" (Task 2.3) — risco de latência
Recalcular saldo via API de billing do provedor após CADA chamada do agente
adiciona uma chamada HTTP externa no caminho quente da resposta. **Mitigação:**
fazer a consulta de saldo de forma assíncrona (fire-and-forget, após a resposta
já enviada ao usuário), com throttle (no máx. 1 consulta de saldo por chave a
cada N minutos). Nunca bloquear a resposta do agente. Registrar isso na
implementação.

OpenAI **descontinuou** o endpoint público de saldo (`/dashboard/billing/*`
exige cookie de sessão, não funciona com API key). Anthropic não expõe saldo
por API. **Realidade:** só OpenRouter (`/api/v1/credits`) e talvez Gemini
expõem saldo via API key. Para OpenAI/Anthropic → status `unavailable` com
mensagem honesta e botão "Adicionar crédito" linkando o painel de billing.
Não inventar número.

### A5 — Checkpoint de 3 estados: especificar interação (Task 3.6)
"Pílula clicável/arrastável" é ambíguo. **Decisão de design (ui-ux-pro-max):**
implementar como um **segmented control de 3 segmentos** (Off / Playground /
Produção) — clicável, acessível por teclado (setas), com `aria-pressed`. O
"arrastar" é nice-to-have; clicar avança/seleciona. NÃO um slider arrastável
custom (viola `touch-target-size` e acessibilidade). O ícone do recurso reflete
a cor (cinza/âmbar/roxo). Criar componente reutilizável
`O/src/components/ui/feature-checkpoint.tsx`.

### A6 — Saldo em tempo real exige hook no núcleo do agente
Task 2.3 ("após cada uso do agente"): o gatilho fica em
`src/lib/agent/**` (ou onde o LlmUsage é gravado). Localizar o ponto único onde
a chamada LLM completa e gravar lá o disparo assíncrono de refresh de saldo.
Não espalhar.

### A7 — Bloco 6 (Playground) é o maior risco — sessões persistentes
Reescrever o playground para sidebar + sessões persistentes + sub-tela de
prompt por sessão + barra de custo é grande. Decompor: 6.1 layout, 6.2 selects
+ barra custo, 6.3 modelo Prisma + server actions de sessão, 6.4 sub-tela de
prompt (rota `agente/playground/prompt` ou estado interno — **decisão: estado
interno navegável**, não nova rota, para não poluir o sidebar; "entra e volta"
via estado + history.pushState não é necessário, basta um view-switch animado).
6.5 áudio. Commitar cada uma.

### A8 — "Aplicar à produção" (Task 6.4) precisa de confirmação
Promover prompt da sessão para produção é destrutivo (sobrescreve
`AgentSettings`). Exigir `AlertDialog` de confirmação (`confirmation-dialogs`).

### A9 — Catálogo de modelos (Task 1.6) — fonte da verdade
`catalog.ts` tem 274 linhas. Completar/ordenar contra o catálogo do
nexus-insights (`I/src/lib/agent/llm/catalog.ts` ou equivalente) — usar o
insights como fonte, não inventar modelos/preços. Adicionar campo de uso
("conversação"/"código"/"áudio"/"raciocínio") se faltar. Tier para todos os
provedores.

### A10 — Áudio independente do modelo de produção (Task 3.4)
Decisão do usuário: áudio tem provider+model próprios. Isso significa que o
pipeline de transcrição no backend deve ler `AgentSettings.audioProvider/
audioModel`, não a `LlmConfig` ativa. Verificar `src/lib/agent/**` de
transcrição e ajustar. Mesma lógica para imagem (visão multimodal).

### A11 — Ordem de execução / dependências
- Bloco 0 primeiro (bug isolado).
- **Migration única no início do Bloco 1** consolidando TODOS os campos novos
  (A3) — evita 4 migrations e re-gerações. Rodar `prisma migrate dev` uma vez.
- `feature-checkpoint.tsx` (A5) deve existir antes do Bloco 3 e 4.
- Bloco 7 (consistência) por último, é varredura.
- Bloco 8.2 testes reais no fim.

### A12 — `npm run dev`/`build` e banco
`build` roda `prisma generate`. Porta do banco 5436 (`.env.local`). Migrations
exigem `db` no ar. Testes reais (8.2): `docker compose up -d db redis`.

## Ajustes aplicados ao plano (efetivos na execução)

1. Rotas permanecem `/agente/*` (não `/agente-nex/*`).
2. Não re-portar custom-select/searchable-select/tier-badge (já existem).
3. Migration única consolidada no início (enum `FeatureCheckpoint`, campos de
   áudio/imagem/bubble em `AgentSettings`, `checkpoint` em `KbDocument`, kinds
   MARKDOWN/CSV/XML, saldo em `LlmCredential`, modelos `PlaygroundSession` +
   `PlaygroundMessage`).
4. Checkpoint = segmented control acessível (`feature-checkpoint.tsx`), não
   slider custom.
5. Saldo: consulta assíncrona pós-resposta, com throttle; OpenAI/Anthropic →
   "indisponível" honesto (sem endpoint público). OpenRouter/Gemini → real.
6. Sub-tela de prompt do playground = view-switch interno animado, não rota.
7. "Aplicar à produção" exige `AlertDialog`.
8. Catálogo: nexus-insights é a fonte da verdade.

## Conclusão
Plano aprovado com os 8 ajustes acima. Risco concentrado nos Blocos 2 (saldo —
limitação real de API dos provedores) e 6 (playground persistente). Executar
Bloco 0 → migration consolidada → Blocos 1-7 → 8.2.
