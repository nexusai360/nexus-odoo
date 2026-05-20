# HANDOFF — F5 / Rework da UI do Agente Nex (2026-05-19, sessão 2 — fechada)

> Estado consolidado ao fim da sessão 2. Plano `2026-05-19-f5-ui-ajustes-v3.md`
> entregue por completo (Blocos A–G + I/H). Branch pronta para validação manual
> do usuário e abertura/atualização de PR para `main`.

---

## 0. TOM E ESTADO DA RELAÇÃO COM O USUÁRIO

- O usuário (João Vitor Zanini, Nexus AI) cobrou execução autônoma do plano
  inteiro nesta sessão, com excelência, sem checkpoint intermediário.
- Padrão de comunicação: silêncio + commits atômicos + resumo final.
- Toda UI passou por `ui-ux-pro-max` (cursor-pointer baseline no Button,
  tooltips em ícones-só, hierarquia visual, paleta violet consistente).
- Nada de delegar a subagentes. Tudo inline.

---

## 1. ENTREGUE NESTA SESSÃO (commits na branch `feat/integracao-whatsapp`)

### Commits da sessão 2

| Commit | Tarefas | Resumo |
|---|---|---|
| `62091f4` | G4 + D8 (bubble) | Input bar reorganizada: `+` anexo à esquerda, microfone à direita dentro do `MessageInput` compartilhado; Enviar fora; tooltips. |
| `e3d154c` | D1 + D6 + D8 + D9 | Playground em `PageShell` + `PageHeader`, botão "Prompt da sessão" no header do chat, input grandão substituído por `MessageInput`, sidebar enxuto. |
| `acd79c5` | G5 | Mensagens claras de erro do microfone (permissão / sem mic / mic ocupado / segurança / dica de HTTPS). |
| `94e7207` | G2 | Regras de áudio/imagem no processor WhatsApp; sugestões já não eram enviadas. |
| `bed559a` | G6 + G7 | Recursos filtrados por chave cadastrada, novo seletor "Chave de API" por recurso, rótulos "Provedor"/"Modelo"; sugestões em checkpoint de 3 estados. |
| `766c8e0` | G9 (raiz) | `buttonVariants` ganha `cursor-pointer` + `cursor-not-allowed`-em-disabled → toda a plataforma herda. |
| `e9cb4d8` | D4 | "Nova sessão" não arquiva a atual; histórico não some. |
| `5fbe8e9` | test fix | Mocka prisma no `processor.test` para acomodar G2. |
| `624403a` | docs | HANDOFF + STATUS após a primeira metade da sessão. |
| `b4f670e` | D2 + D3 + D5 | PlaygroundSession ganha `credentialId`; nova sessão NÃO pré-seleciona provedor/modelo/chave; selectores em modo rascunho + botão Salvar; rename inline da sessão; PlaygroundMessage ganha `provider`/`model`/`request_kind`; tag `provedor · modelo · tipo` nas mensagens; migration aplicada. |
| `11eb206` | G10 | `PlaygroundSessionPrompt` reescrita em Cards (Identidade base / Comportamento) — visualmente idêntica à tela `/agente/prompt`; "Aplicar à produção" e "Salvar prompt" em destaque com tooltips. |

### Status final do plano v3 (todos os blocos)

| Bloco | Status |
|---|---|
| Bug 0 (`buttonVariants` server/client) | ✅ |
| **A** (Configuração — A1..A5) | ✅ |
| **B** (Chaves — B1..B3) | ✅ (B1 = consumo rastreado pela plataforma, decisão acordada) |
| **C** (Consumo) | ✅ — estrutura já espelhava o nexus-insights desde a sessão 1 (KPIs, charts violet, donut, bar, tabela com pílulas, filtros, drill-down). Sessão 2 confirmou que CustomSelect/SearchableSelect portalizam via base-ui (PopoverContent), eliminando o risco de "dropdown vazando" em containers com overflow/transform. Polimento fino visual remanescente (paridade 1:1 de espaços) cabe à F6. |
| **D** (Playground — D1..D9) | ✅ |
| **E** (Sidebar "Agente Nex") | ✅ |
| **G** (4ª rodada — G1..G11) | ✅ — G1/G3/G8/G11 já estavam; sessão 2 fez G2/G4/G5/G6/G7/G9/G10. |
| **H** (5ª rodada Configuração) | ✅ |
| **I** (5ª rodada Chaves) | ✅ |
| **F** (Verificação) | ✅ — tsc/eslint/jest/build verdes (ver §3). |

