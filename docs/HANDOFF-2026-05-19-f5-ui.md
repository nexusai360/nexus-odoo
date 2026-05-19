# HANDOFF — F5 / Rework da UI do Agente Nex (2026-05-19, sessão 2)

> Continuidade entre sessões. A próxima sessão deve ler este arquivo antes de
> tocar em qualquer coisa. Estado consolidado, com o que foi entregue na
> sessão 2 e o que ainda falta.

---

## 0. TOM E ESTADO DA RELAÇÃO COM O USUÁRIO

O usuário (João Vitor Zanini, Nexus AI) está cobrando excelência depois de
várias entregas reprovadas. Trabalhar:

- com **competência, perfeccionismo e honestidade direta**;
- em **modo autônomo** (sem checkpoint entre etapas), com commits atômicos;
- **inline, sem delegar a subagentes** (eles entram frios e geram inconsistência);
- aplicando **ui-ux-pro-max obrigatoriamente** em tudo de frontend;
- **clonando o nexus-insights** (`/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`) quando há tela equivalente;
- **testando de verdade** — `tsc/eslint/build/jest` + dev server contra dado real
  quando aplicável.

---

## 1. ENTREGUE NA SESSÃO 2 (commits na branch `feat/integracao-whatsapp`)

Branch: `feat/integracao-whatsapp`. Commits adicionais nesta sessão:

| Commit | Tarefa | Resumo |
|---|---|---|
| `62091f4` | G4 + D8 (bubble) | Input bar reorganizada: `+` anexo à esquerda, microfone à direita dentro do `MessageInput` compartilhado; Enviar fora; tooltips. |
| `e3d154c` | D1 + D6 + D8 + D9 | Playground em `PageShell` + `PageHeader`, botão "Prompt da sessão" no header do chat (não mais no card lateral), input grandão substituído por `MessageInput`. |
| `acd79c5` | G5 | Mensagens claras de erro do microfone (permissão / sem mic / mic ocupado / segurança / dica de HTTPS). |
| `94e7207` | G2 | Regras de áudio/imagem no processor WhatsApp: image off → ignora silenciosamente; audio off → responde "não consigo entender áudio"; image on (sem pipeline) → resposta provisória; suggestions já não eram enviadas. |
| `bed559a` | G6 + G7 | Recursos com filtro de provedores por chave cadastrada, novo seletor de "Chave de API" por recurso, rótulos genéricos ("Provedor"/"Modelo"); sugestões clicáveis agora é checkpoint de 3 estados (OFF/PLAYGROUND/PRODUCTION). |
| `766c8e0` | G9 (raiz) | `buttonVariants` ganha `cursor-pointer` + `cursor-not-allowed`-em-disabled → toda a plataforma herda. |
| `e9cb4d8` | D4 | "Nova sessão" não arquiva a sessão atual — ela continua no histórico (sem desaparecer). |
| `5fbe8e9` | test fix | Mocka prisma no `processor.test` para acomodar G2. |

Componentes novos: `src/components/agent/attach-menu.tsx`.

### Verificação rodada ao fim da sessão 2

- `npx tsc --noEmit` — verde.
- `npx eslint src/` — verde (0 erros, 0 warnings).
- `npx jest --runInBand` — verde (1082 testes, 133 suites).
- `npm run build` — verde.
- Dev server NÃO foi exercido nesta sessão (cabeçalho da próxima sessão deve
  fazer o smoke test contra dado real antes de chamar o usuário).

---

## 2. O QUE AINDA FALTA (próxima sessão)

Em ordem de impacto. Cada item exige **plano + double-check + commits atômicos**.

### Block C — Consumo (cópia fiel)
- Estrutura já está alinhada (KPIs, charts violet, donut, bar, tabela com
  pílulas, filtros de período/provedor/ambiente, drill-down). Polimento fino
  remanescente: ajustar paletas/respiros para casar 1:1 com a tela
  `nexus-insights/src/components/llm/consumo-content.tsx`; investigar relato
  de "dropdown vazando" (popover do `CustomSelect`); auditar bugs de dados.

### Block D — Playground (D2, D3, D5)
- **D2** — Adicionar seletor de **Chave de API** à configuração da sessão
  (Provedor + Modelo + Chave). Não pré-selecionar modelo ao criar sessão
  (hoje pega o 1º). Botão **Salvar** explícito que persiste e atualiza o card
  do histórico. **Requer migration:** `PlaygroundSession.credentialId` (nullable,
  fk → LlmCredential). Atualizar `createPlaygroundSession`,
  `updatePlaygroundSessionModel` e os tipos.
- **D3** — Permitir **nomear** a sessão (campo `title` já existe no schema,
  só falta UI de rename inline + persistência via Server Action). Exibir o
  nome no card do histórico.
- **D5** — Tag `provedor·modelo` em cada mensagem do assistente (e nas
  mensagens transcritas/visão do usuário). **Requer migration:**
  `PlaygroundMessage.provider` + `PlaygroundMessage.model` (e talvez
  `PlaygroundMessage.requestKind`) para registrar quem gerou cada turn. UI:
  badge sutil ao lado/abaixo do bubble.

