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
- [ ] Criar uma seção **acima do seletor de Provedor** com botão **"Adicionar
  crédito"** (link para o billing do provedor).
- [ ] **Modelo de saldo/consumo (confirmado pelo usuário):**
  - **OpenRouter** → saldo restante real via `billing.ts` (`/api/v1/credits`).
  - **OpenAI/Anthropic/Gemini** → não há endpoint de saldo via API key; em vez
    disso exibir o **consumo acumulado rastreado por nós** a partir de
    `LlmUsage`: `SUM(costUsd)` das requisições feitas com aquela chave.
  - **Atribuição por chave:** `LlmUsage` ganha um campo **`credentialId`**
    (migration aditiva); `logUsage` grava qual credencial foi usada. Consumo
    da chave = soma das rows daquela `credentialId`.
  - **Comportamento cumulativo:** cada chave mantém o **seu próprio total
    persistente**; trocar a chave ativa **nunca zera nem reduz** nada. Há um
    **total geral** = soma de todas as chaves (ex.: OpenAI $10 + Gemini $5 →
    total $15). Cada chave exibe o seu; a seção exibe também o total.
  - Atualiza a cada requisição (o custo já é logado em `LlmUsage`).
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

---

## BLOCO G — Feedback adicional (4ª rodada — Prompt, Bubble, recursos)

### Task G1 — Preencher o conteúdo do Prompt
**Files:** `prisma/seed.ts` (ou seed do `AgentSettings`), conteúdo default
- [ ] Redigir e preencher de verdade: **texto do prompt (identidade base),
  personalidade, tom, guardrails** — para o Agente Nex consultar a operação da
  Matrix Fitness Group (estoque, financeiro, fiscal, comercial). Esse prompt
  vale para a **bubble in-app E para o WhatsApp**.
- [ ] Garantir que o seed/escrita popula `AgentSettings` (não deixar em branco).

### Task G2 — Recursos replicam para o WhatsApp (regra de comportamento)
**Files:** núcleo do agente (`run-agent.ts` / handler WhatsApp)
- [ ] Sugestões clicáveis: **não** usadas no WhatsApp (só in-app).
- [ ] Áudio desativado + usuário manda áudio no WhatsApp → o agente responde
  que **não consegue entender áudio**. Imagem desativada + imagem no WhatsApp →
  **ignora** silenciosamente. Na bubble in-app os botões são travados (não
  precisa mensagem). Isso é regra de backend a implementar.

### Task G3 — Bubble: nomenclatura e descrição
**Files:** `chat-panel.tsx` (welcome block + header)
- [ ] Header e welcome: "Agente Nex" (hoje "Agente"). Welcome: "Olá, sou o
  **Agente Nex**." Descrição encurtada para **"Respostas em tempo real."**
  (em vez da frase de 2 linhas).

### Task G4 — Bubble: input bar redesenhada (áudio à direita + anexo)
**Files:** `chat-panel.tsx` (input bar)
- [ ] Botão de **áudio** vai para a **direita**, **antes do botão Enviar** (o
  Enviar fica na extremidade direita; o gravar-áudio logo antes).
- [ ] Onde o áudio estava (esquerda), um botão **"+" / anexo**: ao clicar,
  abre opções para anexar **imagem** e **arquivo** (sem vídeo). Definir os
  formatos de imagem e de arquivo aceitos; descrição curta ao abrir.

### Task G5 — Permissão de microfone
**Files:** `audio-recorder.tsx`
- [ ] Investigar o erro "microfone negado" no ambiente local; tratar o estado
  de permissão negada com mensagem clara; verificar implicação em produção
  (HTTPS necessário para `getUserMedia`).

### Task G6 — Recursos de áudio/imagem: seletor correto
**Files:** `resources-toggles.tsx`
- [ ] Modelo de **imagem**: filtrar só modelos que **leem imagem**; modelo de
  **áudio**: só modelos de áudio. Provedor: só provedores **com API key
  cadastrada**; vazio por padrão; sem chave → botão "Nova chave" (vai p/
  `/agente/chaves`). Adicionar **seletor de API key** (provedor + modelo +
  chave). Rótulos: **"Provedor"** e **"Modelo"** (sem "de áudio"/"de imagem").
- [ ] Alargar os componentes, alinhados às bordas (padrão da tela de Consumo).

### Task G7 — Checkpoint nas Sugestões clicáveis
**Files:** `resources-toggles.tsx`
- [ ] Sugestões clicáveis passa a usar o **mesmo controle de 3 estados**
  (desativado / playground / produção) dos recursos de áudio/imagem — não a
  chavinha simples. Ajustar backend conforme.

