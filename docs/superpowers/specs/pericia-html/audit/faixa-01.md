# Auditoria adversarial , Faixa 01 (linhas 1 a 2400)

> Arquivo-fonte: `index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Faixa auditada: **linhas 1 a 2400**.
> Natureza da faixa: a faixa inteira (1 a 2400) é o bloco `<style>` (CSS). NÃO há
> corpo HTML, JS, funções nem mock nesta faixa, esses começam depois da linha 2400
> (faixas seguintes). Logo, o inventário abaixo é o CSS que prova a existência de
> cada feature/tela/componente, e a auditoria checa se a perícia 00 a 06 documenta
> esse comportamento/visual. Cruzamento via grep nos arquivos `0*.md`.
>
> Legenda: [COBERTO] documentado na perícia; [GAP] ausente ou só citado de
> passagem sem o componente/comportamento; [PARCIAL] feature citada mas faltam
> peças relevantes.

---

## 0. Tokens, tema e paletas (design system) , linhas 9 a 52

- `:root` design tokens: `--gold #C8A96E`, `--gold2/3`, `--gold-bg`, escala de
  superfícies `--bg #0A0A10`,`--s1..s4`, bordas `--bd/--bd2`, texto `--tx/2/3`,
  semânticas `--green #3ECF8E / --red #E05555 / --blue #5B8DEF / --purple #9B72CF`,
  raio `--r:12px`. Fontes Inter + Space Grotesk (linha 7). **[COBERTO]** (00).
- `body.theme-light` , tema claro completo, reescreve toda a escala + box-shadow
  específico em auth-card/admin-section/cal/cc/welcome/sidebar/topbar/modal (l.18 a 33). **[COBERTO]** (00).
- `body.palette-silver` , paleta prata alternativa (gold vira cinza), com glow
  ajustado no logo dot (l.34 a 40). **[COBERTO]** (00).
- Reset universal + `html,body{overflow:hidden}` + `.screen/.screen.active`
  (sistema de telas SPA show/hide) (l.54 a 58). **[COBERTO]** (00).

## 1. Seletor de tela/paleta do protótipo , linhas 41 a 52

- `.screen-card-grid` / `.screen-card` / `.screen-card-title/desc` / `.screen-options`
  / `.screen-option-btn` (.active) / `.palette-preview` , cards de configuração do
  protótipo (escolher tela + opções de tema/paleta), com gradiente de preview.
- `screen-card-grid` **[COBERTO]** (00); `screen-option-btn` e `palette-preview`
  **[GAP]** (não documentados, são os botões de troca de tema/paleta e o swatch de preview).

## 2. Tela de autenticação (#scr-auth) , linhas 60 a 99

- `#scr-auth` com 2 glows radiais decorativos (::before dourado, ::after azul) (l.61 a 63).
- `.role-selector` + `.role-btn` (.selected) , **seletor de perfil** antes do login
  (Funcionário vs Administrador), ícone com opacidade animada (l.65 a 72). **[GAP]**.
- `.auth-card` , cartão de login com logo dot + título "Icaro" (l.73 a 77). **[COBERTO]** (00).
- `.admin-strip` , faixa roxa de aviso "modo administrador" (display:none até selecionar
  perfil admin) (l.78 a 80). **[GAP]**.
- `.auth-tabs` / `.auth-tab` (.active) , abas Login/Cadastro (l.81 a 83). **[GAP]**.
- `.auth-form(.hidden)`, `.f-label`, `.f-wrap` com ícone, `.auth-input` (focus dourado),
  `.auth-btn` (+ `.ghost`), `.auth-err(.show)`, `.auth-divider` (l.84 a 99).
  Inputs/botões **[PARCIAL]** (estilo base citado em 00); `auth-err`, `auth-divider`,
  botão ghost **[GAP]**.

## 3. Shell do app , sidebar / topbar (#scr-app) , linhas 101 a 155

- `.sidebar` 60px colapsada / 224px `.expanded` (transição cubic-bezier), `.sidebar-top`
  com hamburger + logo dot, `.sidebar-nav`, `.nav-section`, `.nav-item` (.active com
  barra dourada ::before), `.nav-label`, `.nav-soon-tag` ("em breve" itálico),
  `.settings-submenu` + `#settings-arrow.open` (acordeão de configurações),
  `.nav-subitem` (l.103 a 127). Sidebar/expand/submenu/user-dropdown **[COBERTO]** (00);
  `nav-soon-tag` (tag "em breve") **[GAP]**.