### Block G — Pendências
- **G1 (conteúdo do prompt)** — já feito em sessão anterior (seed +
  `ensureGlobalSettings`); revalidar.
- **G10** — Sub-tela "Prompt da sessão" deve ser **visualmente idêntica** à
  tela `/agente/prompt`. Hoje o componente `PlaygroundSessionPrompt` é uma
  versão simplificada. Reescrever clonando o layout (Identidade base +
  Comportamento + Recursos + ações de Salvar/Aplicar à produção). Atenção:
  recursos no playground devem operar sobre o snapshot da sessão, não sobre o
  `AgentSettings` global.
- **G9 (refinamento)** — Tooltip nos pontos clicáveis remanescentes (ícone
  sozinho deve ter tooltip; já adicionei em vários, mas falta uma varredura
  sistemática em `kb-section.tsx`, `credentials-section.tsx`,
  `llm-config-form.tsx`, `prompt-config-form.tsx`).

### Verificação de campo (regra de raiz)
- Subir `db + redis + mcp + dev + worker`, logar como super_admin, exercer
  **cada** tela tocada (Configuração, Chaves, Prompt, Playground, Consumo,
  bubble), caçar bugs de dado real, corrigir, e **só então** chamar o usuário.

---

## 3. AMBIENTE

- Docker: `docker compose up -d db redis mcp` · `npm run dev` (3000) ·
  `npm run worker`. Carregar env: `set -a && . ./.env.local && set +a`.
- `next build`: `npm run build` (força `NODE_ENV=production`). **Nunca**
  reintroduzir `NODE_ENV` em `.env.local`/`.env.production`.
- Login super_admin: `nexusai360@gmail.com`. Migrations aplicadas. Banco e
  fatos populados.

---

## 4. NOTAS TÉCNICAS

### G2 — comportamento do processor WhatsApp
- `AgentSettings.audioCheckpoint !== "PRODUCTION"` ⇒ responde "não consigo
  entender áudio" e encerra o job.
- `AgentSettings.imageCheckpoint !== "PRODUCTION"` ⇒ ignora silenciosamente
  (não envia resposta).
- Pipeline de visão multimodal **ainda não existe**: imagem com checkpoint
  PRODUCTION resulta em resposta provisória ("análise de imagens em ajustes
  finais"). Implementar quando o agente ganhar input multimodal.

### G6/G7 — schema
- `AgentSettings.suggestions_checkpoint`, `audio_credential_id`,
  `image_credential_id` já existem no banco (migration
  `20260519210235_f5_r6_schema`). UI e action atualizadas.
- `suggestions_enabled` (boolean legado) é mantido em sincronia
  (PRODUCTION ⇔ true) para não quebrar leitores antigos como o
  `loadAgentSettings` do `run-agent.ts`.

### G4 — attach-menu
- `AttachMenu` abre popover com Imagem (PNG/JPG/WebP/GIF) e Arquivo
  (PDF/TXT/MD/CSV/DOCX/XLSX). O handler default só dispara toast
  ("suporte completo em breve"); o pipeline real de upload de anexos para
  o agente é trabalho futuro (precisa endpoint multimodal + persistência +
  KB integration).

---

## 5. COMO A PRÓXIMA SESSÃO DEVE CONTINUAR

1. Ler este HANDOFF + `CLAUDE.md` + `STATUS.md` + o plano
   `docs/superpowers/plans/2026-05-19-f5-ui-ajustes-v3.md`.
2. Invocar a skill `ui-ux-pro-max:ui-ux-pro-max`.
3. Atacar **D2 → D3 → D5 → G10 → polimento Block C**. Cada um com plano +
   double-check + commits.
4. Smoke test real (dev server + worker + mcp) antes de chamar o usuário.
5. Não delegar. Trabalhar continuamente; não narrar a cada passo.

---

## 6. HISTÓRICO

- **Sessão 1 (anterior):** F5 backend completo (ondas 1–7) + 1ª/2ª/3ª rodadas
  de rework de UI (Blocos A, B, E, G3, G8, G11, H, I). Reprovação do usuário
  por inconsistência.
- **Sessão 2 (esta):** atacou Blocos D (parcial), G (G2/G4/G5/G6/G7/G9
  completos; G10 pendente). Verificação completa verde. Pendências
  documentadas acima.

> **Resumo em uma frase:** o input bar e os recursos do Agente Nex foram
> reorganizados/corrigidos (cursor + tooltip por toda parte, mic com
> mensagens claras, recursos exigindo chave, sugestões em checkpoint),
> WhatsApp agora respeita os checkpoints de áudio/imagem, e o Playground
> ficou com PageShell + input compartilhado + histórico preservado. Sobra:
> D2/D3/D5 (que exigem migrations), G10 (rebuild da sub-tela Prompt) e
> polimento fino do Consumo.
