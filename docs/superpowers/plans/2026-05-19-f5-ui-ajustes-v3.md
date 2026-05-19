# F5 — Ajustes da UI do Agente Nex v3 — Plano de Implementação

> **For agentic workers:** plano executado **inline pelo próprio assistente**,
> tarefa a tarefa, na conversa (sem delegar a subagente — decisão do usuário).
> Steps usam checkbox (`- [ ]`).

**Goal:** Aplicar a 3ª rodada de feedback do usuário sobre a UI da F5 —
Configuração (saldo, avisos, layout), Chaves de API (editar unificado, saldo),
Consumo (cópia fiel do nexus-insights) e Playground (redesenho completo).

**Arquitetura:** Ajustes incrementais sobre o rework v2 já entregue. Frontend
com `ui-ux-pro-max` aplicado em cada componente; backend onde precisar (saldo,
sessões de playground). Clone visual do "Agente Nex" do nexus-insights.

**Tech Stack:** Next.js 16, React, Tailwind v4, base-ui, Prisma v7. Referência
visual: `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights`.

**Regras:** `ui-ux-pro-max` obrigatório em tudo de frontend (componente, botão,
ícone, layout). "Agente Nex" em toda menção. Reusar design system. Commits
atômicos `fix(f5-ui):`/`feat(f5-ui):`. `tsc`+`build` verdes ao fim de cada bloco.

> **Concluído fora do plano:** o erro `buttonVariants` server/client da tela
> Prompt já foi corrigido (commit `2a...`, `button-variants.ts`).

---

## BLOCO A — Tela Configuração do Agente Nex

### Task A1 — Limpar avisos amarelos
**Files:** `src/components/agent/llm-config-form.tsx`
- [ ] Manter **apenas** a tarja "Nenhuma conexão ativa. Selecione provedor,
  modelo e chave." Remover o aviso de rodapé "Sem chaves cadastradas para
  OpenAI, botões desativados" — é redundante.
- [ ] `npm run build` verde. Commit.

### Task A2 — Espaçamento da seção "Agente Nex ativo"
**Files:** `src/components/agent/llm-config-form.tsx`
- [ ] Aumentar a margem superior entre a linha/seção "Agente Nex ativo"
  (toggle) e o componente acima — hoje está colado. Aplicar escala de
  espaçamento do `ui-ux-pro-max` (respiro claro entre seções).
- [ ] `build` verde. Commit.

### Task A3 — Campo Chave de API vazio por padrão + botão "Nova chave"
**Files:** `src/components/agent/llm-config-form.tsx`
- [ ] O `CustomSelect` da Chave de API inicia **vazio** (placeholder), nunca
  pré-selecionado com "Nova chave".
- [ ] Quando o provedor não tem chaves cadastradas, **não** exibir "Nova chave"
  como opção do select — exibir um **botão clicável distinto** ("+ Nova chave
  da OpenAI") ao lado/abaixo do campo, com layout de botão (não de opção de
  lista). Esse botão leva à tela `/agente/chaves`. Selecionar "Nova chave"
  jamais preenche o campo Chave de API.
- [ ] `build` verde. Commit.

### Task A4 — Nova seção de Saldo (acima do Provedor)
**Files:** `src/components/agent/llm-config-form.tsx`,
`src/lib/agent/llm/billing.ts` (se precisar ajuste)
- [ ] Criar uma seção **acima do seletor de Provedor**: ao selecionar uma chave
  de API, exibe o **saldo/crédito** daquela chave naquele provedor + botão
  **"Adicionar crédito"** (link para o billing do provedor).
- [ ] O saldo se mantém atualizado: após cada requisição que consome tokens,
  disparar a atualização do saldo (consulta de billing ou abatimento do custo
  retornado). Reusar/consertar `billing.ts`.
- [ ] `ui-ux-pro-max` no layout da seção. `build` verde. Commit.

### Task A5 — Mensagem do "Testar conexão" e fonte da verdade no topo
**Files:** `src/components/agent/llm-config-form.tsx`
- [ ] "Testar conexão": exibir **uma única** mensagem de sucesso — "Conexão
  verificada com sucesso." (eliminar a duplicação "conexão verificada" +
  "conexão verificada com sucesso").
- [ ] A área que reflete o estado da conexão é a **tarja do topo**: ao salvar a
  configuração, o topo passa a "Conexão ativa · provedor · modelo · chave".
  O teste/salvar ficam embaixo; o topo é a fonte da verdade do status.