- `.sidebar-user` + `.user-row` + `.avatar`(.admin-av roxo) + `.user-info`/`.uname`/`.urole`
  + `.user-dropdown`(.open) + `.ud-item`(.danger) (l.128 a 141). **[COBERTO]** (00).
- `.app-content` + `.topbar` (.tb-title/tb-sep/tb-welcome/tb-role/tb-actions/tb-btn(.primary))
  (l.142 a 153). `welcome-role-pill`/topbar **[PARCIAL]**: `tb-welcome` (saudação
  dinâmica) **[GAP]**.
- `.module` / `.module.active` , sistema de troca de módulos (l.154 a 155). **[COBERTO]** (00).

## 4. Home , grid de tela cheia (#mod-home) , linhas 157 a 329

- `.home-container` grid 2col x 3rows com áreas `welcome / a1 / a2 / a3` (l.159 a 168). **[PARCIAL]**.
- `.welcome-bar` (barra de boas-vindas com avatar, título com span dourado, sub
  capitalize, `.welcome-role-pill` + `.admin-pill`) (l.170 a 179). `welcome-role-pill`
  **[COBERTO]** (00); `welcome-bar` em si **[GAP]**.
- **A1 , calendário mensal** `.cal-a1`: header com `.cal-month-btn` (abre month picker),
  `.cal-nav-btn`, `.cal-today-btn`, `.cal-dow-row`/`.cal-dow`, `.cal-grid`(.scroll),
  `.cal-cell`(.selected/.other-month/.today), `.cal-day-num`, `.cal-evt-mini` por tipo
  (reuniao/prazo/entrega/interno), `.cal-more-tag`, `.cal-mlabel` (l.181 a 211). **[COBERTO]** (05, 00).
- **A2 , agenda do dia** `.cal-a2`: header com daynum, add-btn, search-box + more-btn
  (filtro avançado), `.adv-filter-*` (grid de filtro avançado custom), `.a2-count`,
  `.a2-filters`/`.a2-fchip` (chips por tipo), `.a2-body`, `.a2-empty`, `.day-event`
  (por tipo, com time/title/desc/foot/pill/del), `.event-detail-*` (cards de detalhe
  do evento) (l.213 a 309). **[COBERTO]** (05).
- Tipos de evento atualizados (l.278 a 298): `inventario / prospeccao / carregamento /
  organizacao_estoque / assembleia` , cal-evt-mini, fchip, day-event border, pill.
  **[COBERTO]** (05, 00).
- Delete de evento com warning (`.event-delete-warning/title/actions` danger/cancel)
  (l.300 a 309). **[COBERTO]** (05).
- **A3 , central de arquivos** `.cc-section`: header com add-btn, `.cc-body` (scroll
  horizontal), `.cc-empty`, `.cc-file` (icon/name/meta/del on hover) (l.311 a 329).
  `cc-section`/`cc-file` citados (00/06) mas a feature "central de arquivos" da home
  **[PARCIAL]** (rótulo e comportamento de upload/exclusão não documentados).

## 5. Admin / gestão de usuários (#mod-admin) , linhas 331 a 359

- `.admin-tabs`/`.admin-tab`(.active) , navegação por abas do módulo admin (l.333 a 336). **[GAP]**.
- `.admin-pane`(.active) , panes de conteúdo (l.337 a 338). **[GAP]**.
- `.perm-check`(.on/.locked check ✓) , checkbox de permissão da matriz (l.339 a 343). **[COBERTO]** (06).
- `.level-select` , dropdown de nível de acesso por linha (l.344 a 345). **[GAP]**.
- `.admin-container`/`.admin-section`/`.admin-section-header/title` (l.346 a 349). **[PARCIAL]**.
- `.admin-table` (thead/tbody/hover), `.admin-pill`(.pill-admin/.pill-user badges de
  papel), `.admin-action-btn` (excluir, hover vermelho) , **tabela de listagem de
  usuários** (l.350 a 359). **[GAP]** (a matriz de permissões está em 06, mas a tabela
  de usuários com badges de papel e ação de excluir não está documentada).

## 6. Estoque (#mod-estoque) , linhas 362 a 408 + overrides v46 a v79 (599 a 2399)

CSS-base + ~30 camadas versionadas que revelam a evolução do layout do módulo Estoque.

- Base `.stock-container` grid, `.stock-card`/header/title/body, `.stock-search-*`
  (busca de modelo), `.stock-combined-body`, `.stock-total-block/value/label/sub`
  (KPI estoque geral), `.stock-locations-*` + `.stock-location-row` (percent + value
  por local, 5 colunas) (l.362 a 408). **[COBERTO]** (01).
