# HANDOFF — F5 / Rework da UI do Agente Nex (2026-05-19)

> **Documento de continuidade entre sessões.** A próxima sessão DEVE ler este
> arquivo inteiro antes de tocar em qualquer coisa. Ele define **onde paramos**,
> **o que falta**, **as regras inegociáveis** e — crítico — **as frustrações
> recorrentes do usuário** que NÃO podem se repetir.

---

## 0. TOM E ESTADO DA RELAÇÃO COM O USUÁRIO — leia primeiro

O usuário (João Vitor Zanini, Nexus AI) está **frustrado e decepcionado** com a
qualidade das entregas de UI da F5. Ele já teve que pedir as mesmas correções
**várias vezes**. Ele foi explícito, repetidamente, e tem razão nas críticas.
A próxima sessão precisa entrar com:

- **Competência, precisão nos detalhes, perfeccionismo.** Nada de entrega pela
  metade, nada de "carimbo", nada de review fake.
- **Honestidade direta.** Sem reasseguramento vazio ("ficou ótimo!"). Se algo
  está incompleto ou tem risco, dizer.
- **Execução, não narração.** O usuário se irrita com mensagens de status a cada
  passo. Trabalhar com ferramentas, commitar, e só falar no fim ou em
  bloqueio/erro real. Padrão: silêncio (CLAUDE.md).
- **Não repetir os erros abaixo.** Cada um já gerou frustração explícita.

---

## 1. FRUSTRAÇÕES RECORRENTES DO USUÁRIO — pontos de atenção (NÃO repetir)

Estas são as causas concretas de irritação ao longo da conversa. Tratar como
regras de raiz:

1. **UI abaixo do padrão e inconsistente.** Entregas anteriores criaram
   componentes divergentes — um jeito numa tela, outro jeito noutra — em vez de
   **reaproveitar o design system**. Resultado: visual "feio, grosseiro, botões
   grandões". → SEMPRE reusar `src/components/ui/*`; mesmo componente para o
   mesmo fim; zero `<select>` HTML nativo; zero divergência.

2. **`ui-ux-pro-max` não foi aplicado de verdade.** É **regra absoluta**: a
   skill `ui-ux-pro-max:ui-ux-pro-max` é OBRIGATÓRIA em **tudo** que for
   frontend — layout, componente, botão, ícone, tipografia, cor, espaçamento,
   animação. Invocar e aplicar o Quick Reference de fato, não só citar.

3. **Não clonaram o nexus-insights.** O usuário tem acesso ao projeto irmão
   `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`
   e exige que a UI da F5 seja uma **CÓPIA VISUAL** do "Agente Nex" de lá,
   adaptada à realidade do nexus-odoo, com os bugs corrigidos. "É só fazer
   Ctrl+C / Ctrl+V a nível de layout e corrigir o backend." NÃO inventar design
   próprio. Abrir os arquivos-fonte de `nexus-insights` e copiar.

4. **Delegar a subagentes gerou inconsistência.** O subagente começa "frio",
   sem o contexto da conversa, e foi isso que produziu as entregas ruins. O
   usuário foi **explícito: não delegar** o trabalho de detalhe/consistência —
   fazer **inline, na própria conversa**, que carrega o contexto. Delegação só
   para volume mecânico que não cabe; o trabalho sensível a qualidade é direto.

5. **"Parar no meio" / mensagens a cada passo.** O usuário se irrita quando
   cada turno termina com uma mensagem — parece que o trabalho parou. Explicar
   uma vez que é o limite de janela de contexto e seguir; não ficar mandando
   status. Trabalhar continuamente, commitar, falar só no fim.

6. **Faltou teste real.** Reviews de código não bastam. **Subir os serviços e
   exercer cada tela/funcionalidade contra dado real** — caçar bugs de verdade
   antes de entregar e chamar o usuário para validar. (CLAUDE.md §6 [9].)

7. **Metodologia Superpowers.** Planos e reviews seguem a metodologia
   (`superpowers:writing-plans` etc.). O usuário cobrou isso explicitamente:
   montar o plano ANTES de sair implementando.

8. **Nomenclatura "Agente Nex".** Toda menção na UI ao agente usa **"Agente
   Nex"** (nunca só "Agente").

9. **Build quebrado mascarado.** Houve um episódio em que o `next build` quebrou
   e um agente disse "é pré-existente" erradamente. Causa real: `.env.local`
   definia `NODE_ENV="development"`, que vazava para o `next build`. **Já
   corrigido** (NODE_ENV removido dos envs; script `build` força
   `NODE_ENV=production`). NÃO reintroduzir `NODE_ENV` nos arquivos de env.
   Para rodar `next build` corretamente: `npm run build` (já força production).

---

## 2. ONDE PARAMOS — estado atual