- [ ] `build` verde. Commit.

---

## BLOCO B — Tela Chaves de API

### Task B1 — Corrigir a busca de saldo
**Files:** `src/lib/agent/llm/billing.ts`, `src/components/agent/credentials-section.tsx`
- [ ] Investigar e corrigir o erro "não dá para buscar" no botão "Atualizar"
  saldo (testado pelo usuário com uma chave OpenAI real). Garantir tratamento
  de erro claro e, onde o provedor não expõe saldo, mensagem honesta.
- [ ] `build` verde. Commit.

### Task B2 — Espaçamento do bloco de saldo
**Files:** `src/components/agent/credentials-section.tsx`
- [ ] O bloco "Saldo disponível / Atualizar / Adicionar crédito" está colado ao
  nome da chave — adicionar respiro (espaçamento sutil). `ui-ux-pro-max`.
- [ ] `build` verde. Commit.

### Task B3 — Unificar "Renomear" + "Trocar" num único "Editar"
**Files:** `src/components/agent/credentials-section.tsx` (+ dialogs)
- [ ] Remover os botões "Renomear" e "Trocar". Colocar **um único botão de
  lápis "Editar"** que abre **uma só tela/dialog** onde o usuário muda o **nome**
  e **troca a chave** de API juntos. Aviso/descrição apropriados.
- [ ] O ícone de lápis precisa de **espaçamento** do texto "Editar" (hoje colado).
- [ ] `build` verde. Commit.

---

## BLOCO C — Tela Consumo (cópia fiel do nexus-insights)

### Task C1 — Reconstruir o Consumo como cópia do nexus-insights
**Files:** `src/app/(protected)/agente/consumo/page.tsx`,
`src/components/agent/consumo/*`
- [ ] Reler todo o feedback anterior do usuário sobre o Consumo (rounds 1 e 2).
- [ ] Abrir `nexus-insights/src/components/llm/consumo-content.tsx` e
  `nexus-insights/src/components/llm/*` e `.../agente-nex/consumo/page.tsx`,
  e refazer a tela de Consumo do nexus-odoo como **cópia visual fiel**: mesmos
  KPIs, gráficos, ícones, cores, fontes, espaçamentos, tags/pílulas, tabela de
  histórico, seletor de período (com "Personalizado"), lista de providers.
  Adaptar **somente** os dados à realidade do nexus-odoo.
- [ ] Corrigir bugs de dados e qualquer dropdown que vaze o componente.
- [ ] `ui-ux-pro-max` no resultado. `build` verde. Commit.

---

## BLOCO D — Tela Playground (redesenho completo)

> Referência: `nexus-insights/src/components/agente-nex/playground-sheet.tsx`.
> O usuário deu várias diretrizes — desenhar a melhor solução com `ui-ux-pro-max`.

### Task D1 — Margem/borda padrão
**Files:** `src/app/(protected)/agente/playground/page.tsx`, `playground-content.tsx`
- [ ] O Playground hoje ocupa a tela toda sem margem. Aplicar a **mesma
  margem/padding/borda** das outras telas (referência: tela de Consumo).
- [ ] `build` verde. Commit.

### Task D2 — Configuração da sessão: Provedor + Modelo + Chave de API
**Files:** `playground-content.tsx`, Server Actions de playground
- [ ] No painel lateral de configuração da sessão, **adicionar o seletor de
  Chave de API** (hoje só tem Provedor e Modelo). A chave é da sessão.
- [ ] Ao **criar nova sessão**, NÃO pré-selecionar provedor/modelo
  automaticamente (hoje cria com o 1º modelo da lista). A sessão começa
  exigindo o usuário definir Provedor + Modelo + Chave.
- [ ] Ao mudar o modelo/provedor/chave, exibir um botão **"Salvar"** que
  persiste a mudança e **atualiza o card de histórico** da sessão.
- [ ] `build` verde. Commit.

### Task D3 — Nome da sessão
**Files:** `playground-content.tsx`, Server Actions + schema (`PlaygroundSession.nome`)
- [ ] Permitir **dar um nome** à sessão de playground. Migration aditiva se
  faltar o campo. O nome aparece no card de histórico.
- [ ] `build` verde. Commit.

