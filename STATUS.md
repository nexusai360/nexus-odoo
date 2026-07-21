# STATUS , ponto de retomada

Branch ativa: **`feat/entregas-parciais-base-calculo`** (LOCAL, nada em produção).
Dev local no ar em `localhost:3000` (containers `db`+`redis` up; Docker reiniciado/destravado em 2026-07-21).

## Onde estamos (2026-07-21, tarde) , ÚLTIMO ESTADO

9 commits nesta sessão (`3946baf5..520c580a`), LOCAL, nada em prod, sem PR/merge.
Dev local no ar (rodei `dev:fresh` várias vezes , mudança de query/provider NÃO
aplica por fast-refresh, exige **hard reload** Cmd+Shift+R no browser).

**1) B-09 reformulado para modelo POR PEDIDO (era 1 linha por item):**
- 748 itens viraram **67 pedidos** (1 linha = 1 pedido em todas as visões).
- Coluna **Pedido = tag clicável** que abre o pedido no Odoo (URL do modelo
  `pedido.documento` montada de `linha.pedidoId`; confirmado no banco:
  3210=PV-2511/26, 3500=PV-2684/26).
- **Dropdown** expansível com os produtos; **detalhe redesenhado** em seções (sem
  cards retangulares; lista de produtos limpa, sem gridlines).
- Genérico `tabela-avancada.tsx` ganhou `expandirRow`/`renderDetalhe`/`textoBusca`/
  `permiteVenda` + `OpcoesTabelaContext`. Catálogo virou `LinhaEntrega`(pedido) +
  `ItemEntrega`; agregação em `blocos-pedidos.tsx`. storageKey da tabela em **v4**.

**2) Ajustes de UI:** pedido completo (sem truncar), chevron à esquerda, quinas do
card (overflow-hidden), hover por coluna (setas + divisória roxa), duplo-clique
auto-fit. Nome do cliente completo (`nomeLimpo` maxLen 999).

**3) Forma de pagamento CORRIGIDA NA FONTE:** vinha das parcelas (só ~40% dos
pedidos em aberto têm parcela) → agora de `raw_pedido_documento.data.forma_pagamento_id`
(cabeçalho, cobre 100%). PV-2464 passou de "-" para **Boleto**.

**4) Quantidade** (Total/Atendida/A atender) e **Valor** (Total/Atendido/A atender)
+ **toggle custo/venda com ícones** (Coins âmbar em cima / Tag verde embaixo), botão
"Mostrar venda".

**5) RENTABILIDADE do PEDIDO** (comissão/subtotal/margem/impostos) , extraída direto
do jsonb `raw_pedido_documento.data` (campos PRONTOS do Odoo, aba Rentabilidade):
`vr_operacao_tributacao`(subtotal), `vr_custo_comercial`, `vr_icms_proprio`,
`vr_difal`, `vr_fcp`, `vr_pis_proprio`, `vr_cofins_proprio`, `al_comissao`,
`vr_comissao`, `vr_liquido`, `al_margem`. **PERÍCIA CRÍTICA: Margem = Líquido ÷
Subtotal, e líquido/margem vêm PRONTOS , NÃO recalcular** (subtração simples das
colunas de imposto bruto dá margem errada, porque é Lucro Real e o `vr_liquido` já
abate créditos). Coluna **Margem** (colorida) + seção "Rentabilidade do pedido" no
detalhe; novo `CelulaTipo "percent"`. "Contrato" → **"Validade"**.

**6) MODO ESTENDIDO (tela larga) em TODAS as telas da Diretoria** (só lá):
`src/components/diretoria/modo-estendido.tsx` (`ModoEstendidoProvider` no
`diretoria/layout.tsx` + localStorage; `DiretoriaShell` substitui `PageShell wide`;
`BotaoModoEstendido` no padrão do "Editar layout"). Ligado: `max-w-none` + margem
25px. **Animação suave via Web Animations API (FLIP no max-width)** porque
`max-width:none` não é animável por CSS (dava a piscada); blocos do grid com
`.anim-off` (transition:none no modo visualização) acompanham quadro a quadro.

Validado por E2E Playwright (usuário `render-check`): 67 pedidos, tag, dropdown,
detalhe, rentabilidade (PV-2464 Margem 16,36%), toggle custo/venda, modo estendido
(1399→2320px em 2560). tsc/eslint verdes.

