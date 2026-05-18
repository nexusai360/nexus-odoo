# F6 — Construtor de relatórios (ideia de roadmap)

> Registrado em 2026-05-16 durante o brainstorm da F3. Ideia do cliente,
> refinada em conversa. **Não é para construir agora** — fase última do
> roadmap, depois da F4. Este documento é o ponto de partida da spec da F6.

## Visão

Um **construtor de relatórios in-app**, disponível só para `super_admin` e
`admin`. O usuário leigo (sem programação) entra no construtor, descreve o que
quer, e a IA o conduz por um **wizard guiado** — perguntas intencionais, não
engessadas — coletando o que ele precisa. Ao final, o relatório é montado, o
usuário vê num layout de teste, pede ajustes, e quando aprova, o relatório
passa a aparecer.

- **Visibilidade do relatório criado:** amarrado ao perfil de quem criou —
  só ele vê. `super_admin` e o `owner` veem todos. `admin` vê só os seus.
  `manager`/`viewer` não têm acesso ao construtor.
- **IA:** interface estilo-chat, conduz o wizard, conhece todos os domínios e
  a base de dados da plataforma. Quando o pedido não é viável, **avisa com
  honestidade** e oferece alternativas ("assim não dá; consigo fazer assado").

## Decisões canônicas (tomadas no brainstorm)

1. **Config-driven, não code-gen.** O construtor produz uma **definição
   declarativa** de relatório (config), NÃO código. Sem PR, sem deploy, sem
   linha de código nova. Um **motor genérico de renderização** interpreta a
   config. Risco zero de quebrar a plataforma. A parte "IA abre PR para
   produção" da ideia original foi **descartada** — entregaria code-gen por
   IA à produção sem auditoria, furando todo o rigor do projeto.
2. **Modelo de ferramenta/template.** Cada relatório é um **template
   parametrizado** (tipo de visual × fato/fonte × agrupamento × filtros ×
   período). O wizard apenas parametriza templates no backend. Layout,
   componentes, ícones, tipografia — tudo padronizado e fixo; o usuário não
   muda a moldura, só os parâmetros que importam.
3. **Reusa a camada semântica da F4 (MCP).** O construtor não nasce do zero —
   aproveita o entendimento de domínio e os padrões de consulta auditados da
   F4. Por isso vem **depois da F4**. O "avisar honestamente quando não dá" é
   o **Caminho 3** já canônico (`CLAUDE.md` §5.5).
4. **Acervo grande de visualizações.** O construtor precisa ser "incrível" e
   cobrir bastante: filtros, períodos, agrupamentos, pesquisas de dados, e
   diversidade de gráficos — barra, linha, pizza, tabela, KPI, e formas
   avançadas (ex.: gráficos 3D). Quanto maior o acervo de templates
   parametrizáveis, mais relatórios o construtor cobre.
5. **Integração com a conta Anthropic via config global.** O consumo de IA do
   construtor usa a conta/`API key` configurada no menu **Configuração**
   (só `super_admin`), a nível global. É a **API do Claude** (`claude-api`) —
   constrói-se uma interface estilo-chat contra a API. Travas obrigatórias na
   config: rate limit, seleção de modelo, e quais perfis podem usar quais
   modelos. **Medição de consumo por cliente é obrigatória** — sem cota, é
   custo sem teto na conta do desenvolvedor.

## Caveats honestos (registrar na spec da F6)

- **O construtor não é infinito.** O modelo de templates cobre ~80–90% dos
  pedidos; a cauda de relatórios atípicos ainda precisa de desenvolvedor. A IA
  precisa **detectar** "isto não cabe num template" e dizer.
- **Limitado pelos fatos existentes.** Um relatório precisa de um `fato_*`. Se
  o fato não existe, o construtor não o cria sozinho — modelar fato é etapa de
  engenharia. O alcance do construtor é a interseção dos fatos disponíveis.
- **Sobreposição com a F4.** "Usuário pede relatório à IA" é quase "F4 com
  resultado salvo como widget". Decidir conscientemente na spec da F6 se o
  construtor é peça separada ou "salvar uma resposta do MCP como relatório".

## Impacto na F3 (agora)

A F3 constrói os 6 relatórios de estoque **como templates parametrizados
reutilizáveis**, não como componentes sob medida. Não se constrói o motor
no-code completo na F3 (over-engineering) — mas a base declarativa fica pronta
para a F6 ser extensão, não reescrita.
