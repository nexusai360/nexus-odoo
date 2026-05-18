# F5 — Integração WhatsApp + Agente de IA — Brainstorm / Requisitos (SPEC v1 — rascunho)

> **Captura do brainstorm de 2026-05-18 com o usuário.** Esta é a base da F5.
> A SPEC formal (v1→v2→v3 com 2 reviews) e o PLAN são o **primeiro trabalho da
> próxima sessão** — o contexto desta sessão estourou antes de fazê-los com o
> rigor da metodologia (`CLAUDE.md §6`); fazê-los rushed seria o "carimbo" que a
> própria metodologia proíbe. Tudo abaixo é entendimento **confirmado pelo
> usuário** — a próxima sessão começa daqui.
>
> **ESCOPO TRAVADO E MODO DE EXECUÇÃO (decisão do usuário, 2026-05-18):** a
> próxima sessão entrega **TUDO** que está neste documento — nada de recortar.
> A entrada de requisitos do brainstorm **já está fechada** (é este doc); a
> próxima sessão **não volta a perguntar requisitos** — entra direto em **modo
> autônomo desde o início** (`CLAUDE.md §6`) e cumpre a cadeia inteira
> `[1]→[10]`: SPEC v1→v2→v3 (2 reviews críticas), PLAN v1→v2→v3 (2 reviews),
> execução de **todas as sub-fases F5a–F5f** (ver §7), verificação e2e contra
> dado real, code/UI review. O humano só é chamado no fim, ou em erro/bloqueio
> real, ou no merge. A F5 é **faseada** (sub-fases) mas **entregue por
> completo** — o faseamento é só organização da execução, não recorte de escopo.

## 1. Objetivo da F5

Dar "rosto" ao MCP semântico da F4: um **agente de IA** que responde perguntas
de negócio (1) pelo **WhatsApp** e (2) por um **chat dentro da própria
plataforma**. Mais: uma área de **Integrações** que expõe o MCP e outros
recursos para consumo externo (n8n etc.).

## 2. Conexão com o WhatsApp — via n8n (NÃO direto com a Meta)

- A API oficial do **WhatsApp Cloud** já está rodando; número existe e está
  configurado. O webhook da Meta aponta para o **n8n** do usuário.
- **O usuário faz a 1ª triagem dentro do n8n:** identifica números autorizados
  e se é uma "sessão interna" (pergunta para o agente da empresa). O que for
  autorizado, o n8n **replica/encaminha o evento para a nossa plataforma**.
- A plataforma precisa de um **endpoint webhook receptor** que o n8n chama.
  Entregável: o endpoint + **orientação de como ligar o n8n nele** (config do
  lado do n8n).

### 2.1 Resposta — DOIS modos, ambos prontos e selecionáveis
1. **Plataforma responde direto** — nós chamamos a API do WhatsApp Cloud e
   entregamos a resposta ao usuário.
2. **Plataforma devolve para o n8n** — POSTamos o payload da resposta num
   webhook do n8n; o usuário monta o fluxo de entrega lá dentro.
Os dois devem existir; o modo é configurável.

## 3. O agente de IA — clone melhorado do "Nex" do Nexus Insights

- **Fonte:** projeto irmão em `/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/nexus-insights` (acesso total). Lá existe o agente **"Nex"**: chat de conversação, tela de **consumo** (prompt, tokens), integração **multi-LLM**, um **playground**.
- **Tarefa:** portar tudo isso para o nexus-odoo, adaptado à nossa realidade —
  **"Ctrl+C/Ctrl+V, mas melhorado"**: corrigir os bugs do Nex (em especial a
  **tela de relatórios de consumo**), e deixar a **tela de conversa/interação**
  muito mais polida, elaborada e consistente. O que está no Nexus Insights é
  esboço; aqui tem que ser robusto. `ui-ux-pro-max` obrigatório.
- O agente **chama o MCP da F4** (as 33 tools + Caminho 3c), carregando o
  `userId` validado por sessão (contrato de identidade da F4).
- Gestão de **prompt** e escolha do **modelo de LLM** controladas na plataforma.
- **Dois pontos de entrada, mesma lógica de agente:** o usuário pergunta pelo
  WhatsApp **ou** logado no chat in-app da plataforma.

## 4. Telas novas

### 4.1 Configurações — credenciais da Meta
Campos para as credenciais do WhatsApp Cloud: API key, WhatsApp Business ID,
Phone Number ID e demais credenciais que a Meta exigir (o usuário preencherá).

### 4.2 Novo menu "Integrações" — SUPERADMIN ONLY
- **Travado no RBAC**: visível e acessível **somente** para `super_admin`.
  Nenhum outro perfil vê este menu.