- `.stock-a3` tabela pivô (sticky header/first-col, `.stock-qty`(.zero)) (l.393 a 404). **[COBERTO]** (01).
- **Mapa do Brasil do estoque** `#stock-brazil-map` (path.stock-state hover dourado,
  text.stock-state-label) dentro de `.stock-a4`/`.stock-map-area` (l.659 a 768). **[COBERTO]** (01).
- **v58 , A3 como gráfico de barras horizontais por modelo** (`.stock-graph-wrap/row/
  name/barcol/track/fill/meta/qty/pct`) (l.1443 a 1512). **[COBERTO]** (01).
- **v66 , A2 total-block e location-row viram botões clicáveis** (.active filtra) (l.1515 a 1539). **[PARCIAL]** (01 cita gráfico, interação de clique-filtro do A2 não confirmada).
- **v67/v68/v71 , A3 multi-coluna**: colunas Modelo / barra / QTD / IDEAL / DIFF /
  SHARE com `.is-ok`(verde)/`.is-low`(vermelho), `.stock-more-btn` (menu kebab dourado)
  (l.1583 a 2089). **[COBERTO]** (01, is-ok/is-low).
- **Modal Estoque Ideal** `#modal-stock-ideal`/`.stock-ideal-*` (search, summary, list,
  item com chip is-ok/is-low, inputs, actions) , configurar estoque ideal (l.1644 a 2016).
  **[COBERTO]** (01).
- **v73 , estoque ideal TOTAL + por LOCAL no pop-up** (`.stock-ideal-fields/field-group/
  locations-grid/loc-item/loc-label/total-label/divider`) (l.2092 a 2107). **[PARCIAL]**
  (modal citado em 01; o duplo input total + por-local pode não estar detalhado).
- **v71 , A4 com 4 indicadores** `.stock-summary-grid` 2x2 / `.stock-summary-card/label/
  value/sub` (l.1544 a 1580, 2057 a 2074). **[COBERTO]** (01, stock-summary).
- **v78 , A5 e A6 (quadros independentes valores e seriais)** + **painel de seriais**:
  `.stock-serial-body`, `.stock-serial-filter-card` (select de modelo + help),
  `.stock-serial-metrics`/`.stock-serial-metric`(.model azul), `.stock-serial-value`,
  `.stock-serial-table` (3 col: modelo / serial / valor, sticky), `.stock-serial-empty`,
  `.serial-model-summary` (l.2111 a 2399). `stock-serial` **[COBERTO]** (01), mas
  `stock-a5`/`stock-a6` (split em dois quadros) **[GAP]**.
- **v79 , A1 removido** (`.stock-a1{display:none}`), A2 ampliado para 4 colunas, grid
  reorganizado A2/A3/A4/A5/A6 (l.2345 a 2399). **[GAP]** (a evolução final do layout,
  A1 removido e nova disposição A5/A6, não documentada).

## 7. Mapa interativo (#mod-mapa) , linhas 410 a 481 , [GAP MAJOR]

Módulo de tela cheia separado do estoque, NÃO documentado na perícia.

- `.mapa-filters` , barra de filtros (busca `.mf-si`, selects `.mf-sel`, botões `.mbtn`
  (.mbp/.mbg), chips `.mchip`) (l.412 a 423). **[GAP]**.
- `.mapa-wrap` grid 3 colunas: `.map-left` / `.map-center` / `.map-right` (l.424). **[GAP]**.
- `.map-left` , tabela `.maptbl` (`.td-uf` dourado, `.td-model`, `.td-client`, `.td-date`)
  com `.map-badge` (contador) e `.map-empty` (l.425 a 441). **[GAP]**.
- `.map-center` , **SVG interativo do Brasil `#bsvg`** (path.st hover dourado/brilho,
  text.sl rótulos), `.map-legend` + `.map-legend-bar` (gradiente heatmap), `.map-overlay`
  (.on) com `.map-spin` (spinner, @keyframes spin), `.map-tt` (tooltip flutuante fixo)
  (l.442 a 457). **[GAP]**.
- `.map-right` , `.mkpi` (KPI com barra dourada lateral), `.mbarchart`/`.mbar-row/uf/bg/
  fill/n` (**gráfico de barras por UF**, fill anima width .6s) (l.458 a 471). **[GAP]**.
