# Welcome to Nexus AI

## How We Use Claude

Based on jvzanini's usage over the last 30 days:

Work Type Breakdown:
  Build Feature     ███████████████░░░░░  77%
  Improve Quality   ███░░░░░░░░░░░░░░░░░░  15%
  Plan Design       ██░░░░░░░░░░░░░░░░░░░   8%

Top Skills & Commands:
  /model        ████████████████████  5x/month
  /config       ████████████░░░░░░░░  3x/month
  /login        ████████░░░░░░░░░░░░  2x/month
  /gsd-update   ████░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  context-mode  ████████████████████  33 calls

## Your Setup Checklist

### Codebases
- [ ] nexus-odoo — https://github.com/nexusai360/nexus-odoo

### MCP Servers to Activate
- [ ] context-mode — Roteia saídas grandes de comando por um processador eficiente em tokens, economizando contexto. Vem como plugin do Claude Code; instale o plugin context-mode e ele passa a rodar sozinho.

### Skills to Know About
- [ ] /model — Troca o modelo Claude ativo na sessão.
- [ ] /config — Ajusta as configurações do Claude Code (settings.json).
- [ ] /login — Autentica sua conta Claude.
- [ ] /gsd-update — Atualiza o toolkit GSD (get-shit-done) para a última versão.

## Team Tips

Como o time trabalha. Registrado a partir do CLAUDE.md do projeto e incrementado conforme a metodologia evolui (este guia é vivo, vai sendo atualizado).

- **Modo autônomo é o padrão.** Ao iniciar uma implementação, o Claude percorre toda a cadeia (brainstorm, spec, plano, revisões, execução, verificação, code review) sem pedir permissão entre etapas. O humano só entra na entrada de requisitos, no merge para a main e no deploy.
- **Plano com revisão dupla obrigatória.** Todo plano passa por duas revisões críticas e adversariais antes de virar execução (plan v1, review, v2, review, v3). Revisão de verdade, não carimbo.
- **Sempre Opus 4.7.** Sonnet fica proibido para qualquer trabalho. Execução na sessão principal, sem delegar para subagente (a não ser com um arquivo de briefing de contexto completo).
- **Frontend usa a skill ui-ux-pro-max, sempre.** Qualquer layout, componente, ícone, cor, tipografia ou espaçamento passa pela skill antes e durante a implementação.
- **Clonar, não reinventar.** Quando existe um padrão pronto nos projetos irmãos (nexus-insights, nexus-nfe), clonar a base e a estrutura, mudando só as informações para a realidade do projeto.
- **Proibido o caractere travessão.** Nunca usar o travessão em texto, UI, documentação ou commit. A escrita é humanizada, em linguagem natural de produto.
- **Design system reaproveitado.** Componentes, tipografia, cores e padrões de UI vêm do design system existente (base do nexus-insights). Campos obrigatórios usam label com asterisco vermelho. Nada de fonte fora da escala do sistema.
- **Cache local é a fonte.** Dashboard e MCP leem do Postgres interno, nunca do Odoo ao vivo.
- **Verificação com evidência.** Antes de declarar algo pronto: tsc, eslint, jest e build verdes, e teste contra dado real quando o trabalho envolve dado.
- **Protocolo multi-agente.** Se houver outra sessão Claude no repo, seguir o AGENTS.md (registrar-se em docs/agents/active antes de tocar código).

## Get Started

1. Leia o CLAUDE.md na raiz do projeto. Ele define todo o fluxo de trabalho e as decisões canônicas.
2. Leia o STATUS.md. É o ponto de retomada entre sessões (fase atual, o que já foi feito, próxima ação).
3. Suba o ambiente local: `docker compose up -d db redis`, depois `npm run dev`.
4. Confira o roadmap de fases no CLAUDE.md (F0 a F6) para entender onde o projeto está.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