### Task D4 — Histórico de sessões navegável
**Files:** `playground-content.tsx`
- [ ] Clicar numa sessão do histórico **carrega as conversas** daquela sessão.
- [ ] Permitir **sair/voltar** de uma sessão do histórico para a atual (hoje
  fica preso). Navegação clara entre sessões.
- [ ] `build` verde. Commit.

### Task D5 — Tag de modelo nas mensagens
**Files:** `agent-message.tsx` (ou componente de mensagem do playground)
- [ ] **Toda mensagem da IA** carrega uma **tag** com `provedor · modelo` usado
  para gerar aquela resposta.
- [ ] **Mensagens de áudio/imagem do usuário** (que passam por transcrição/
  visão) carregam a tag do `provedor · modelo` que fez a transcrição/leitura.
- [ ] As tags são persistidas no histórico da sessão.
- [ ] `ui-ux-pro-max` (estilo de tag/badge consistente). `build` verde. Commit.

### Task D6 — Botão "Prompt da sessão" reposicionado
**Files:** `playground-content.tsx`
- [ ] Reposicionar e destacar melhor o botão **"Prompt da sessão"** — hoje está
  mal alocado, perto do "Nova sessão". `ui-ux-pro-max` para a hierarquia.
- [ ] `build` verde. Commit.

### Task D7 — Áudio no Playground
**Files:** `playground-content.tsx`, input bar do playground
- [ ] A opção de **enviar áudio** (microfone) deve aparecer no Playground
  (hoje não aparece) — usando o modelo de áudio dedicado configurado em
  Prompt → Recursos.
- [ ] `build` verde. Commit.

### Task D8 — Campo de input de mensagem
**Files:** input bar do playground (e, por consistência, da bubble)
- [ ] Trocar o "campo de texto grandão" por um input **sutil de uma linha** que
  **cresce conforme o usuário digita** até um limite e então faz **rolagem
  interna**. `ui-ux-pro-max` (forms).
- [ ] `build` verde. Commit.

### Task D9 — Limpeza visual geral do Playground
**Files:** `playground-content.tsx`
- [ ] Remover linhas/separadores sem propósito; organizar a tela com critério.
  Redesenho coerente, `ui-ux-pro-max`.
- [ ] `build` verde. Commit.

---

## BLOCO E — Sidebar

### Task E1 — "Agente" → "Agente Nex"
**Files:** `src/lib/constants/nav.ts`
- [ ] No sidebar, o grupo "Agente" passa a se chamar **"Agente Nex"**.
- [ ] `build` verde. Commit.

---

## BLOCO F — Verificação

### Task F1 — Verificação final
- [ ] `tsc`, `eslint src/`, `jest`, `build` verdes.
- [ ] Subir dev + MCP (container) + worker; smoke test das telas tocadas.
- [ ] Commit de fechamento.

---

## Self-review (cobertura do feedback)

| Feedback do usuário | Task |
|---|---|
| Muitos avisos amarelos na Configuração | A1 |
| Aviso de rodapé "sem chaves" desnecessário | A1 |
| Margem da seção "Agente Nex ativo" | A2 |
| Chave de API pré-selecionada com "Nova chave" | A3 |
| "Nova chave" deve ser botão, não opção de select | A3 |
| Seção de saldo acima do provedor | A4 |
| Saldo se atualiza a cada requisição | A4 |
| "Testar conexão" com mensagem duplicada | A5 |
| Status da conexão no topo, não embaixo | A5 |
| Saldo colado ao nome da chave (Chaves de API) | B2 |
| Erro ao atualizar saldo | B1 |
| Renomear+Trocar → um único "Editar" | B3 |
| Lápis colado ao texto | B3 |
| Consumo deve ser cópia fiel do nexus-insights | C1 |
| Playground sem seletor de Chave de API | D2 |
| Nova sessão cria com modelo padrão | D2 |
| Botão Salvar ao mudar modelo | D2 |
| Nomear a sessão | D3 |
| Histórico de sessão não carrega/não volta | D4 |
| Tag de modelo nas mensagens | D5 |
| "Prompt da sessão" mal posicionado | D6 |
| Áudio não aparece no Playground | D7 |
| Campo de input grandão | D8 |
| Playground sem margem padrão | D1 |
| Redesenho geral do Playground | D1–D9 |
| Sidebar "Agente" → "Agente Nex" | E1 |