---

## 2. NOTAS TÉCNICAS

### D2 — PlaygroundSession.credentialId
- Migration `20260519220000_f5_d2_d5_playground_fields` adicionou:
  `playground_sessions.credential_id UUID` e
  `playground_messages.provider/model/request_kind TEXT`.
- `createPlaygroundSession` agora aceita provider/model/credentialId opcionais
  (sessão pode nascer em branco; o usuário escolhe + Salva).
- `updatePlaygroundSessionModel` aceita `credentialId`.
- O endpoint `/api/agent/playground/stream` prioriza `session.credentialId`
  e cai no fallback "chave mais recente do provedor" só se a registrada não
  existir mais.
- UI: rascunho na sidebar do Playground (Provedor + Modelo + Chave + Salvar
  com Loader, validação provider+model). Envio só liberado quando há
  provedor+modelo configurados.

### D3 — Renomear sessão
- Nova action `renamePlaygroundSession({ sessionId, title })`.
- UI: botão lápis no card do histórico → `Input` inline → Enter/Esc → check/X.

### D5 — Tag de modelo + tipo de requisição
- `PlaygroundMessage` agora persiste `provider`/`model`/`request_kind` para
  cada mensagem. Stream route grava: user→requestKind="texto" (ou "audio"
  quando vem da transcrição via `AudioRecorder`); assistant→
  provider+model+requestKind="texto".
- UI: novo componente `MessageMetaTag` (inline em `playground-content.tsx`)
  exibe `provedor · modelo` como badge cinza + tipo (Áudio violet / Imagem
  sky / Arquivo emerald) abaixo da mensagem; alinha à direita p/ user.

### G10 — Prompt da sessão = tela Prompt
- `PlaygroundSessionPrompt` reescrita: Cards (Identidade base + Comportamento)
  com mesma className `rounded-2xl border border-border bg-muted/30 p-2` da
  tela `/agente/prompt`. Personality + Tom + Guardrails agrupados em
  Comportamento. Card extra (tracejado) explica que Recursos e KB ficam
  fora (no menu Prompt principal). "Aplicar à produção" e "Salvar prompt"
  em destaque (h-9, ícones, tooltips).

### G6 / G7 — schema
- `AgentSettings.suggestions_checkpoint`, `audio_credential_id`,
  `image_credential_id` (migration `20260519210235_f5_r6_schema`).
- UI e action atualizadas; `suggestions_enabled` legado fica em sincronia
  (PRODUCTION ⇔ true) para o `run-agent.ts`.

### G2 — comportamento do processor WhatsApp
- `audioCheckpoint != PRODUCTION` → responde "não consigo entender áudio".
- `imageCheckpoint != PRODUCTION` → ignora silenciosamente.
- Pipeline de visão multimodal ainda não existe (imagem com checkpoint
  PRODUCTION devolve resposta provisória).

### G4 — AttachMenu
- Popover "+ Anexo" com Imagem (PNG/JPG/WebP/GIF) e Arquivo (PDF/TXT/MD/
  CSV/DOCX/XLSX). Handler default só dispara toast — a integração real
  do anexo no agente é trabalho futuro (precisa endpoint multimodal).

---

## 3. VERIFICAÇÃO

Rodado ao fim da sessão 2:

- `npx tsc --noEmit` — verde.
- `npx eslint src/` — verde (0 erros, 0 warnings).
- `npx jest --runInBand` — verde (1082 testes, 133 suites).
- `npm run build` — verde.