### Task G8 — Base de conhecimento: lixeira no lugar do X + alinhamento
**Files:** `kb-section.tsx`
- [ ] Remover o "X" de cada documento; colocar a **lixeira** no lugar do X.
- [ ] Alinhar à direita todos os controles (checkpoint de áudio/imagem/
  sugestões e a lixeira da KB) — alinhamento consistente com a seção de KB.

### Task G9 — Feedback de clicável em toda a plataforma
**Files:** componentes diversos
- [ ] Tudo que é clicável: `cursor-pointer` + **tooltip** explicando a ação ao
  passar o mouse. Aplicar de forma consistente (`ui-ux-pro-max`).

### Task G10 — Playground: tela "Prompt da sessão" igual à tela Prompt
**Files:** `playground-content.tsx` + sub-tela de prompt da sessão
- [ ] A sub-tela "Prompt da sessão" deve ser **visualmente idêntica** à tela
  do menu Prompt (identidade base, personalidade, tom, guardrails). Nova
  sessão carrega o que está em produção; edições ficam na memória da sessão.
- [ ] Destaque maior para "Aplicar à produção" / "Salvar prompt". Redesenhar.

### Task G11 — Consumo: coluna/tag de tipo de requisição
**Files:** consumo (tabela + filtros), `LlmUsage` (campo `tipo`)
- [ ] Acrescentar à tabela de histórico uma **tag de tipo**: texto / imagem /
  áudio / arquivo. Permitir **filtrar** o consumo por tipo. Campo novo em
  `LlmUsage` (migration aditiva) preenchido a cada requisição.

| Feedback 4ª rodada | Task |
|---|---|
| Preencher conteúdo do prompt | G1 |
| Recursos replicam no WhatsApp; áudio off → "não entendo" | G2 |
| Bubble "Agente Nex" + descrição curta | G3 |
| Áudio à direita + botão de anexo "+" | G4 |
| Erro de microfone negado | G5 |
| Seletor de modelo de imagem/áudio + API key + rótulos | G6 |
| Sugestões clicáveis com checkpoint de 3 estados | G7 |
| KB: lixeira no lugar do X + alinhamento | G8 |
| Feedback de clicável (cursor + tooltip) | G9 |
| Playground: prompt da sessão = tela Prompt | G10 |
| Consumo: tag de tipo de requisição | G11 |

---

## BLOCO H — 5ª rodada de feedback (Configuração, Chaves de API) ✅

> Feedback dado após revisão das telas Configuração e Chaves de API.
> Implementado em `fix(f5-ui): erro embedding + ajustes ...`.

### Task H0 — Erro `column "embedding" does not exist` ✅
- [x] A migration `f5_llm_usage_credential_kind` derrubou a coluna `embedding`
  de `kb_documents` (o `prisma migrate dev` não enxerga o tipo `vector`).
  Nova migration idempotente `f5_restore_kb_embedding` re-adiciona coluna +
  índice HNSW; schema declara `embedding Unsupported("vector(1536)")?`.

### Task H1 — "Testar conexão": sem tarja permanente ✅
- [x] Removida a segunda tarja verde embaixo. O resultado do teste vai para a
  **tarja única do topo** (fonte da verdade) e por toast.
- [x] Botão "Testar conexão" **desabilita** quando a conexão está ativa e
  inalterada (provedor/modelo/chave iguais aos salvos); reativa ao mudar.

### Task H2 — Atalho "Nova chave" no dropdown de Chave de API ✅
- [x] O `CustomSelect` ganha prop `footer`; o select de Chave de API exibe
  no rodapé "Nova chave de <provedor>" levando a `/agente/chaves`.

### Task H3 — Dropdown menos arredondado ✅
- [x] Menu do `CustomSelect` passa de `rounded-xl` para `rounded-lg`.

### Task H4 — Bloco Consumo/Saldo da chave ✅
- [x] Respiro entre o select e o bloco; "Adicionar crédito" vira botão outline.

## BLOCO I — 5ª rodada (Chaves de API) ✅

### Task I1 — Remover "Atualizar" e "Saldo indisponível" ✅
- [x] O consumo é rastreado pela plataforma; botão "Atualizar" removido.
  Saldo real só aparece quando o provedor o expõe (OpenRouter).

### Task I2 — "Adicionar crédito" como botão outline ✅
- [x] Substitui o link roxo por botão com contorno.

### Task I3 — Placeholder cortado no dialog Editar ✅
- [x] Placeholder encurtado para "Nova chave — opcional"; explicação completa
  movida para o helper text.