**Branch:** `feat/integracao-whatsapp` (NÃO commitar na `main`, NÃO mergear).
**A F5 (backend do agente, MCP, webhook WhatsApp, ondas 1–7)** foi implementada,
revisada por 3 agentes Opus e está na branch. O **PR #9** foi aberto mas o foco
mudou para corrigir a UI antes de qualquer merge.

**Trabalho atual: rework da UI** — plano canônico:
`docs/superpowers/plans/2026-05-19-f5-ui-ajustes-v3.md` (Blocos A–G).

### Status por bloco (plano v3)

| Bloco | Tema | Status |
|---|---|---|
| Bug 0 | `buttonVariants` server/client na tela Prompt | ✅ feito (`button-variants.ts`) |
| **A** | Configuração (avisos, layout, chave, saldo, teste) | ✅ A1,A2,A3,A4,A5 feitos |
| **B** | Chaves de API (saldo, espaçamento, "Editar" unificado) | ✅ B2,B3 feitos; B1 = saldo é estado honesto (ver §4) |
| **C** | Consumo — **cópia visual fiel do nexus-insights** | ⬜ **PENDENTE (grande)** — só o G11 (coluna Tipo) foi feito |
| **D** | Playground — **redesenho completo (9 tarefas)** | ⬜ **PENDENTE (grande)** |
| **E** | Sidebar "Agente" → "Agente Nex" | ✅ feito |
| **G** | Feedback 4ª rodada (11 tarefas) | parcial: G1 ✅, G3 ✅, G8 ✅, G11 ✅; **G2,G4,G5,G6,G7,G9,G10 pendentes** |
| **H** | 5ª rodada — Configuração (teste, dropdown, saldo) | ✅ feito |
| **I** | 5ª rodada — Chaves de API (Atualizar, crédito, dialog) | ✅ feito |

### Sessão 2026-05-19 (5ª rodada) — o que foi feito e verificado

- **Erro `column "embedding" does not exist`** — causa-raiz: a migration
  `f5_llm_usage_credential_kind` derrubou a coluna `embedding` (o
  `prisma migrate dev` não enxerga o tipo `vector`). Corrigido com migration
  idempotente `f5_restore_kb_embedding` + `embedding Unsupported(...)` no schema.
- **Bloco H** (Configuração): "Testar conexão" sem tarja verde permanente —
  resultado vai para a tarja única do topo + toast; botão desabilita quando a
  conexão está ativa e inalterada; dropdown de Chave de API com rodapé "Nova
  chave"; menu menos arredondado; bloco Consumo/Saldo com respiro e "Adicionar
  crédito" como botão outline.
- **Bloco I** (Chaves de API): removidos "Atualizar" e "Saldo indisponível";
  "Adicionar crédito" como botão outline; placeholder do dialog Editar corrigido.
- **G1**: o prompt do Agente Nex agora é semeado preenchido (identidade,
  personalidade, tom, guardrails); `ensureGlobalSettings` auto-repara
  instalações antigas; row local backfillada; testes cobrem o reparo.
- Verificação: `tsc`, `eslint`, `next build`, `jest` (agent-config) verdes.

> **Pendente para a próxima sessão:** Bloco C (Consumo), Bloco D (Playground,
> 9 tarefas) e o restante do Bloco G (G2, G4, G5, G6, G7, G9, G10).

### O que FALTA (prioridade)

1. **Bloco C — Consumo:** refazer `/agente/consumo` + `src/components/agent/consumo/*`
   como **cópia visual fiel** de `nexus-insights/src/components/llm/consumo-content.tsx`
   e `.../llm/*` e `.../agente-nex/consumo/page.tsx`. KPIs, gráficos, ícones,
   cores, fontes, espaçamentos, pílulas, tabela. Período com "Personalizado".
   Corrigir bugs de dados e dropdown que vaza. (A coluna "Tipo" do G11 já existe.)
2. **Bloco D — Playground:** redesenho completo. 9 tarefas no plano (D1–D9):
   margem padrão, seletor Provedor+Modelo+**Chave de API**, nome da sessão,
   histórico navegável, tag de modelo nas mensagens, "Prompt da sessão"
   reposicionado, áudio, input de uma linha que cresce, limpeza visual. A
   sub-tela "Prompt da sessão" (G10) deve ser **idêntica à tela Prompt**.
3. **Bloco G restante:** G1 (preencher conteúdo real do prompt — identidade,
   personalidade, tom, guardrails para o domínio Matrix Fitness Group), G2
   (regras de áudio/imagem replicando no WhatsApp), G4 (bubble: áudio à direita
   + botão "+" de anexo), G5 (erro de microfone — precisa HTTPS p/ `getUserMedia`),
   G6 (seletores de modelo de áudio/imagem com filtro + API key + rótulos),
   G7 (sugestões clicáveis com checkpoint de 3 estados), G9 (cursor-pointer +
   tooltip em tudo que é clicável, plataforma inteira).