- **Painel Odoo** `.odoo-pnl`/`.odoo-hdr`/`.odoo-dot` (roxo #875A7B), `.odoo-status` com
  `.odoo-ind`(.on verde glow/.off) (indicador de conexão ao vivo), `.odoo-inp`
  (campos de credencial) (l.472 a 481). **[GAP]** (integração/status Odoo da tela de mapa).

## 8. Modais e pickers , linhas 482 a 590

- `.modal-bg`(.open blur) + `.modal`/`.modal-title`/`.modal-close` (l.483 a 495). **[COBERTO]** (00).
- **Picker de UFs** `#modal-uf-picker` (z-index 2200, acima do modal de usuário),
  `.uf-multi`, `.uf-field-row`, `.uf-display`(.empty)/`.uf-tag`, `.uf-edit-btn`, `.uf-help`,
  `.uf-picker-grid` (4 col), `.uf-check-card`(.checked), `.uf-picker-actions`,
  `.uf-picker-tools` (selecionar todos etc) (l.486 a 514). **[COBERTO]** (06).
- Inputs/selects de modal `.ef-input/.ef-select/.ef-label/.ef-row`, `.quick-chips`/`.qchip`,
  `.ef-btn` (l.515 a 522). `quick-chips` **[COBERTO]** (05); `qchip`/ef-* **[PARCIAL]**.
- **Month picker** `.mp-year-row/.mp-year/.mp-year-btn`, `.mp-months`/`.mp-month`(.selected),
  `.mp-range-row/.mp-range-label/.mp-range-select`, `.mp-confirm` (l.523 a 535). **[COBERTO]** (05).
- **Modal Editar Usuário , guias/foto/permissões** `.edit-user-tabs`/`.edit-user-tab`(.active),
  `.edit-user-pane`(.active), `.edit-section/title`, **upload de foto** `.photo-box`/
  `.photo-preview`/`.photo-actions`/`.photo-help`/`.small-action-btn`(.danger),
  `.eu-perm-list/row/title/sub`, **toggle switch** `.eu-switch`/`.eu-slider` (l.538 a 565).
  `eu-switch`/`eu-slider` **[COBERTO]** (06); `edit-user-tabs` (guias do modal) e
  **upload de foto do usuário** (`photo-box`/`photo-preview`) **[GAP]**.
- **Picker de pessoas/colaboradores no evento** `.event-people-picker` (focus-within),
  `.event-people-chips`/`.event-person-chip`, `.event-collab-input`,
  `.event-collab-suggestions`(.open autocomplete)/`.event-collab-suggestion(-name/meta/tag)`,
  **anexos de evento** `.event-files-list`/`.event-file-chip`, `.day-evt-extra` (l.567 a 590).
  `event-collab`/`event-person-chip` **[COBERTO]** (05); `event-people-picker` e
  **anexos de arquivo no evento** (`event-files`) **[PARCIAL/GAP]**.

## 9. Responsividade , linhas 592 a 596 + media queries ao longo de todo o CSS

- `@media(max-width:1000px)` , home vira 1 coluna (esconde A2), mapa esconde
  laterais (l.592 a 596). Dezenas de breakpoints (1350/1250/1180/1150/1100/1000/900/860/
  700/640/560) nos módulos estoque/mapa/modais. **[PARCIAL]** (comportamento responsivo
  geral não é foco da perícia; registrado para completude).

---

## Resumo de GAPs (faixa 01)

GAPs / parciais relevantes encontrados (CSS prova a feature; perícia não documenta):

1. **Módulo Mapa interativo (#mod-mapa)** , tela inteira: filtros, tabela UF/modelo/
   cliente/data, SVG Brasil `#bsvg` com tooltip+overlay+spinner, KPI `mkpi`, gráfico de
   barras por UF `mbarchart`, painel Odoo (status ao vivo + credenciais). (l.410 a 481).
2. **Tela de autenticação** , seletor de perfil (Funcionário/Admin) `role-btn`, faixa
   roxa `admin-strip`, abas Login/Cadastro `auth-tabs`, `auth-divider`/`auth-err`/ghost. (l.60 a 99).
3. **Módulo Admin , tabela de usuários** `admin-tabs`/`admin-table`/`level-select`/
   `admin-action-btn`/`pill-admin/user` (a matriz `perm-check` está em 06; a listagem/
   gestão de usuários não). (l.331 a 359).
4. **Estoque A5/A6 e layout final v78/v79** , split em dois quadros (valores `a5` /
   seriais `a6`), A1 removido (`display:none`), grid de 4 colunas reorganizado. (l.2111 a 2399).
5. **Modal Editar Usuário** , guias `edit-user-tabs` e **upload de foto** do usuário
   (`photo-box`/`photo-preview`); + anexos de arquivo em evento (`event-files`) e
   "central de arquivos" da home (`cc-section`). (l.538 a 590, 311 a 329).