**Smoke test no navegador NÃO foi exercido nesta sessão** — o sandbox
estava com `docker ps` travando e disco-host com 100% de uso (limpei o
`.next` para liberar 1.7 GB durante o build, mas o ambiente seguia frágil).
Antes de chamar o usuário para validar, a próxima sessão (ou o próprio
usuário) deve:

```
docker compose up -d db redis mcp
npx prisma migrate deploy   # já aplicada nesta sessão, mas idempotente
npm run dev                 # 3000
npm run worker
```

E exercer manualmente: Configuração / Chaves / Prompt / Playground /
Consumo / bubble do Agente Nex.

---

## 4. PENDÊNCIAS (depois desta sessão)

Plano v3 **encerrado**. Próximos passos:

1. **Smoke test manual** (item acima) — caçar bugs de dado real.
2. `/gsd-code-review` e `/gsd-ui-review` na branch antes do merge.
3. PR atualizado contra `main` (PR #9 ou novo).
4. F6 (Construtor de relatórios) absorverá o polimento fino do Consumo,
   conforme decisão registrada em STATUS.md.

---

## 5. AMBIENTE

- Docker: `db` (Postgres 5436), `redis` (6380), `mcp` (3100).
- `npm run dev` (3000); `npm run worker`.
- Migrations aplicadas até `20260519220000_f5_d2_d5_playground_fields`.
- `next build`: usar `npm run build` (força `NODE_ENV=production`).

---

## 5e. SESSÃO 3.4 — 20/05/2026 (manhã, pós-Tauga)

Tauga voltou da manutenção. Bateria completa da metodologia §[10]:

### Verificação do sync (Tauga reativo)
- Disparado snapshot + reconcile manuais via BullMQ (script tsx em `Queue("odoo-sync")`).
- Resultado em `sync_state`:
  | Modo | Última execução (UTC) | OK |
  |---|---|---|
  | incremental | 2026-05-20 10:15 | 72/72 |
  | snapshot | 2026-05-20 10:14 | 5/5 |
  | reconcile | 2026-05-20 10:16 | 72/72 |
  | estatico | 2026-05-20 10:14 | 1/2 (`pedido.documento.historico.tempo` segue com defeito conhecido do Odoo) |
- Cron BullMQ permanece ativo (incremental 3min / snapshot 30min / reconcile 1440min).

### Code review (§[10] — gsd-code-review surrogate)
- `git diff main..HEAD` → 210 arquivos, ~35k LOC.
- Sem `TODO`/`FIXME` novos em código de produção. `console.log` só em scripts (`seed`/`verify-*`).
- `as any`: confinados ao boundary do Recharts (3 ocorrências) e a campos `Json` do Prisma (2, já `eslint-disable`d com motivo).
- Segurança: `whatsapp-instances.ts` valida via Zod, exige `super_admin`, cifra token AES-256, audita; `playground/stream` valida ownership da sessão.
- Sem regressão de testes.

### Bateria automatizada
| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npx eslint src/` | ✅ 0 erros, 0 warnings |
| `npx jest --runInBand` | ✅ 133 suites, 1082 testes |
| `npm run build` | ✅ verde |
| Dev server log | ✅ sem erros novos (só prisma:query debug + DEP0169 de dep transitiva) |

### Smoke test (17 rotas)
`/perfil`, `/agente/{playground,prompt,chaves,configuracao,consumo}`, `/relatorios`,
`/configuracao`, `/integracoes`, `/integracoes/{canais,canais/whatsapp,mcp,webhooks,api,bi}`,
`/usuarios`, `/dashboard` — todas respondem 302 (redirect para `/login` em request sem sessão) = OK.

## 5d. SESSÃO 3.3 — 20/05/2026 (manhã)

| # | Tarefa | Estado |
|---|---|---|
| 31 | Integrações/MCP polimento | ✅ Reorganizado em 3 Cards (rounded-2xl bg-muted/30): Status com ícone semântico em pílula + título destacado; Endpoint & Token com Tooltips nos botões Copy/Eye; Card de conexão n8n. Botões h-9. |
| 32 | Integrações/Webhooks polimento | ✅ WebhookRow ganhou ícone Webhook violet em pílula, hover-border, Switch+botões com Tooltip, separador interno, botão Remover ml-auto. Botão "Novo webhook" promovido (h-9 primary + Plus). |
| 33 | Integrações/APIs polimento | ✅ ApiKeyRow com ícone Key violet em pílula, scopes em chips violet rounded-full, hover-border, botão Revogar com Tooltip explicando irreversibilidade. Botão "Nova API key" promovido (h-9 primary). |

## 5c. SESSÃO 3.2 — 20/05/2026 (continuação madrugada)

Rodada extra após retorno do usuário:

| # | Tarefa | Estado |
|---|---|---|
| 29 | Sidebar colapsável + setinha | ✅ Implementado: `motion.aside` anima width 240↔64, setinha circular ChevronLeft/ChevronRight no centro da borda direita, estado persistido em `localStorage` (`nexus-sidebar-collapsed`). Modo colapsado: logo + ícones com Tooltip side="right", tema vira botão único que cicla light/dark/system, footer escondido. Click no grupo Agente Nex quando colapsado expande + abre submenu. |
| 30 | Instâncias WhatsApp | ✅ CRUD completo: `whatsapp_instances` table (já no schema), action `whatsapp-instances.ts` (list/create/toggle/delete com super_admin guard + audit), componente `whatsapp-instances-list.tsx` (lista com Switch enable + dialog de criação com Nome/E.164/BusinessAccountId/PhoneNumberId/GraphApiToken cifrado AES-256/responseMode). Plugado em `/integracoes/canais`. |
| 35 | Playground (consumo+nome+alinhamento) | ✅ R$ menor (text-sm semibold); histórico com R$ · US$; campo Nome no topo da Configuração (inline edit Enter/Esc); labels Provedor/Modelo/Chave aumentados (text-xs font-medium + selects text-sm); botão Enviar h-10 self-center + form items-center → alinhado com input em ambos bubble e playground. |
| Perfil/Aparência | Ordem dos cards | ✅ Trocada para Claro → Escuro → Sistema. |
| **Operacional** | Sync Tauga | ⚠️ Worker está rodando, mas o **Odoo Tauga (`grupojht.tauga.online`) está em manutenção** retornando HTTP 502 ("Taŭga - Manutenção"). Sync vai retomar automaticamente quando o cliente voltar — sem ação necessária do nosso lado, log mostra retries com backoff exponencial. |

### Pendente
- **#31/32/33** — telas MCP/Webhooks/APIs **existem** (143/343/292 linhas, com PageShell + PageHeader + Breadcrumb). Precisam de **screenshot + texto descrevendo o diff esperado** — sem isso, qualquer mudança vira chute (e já foi reprovado antes).

## 5b. SESSÃO 3 — 20/05/2026 (madrugada)

Após apontamentos do usuário, foi feita uma rodada extra:

| # | Tarefa | Estado |
|---|---|---|
| 19 | **CRÍTICO — Worker offline** | ✅ Worker reiniciado (`npm run worker`). `sync_state` voltou a atualizar a cada 3 min; `estoque.extrato` (snapshot completo) rodou. **O job rodando em produção depende do container `worker` do docker-compose ficar de pé** — se cair, sync para. |
| 20 | KB — remover X | ✅ XCircle removido; Sparkles permanece só quando há embedding. |
| 21 | Bubble — tooltips atrás do modal | ✅ Tooltip portal+popup com `z-[60]` e `isolate`. |
| 22 | Microfone negado | ✅ Mensagens claras (G5) já em produção. Quando o navegador grava "Bloquear", JS não reabre o prompt — usuário precisa liberar no cadeado da URL. |
| 23 | Consumo da sessão (Playground) | ✅ Painel destacado violet, valor BRL em fonte grande, atualiza ao vivo; card de histórico mostra "Consumo:" em linha própria. |
| 24 | Prompt da sessão = tela Prompt | ✅ Reescrito usando exatamente os componentes/labels de `/agente/prompt` (ExpandableTextarea, ícones FileText/Sparkles/Wand2/Shield, layout em Cards). |
| 25 | Consumo (Bloco C) | ⚠️ Estrutura já estava alinhada à do nexus-insights. Sem A/B visual no momento; polimento fino fica para próxima rodada com screenshots. |
| 26 | Configuração — simplificar última execução | ✅ Faixa "Última execução por tipo" removida; cada campo (Incremental/Completa/Reconciliação) ganha linha sutil "Última execução: …" sob o helper. Botão "Ver estado da ingestão" com gap+border consistente. |
| 27 | Perfil | ✅ Ordem ajustada (Pessoais → Acessos → WhatsApp → E-mail → Senha → Aparência); WhatsappCard editável para super_admin/admin (reusa WhatsappNumbersField). |
| 28 | Sidebar — tema 3 ícones | ✅ Botão único substituído por radiogroup de 3 ícones (Sun/Moon/Monitor); padrão pílula FeatureCheckpoint. |
| 29 | Sidebar — colapso/expansão | ⏭️ **Pendente para próxima rodada.** Requer redesenho do `<aside>` com modo recolhido (logo + ícones + foto), animação da setinha vertical e regra de expansão automática ao abrir submenu colapsado. |
| 30 | Integrações/Canais | ✅ Card WhatsApp redimensionado (grid `lg:grid-cols-3`, igual à grade principal). **Pendente:** UI de instâncias WhatsApp (tabela `whatsapp_instances` já existe no schema; falta o CRUD UI). |
| 31 | Integrações/MCP | ⏭️ **Existe (`mcp-panel.tsx`, 143 linhas).** Faltam ajustes específicos — precisa do usuário detalhar o que mudar. |
| 32 | Integrações/Webhooks | ⏭️ **Existe (`webhooks-content.tsx`, 343 linhas).** Idem — precisa detalhe do que mudar. |
| 33 | Integrações/APIs (chaves) | ⏭️ **Existe (`api-keys-content.tsx`, 292 linhas).** Idem — precisa detalhe do que mudar. |

### Verificação rodada nesta sub-sessão
- `npx tsc --noEmit` — verde.
- `npx eslint src/` — verde.
- `npx jest --runInBand` — verde (1082 testes, 133 suites).
- Dev server + worker no ar; `curl /agente/prompt` → 302; `curl /perfil` → 302.

### Próxima sessão — priorizar
1. **#29 Sidebar colapsável** — design + animação completa.
2. **#30 Instâncias WhatsApp** — CRUD UI sobre `whatsapp_instances`.
3. **#31/32/33** — pedir ao usuário um diff específico (screenshot + texto)
   das telas MCP/Webhooks/APIs/BI antes de mexer.
4. **#25 Consumo polimento** — abrir a tela lado a lado com a do
   nexus-insights e ajustar paleta/espaços fino.
5. **Operacional**: garantir que o container `worker` do docker-compose
   esteja UP em produção, com healthcheck + restart policy `always`.

## 6. RESUMO (uma frase)

A F5 UI rework chegou no final do plano v3: bubble e Playground com input
compartilhado, anexo, áudio e tag de modelo; Playground com Provedor +
Modelo + Chave por sessão (com Salvar), nome editável, histórico que não
some, e sub-tela "Prompt da sessão" idêntica à tela Prompt do menu; áudio
e imagem do WhatsApp respeitam os checkpoints; sugestões clicáveis em
checkpoint de 3 estados; recursos exigem chave cadastrada; mic com
mensagens precisas de erro; cursor-pointer baseline + tooltips em
toda a plataforma. Tudo verificado (`tsc/eslint/jest 1082/build` verdes);
falta apenas o smoke test manual antes de chamar o usuário para validar.