### PRÓXIMA SESSÃO (retomar por aqui)
1. **Replicar comissão/margem A NÍVEL DE PRODUTO** (cada linha do dropdown e da
   tela de detalhe). Os dados já estão prontos em `raw_sped_documento_item.data`
   (`al_comissao`, `vr_comissao`, `al_margem`, `vr_liquido` por item). Mesmo padrão
   de extração jsonb na consulta `src/lib/diretoria/queries/entregas-parciais.ts`
   (carregar os raw dos itens por odooId e mapear), **sem migration**. Foi o que
   ficou combinado com o dono ("produto fica pra depois").
2. Continuar os ajustes finos do B-09 conforme o dono validar.
3. (Futuro, opcional) materializar a rentabilidade nos fatos (migration + builder
   `fato-pedido.ts`/`fato-pedido-item.ts` + rebuild worker via `docker compose
   build app`) se quiser performance/uso por outros consumidores , investigação já
   feita (relatório do agente nesta sessão).

Obs.: os PDFs em `docs/nova-implementacao-dashboards/` NÃO são desta frente (outra
atividade); deixados intactos, fora dos meus commits.

---

## Onde estamos (2026-07-21, manhã)

**Tabela avançada do B-09 (Entregas Parciais) , réplica da tabela do ERP Nexus , ENTREGUE e no ar.**

Perícia completa do código-fonte do ERP Nexus + tabela rica e genérica portada
para `src/components/tabela-avancada/`, ligada no B-09
(`src/components/diretoria/blocos/blocos-pedidos.tsx`), substituindo o DataTable
antigo. As outras 7 telas seguem no `data-table.tsx` antigo. Tudo client-side.

Recursos: busca grande + inteligente por facets; UM "Filtros e agrupar" (presets
+ filtro E/OU aninhado com busca de campo + agrupar multinível + favoritos);
agrupamento com subtotais; multi-sort; seletor de colunas (buscar + reordenar por
arraste + coluna travada) na TOOLBAR; redimensionar (drag + duplo-clique);
compacto; exportar CSV; paginação corrigida; views Lista + Kanban (por dimensão
selecionável, com busca por coluna) + Calendário (Dia/Semana/Mês); tela de
detalhe do pedido (destaque no número, campos por largura, observações em bloco,
filtro por número + navegar); persistência por tela (localStorage).

### Entregue e validado (screenshots, 0 erros de runtime, tsc/eslint verdes):
- Ondas 0-5 (portagem completa) , commits 3681614f, 0e6056bc, 735fdd81.
- 6 ajustes do dono , 643c9e88 (altura grid até 12, fonte cabeçalho, seletor de
  colunas na toolbar) e 18594c0d (calendário Dia/Semana/Mês, kanban por dimensão,
  detalhe do pedido).
- Calibração (2a rodada) , fd660b74 (calendário: "Sem registro" nos dias vazios,
  tela de dia vazio, range com hífen, cabeçalho reorganizado período-central +
  seletor à direita + "Hoje" removido; DETALHE redesenhado com número em
  destaque, campos por detalheSpan, filtro por número do pedido).

## Docs de referência
- Perícia + decisões: `docs/superpowers/research/2026-07-20-pericia-tabela-erp-nexus-replicar-b09.md`
- PROGRESSO detalhado: `docs/superpowers/plans/2026-07-21-PROGRESSO-tabela-avancada-b09.md`
- Histórico: `docs/agents/HISTORY.md` (linhas de 2026-07-20 e 2026-07-21).

## PRÓXIMA AÇÃO
Aguardando o dono avaliar no browser e (a) pedir novos ajustes finos , aplicar
inline (UI + ui-ux-pro-max) + screenshot de validação (usuário render:
`render-check@local.test` / `Teste@12345`; script playwright com
`channel:"chrome"`, playwright já instalado via `--no-save`); ou (b) autorizar o
MERGE para produção. **Nada vai para produção sem "sim" explícito do dono.**

## Regras vivas
- Commit na pasta principal fora da main exige `GIT_AGENTE_BYPASS=1` (todas as
  fases desta branch foram commitadas assim).
- Proibido travessão em qualquer texto. UI sempre inline + `ui-ux-pro-max`.
- Metodologia ágil (D0): planner -> 1 review -> planner v2 -> implementação -> perícia.