- **Área navegável de verdade** — cartões/retângulos por categoria; clicar abre
  **telas** (navegação tela-a-tela). **Nada de modal, nada de menu lateral que
  abre de lado** — o usuário navega entrando em telas.
- Categorias/cartões (estrutura a refinar na spec):
  - **Canais** → WhatsApp (e outros canais futuros).
  - **MCP** → conectar/expor servidores MCP para consumo externo (n8n e
    outros) — ver §5.
  - **Webhooks** → gerir o webhook receptor (n8n→nós) e o de saída (nós→n8n),
    com autenticação.
  - **API** → criar/gerir API keys.
  - **Plataformas de BI** → PowerBI e outras (placeholder para o futuro).

## 5. MCP consumível de fora (n8n e outros)

- O servidor MCP da F4 (Streamable HTTP) precisa ser **conectável pelo node de
  Agent do n8n** e por outros consumidores — quando em produção.
- A área **Integrações → MCP** gerencia isso: conectar vários servidores MCP /
  expor os endpoints, com **autenticação por token de API** (a API key pode
  morar na própria área de Integrações → API).
- Hoje a F4 já tem `MCP_SERVICE_TOKEN`; falta a **camada de UI** que gerencia
  esses tokens/endpoints e a documentação de como o n8n se conecta.

## 6. Cadastro de usuário — números de WhatsApp

- O cadastro de usuário ganha campo de **número(s) de WhatsApp** — **vários por
  usuário** (1, 2, 3…).
- A plataforma **revalida o acesso** (2ª linha de defesa, como na F4): cruza
  número de WhatsApp → usuário → nível de acesso. O n8n filtra os números na
  entrada; a plataforma confere de novo aqui.

## 7. Decomposição proposta (sub-fases — refinar na spec da próxima sessão)

- **F5a** — cadastro de usuário com número(s) de WhatsApp + cruzamento de acesso.
- **F5b** — núcleo do agente: orquestração multi-LLM, chamadas ao MCP, gestão
  de prompt. (Mapear o "Nex" do nexus-insights primeiro.)
- **F5c** — chat in-app + tela de consumo + playground (port melhorado do Nex).
- **F5d** — webhook receptor (n8n→nós) + resposta nos 2 modos.
- **F5e** — menu Integrações (superadmin): Canais/WhatsApp, MCP, Webhooks, API,
  BI — área navegável.
- **F5f** — credenciais Meta em Configurações.
Ordem e dependências a fechar na spec.

## 8. Pendências para a spec da próxima sessão

1. **Mapear o "Nex"** lendo o código do nexus-insights — quais LLMs integra,
   estrutura da tela de consumo, do playground, e quais bugs corrigir.
2. **Auth do webhook n8n↔plataforma** — recomendação a trazer (HMAC/assinatura
   ou shared secret).
3. **Provedor/modelo de LLM padrão** — multi-LLM é requisito; ver o que o Nex
   já integra. Default para Claude (mais capaz; `CLAUDE.md`).
4. `ui-ux-pro-max` obrigatório em todo o frontend novo (Integrações, chat,
   consumo, playground).
5. Rodar o ciclo metodológico completo: SPEC v1→v3 (2 reviews), PLAN v1→v3
   (2 reviews), execução por sub-fase, reviews, e2e contra dado real.

## 9. Como retomar (próxima sessão) — autônomo, escopo completo, faseado

Dizer **"vamos para a F5"**. A sessão entra **direto em modo autônomo** (sem
nova rodada de perguntas de requisito — o brainstorm está fechado neste doc) e:

1. Lê este doc + `STATUS.md` + `CLAUDE.md`.
2. Mapeia o agente "Nex" no `nexus-insights` (LLMs integradas, tela de consumo,
   playground, bugs a corrigir) — produz um doc de pesquisa.
3. Escreve a **SPEC v1→v2→v3** (2 reviews adversariais) cobrindo **todas** as
   sub-fases F5a–F5f de §7 — uma spec única faseada, como foi a F4 completo.
4. Escreve o **PLAN v1→v2→v3** (2 reviews) — decomposição máxima por sub-fase.
5. **Executa todas as sub-fases F5a–F5f** (subagentes Sonnet, review Opus por
   onda), com verificação **e2e contra dado real** obrigatória por onda.
6. Code review + UI review finais.
7. Chama o humano só no fim (resumo), ou em erro/bloqueio, ou no merge.

A F5 é grande — provavelmente vários PRs por sub-fase, como a F4. Mas o
**escopo é entregue inteiro**: ao fim da F5, o agente responde por WhatsApp e
in-app, o menu Integrações existe, o MCP é consumível de fora. Não encerrar a
F5 com sub-fase pendente.