---

## 3. AMBIENTE LOCAL (para testar)

- Docker: `db` (pgvector/pgvector:pg16, porta host **5436**), `redis` (6380),
  `mcp` (**container**, porta 3100 via `docker-compose.override.yml`).
- `.env.local` (gitignored) tem credenciais. `.env` (gitignored, criado nesta
  sessão) tem as vars de substituição do docker-compose.
- Subir: `docker compose up -d db redis mcp` · `npm run dev` (3000) ·
  `npm run worker`. Carregar env p/ comandos: `set -a && . ./.env.local && set +a`.
- **`next build`**: `npm run build` (já força `NODE_ENV=production`). NÃO
  exportar `NODE_ENV` para o build.
- Login super_admin: `nexusai360@gmail.com`. Migrations aplicadas, fatos
  populados (estoque, financeiro, fiscal etc.).
- O **container MCP** foi corrigido (Dockerfile gera o Prisma client no runner)
  e sobe ok. O MCP também roda como processo dev via `npm run mcp`.

## 4. NOTAS TÉCNICAS IMPORTANTES

- **Saldo das chaves de API:** OpenRouter expõe saldo real (`/api/v1/credits`,
  implementado em `src/lib/agent/llm/billing.ts`). **OpenAI/Anthropic/Gemini
  NÃO expõem saldo via API key** (confirmado por pesquisa — é limitação
  deliberada deles). Decisão acordada com o usuário: mostrar o **consumo
  acumulado rastreado por nós** (`LlmUsage.costUsd` somado por `credentialId`).
  Cada chave tem seu total próprio, cumulativo, que **nunca zera ao trocar de
  chave**; há um total geral somando todas. `LlmUsage.credentialId` e
  `LlmUsage.requestKind` já foram adicionados (migration aplicada);
  `CredentialSummary.consumedUsd` já agrega isso.
- `requestKind` (texto/imagem/audio/arquivo) já existe em `LlmUsage` e na
  tabela de Consumo (coluna "Tipo"). Falta o agente **gravar** o tipo certo a
  cada requisição (hoje default "texto").
- Comportamento WhatsApp (G2, a implementar no backend do agente): áudio
  desativado + áudio recebido → responder "não entendo áudio"; imagem
  desativada + imagem → ignorar; sugestões clicáveis não vão ao WhatsApp.

## 5. COMO A PRÓXIMA SESSÃO DEVE CONTINUAR

1. Ler este HANDOFF + `CLAUDE.md` + `STATUS.md` + o plano
   `docs/superpowers/plans/2026-05-19-f5-ui-ajustes-v3.md`.
2. Invocar a skill `ui-ux-pro-max:ui-ux-pro-max` (regra absoluta de frontend).
3. Continuar **inline, sem delegar**, na ordem: **Bloco C (Consumo)** →
   **Bloco D (Playground)** → **Bloco G restante**.
4. Para cada tela: abrir o arquivo-fonte equivalente no `nexus-insights` e
   **clonar o visual**; reusar o design system; commit atômico por tarefa;
   `npm run build` verde a cada passo.
5. Ao fim: **testes reais** — subir serviços, exercer cada tela, caçar bugs,
   corrigir. Só então chamar o usuário para validar.
6. Trabalhar continuamente; não narrar a cada passo.

## 6. HISTÓRICO RESUMIDO DA CONVERSA (contexto)

- A F5 (WhatsApp + Agente de IA) foi especificada (SPEC v1→v3), planejada
  (PLAN v1→v3) e executada em 7 ondas, com 3 reviews adversariais Opus —
  backend sólido, na branch.
- O usuário abriu a plataforma e reprovou a UI: telas vazias, sem submenus,
  bubble gigante, Integrações com cards gigantes, selects nativos ilegíveis,
  inconsistência geral. Pediu rework.
- 1º rework (v1): 17 commits — sidebar com grupo, telas, selects ricos. Ainda
  insatisfatório.
- 2º rework (v2): blocos de checkpoint, KB multiformato, catálogo. Introduziu
  (na verdade revelou) o problema do `next build` — resolvido (NODE_ENV).
- 3ª/4ª rodada de feedback detalhado (this) → plano v3 (Blocos A–G). Em
  execução inline: A, B, E, G3, G8, G11 feitos. C, D e o resto de G pendentes.
- O usuário deixou claro: chega de entrega ruim; clonar o nexus-insights;
  ui-ux-pro-max sempre; não delegar; testar de verdade; não parar no meio.

> **Resumo de uma frase para a próxima sessão:** continue o rework da UI da F5
> pelo Bloco C (Consumo) do plano v3, inline, clonando o nexus-insights, com
> `ui-ux-pro-max`, sem delegar, testando de verdade — e entregue à altura.
