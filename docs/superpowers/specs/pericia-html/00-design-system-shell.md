# Perícia HTML , Módulo 00: Design System + Shell + Navegação + Filtros de Período + Tema

> Fonte periciada: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Arquivo monolítico, 18.971 linhas, ~1MB. CSS/JS vanilla. Único recurso externo: Google Fonts (Inter + Space Grotesk). Sem libs.
> Título da aba: `Icaro Group — Portal` (linha 6). Marca exibida na sidebar: **"Icaro Group"** (linha 6003).
> Todas as referências de linha abaixo são do arquivo acima.

---

## 1. DESIGN SYSTEM (bloco `<style>`, começa na linha 8)

### 1.1 CSS Custom Properties , Tema ESCURO (padrão), `:root` (linhas 9-16)

Dark-first. Estética "luxo": fundo quase preto, acento dourado, 4 tons de superfície.

| Token | Valor | Papel |
|---|---|---|
| `--gold` | `#C8A96E` | Acento primário (dourado) |
| `--gold2` | `#B89858` | Dourado escuro (gradientes, hover) |
| `--gold3` | `#E8D5A8` | Dourado claro (hover de botões) |
| `--gold-bg` | `rgba(200,169,110,.09)` | Fundo translúcido do acento (estado ativo) |
| `--bg` | `#0A0A10` | Fundo da aplicação (quase preto, leve azulado) |
| `--s1` | `#101018` | Superfície 1 (sidebar, topbar, auth-card) |
| `--s2` | `#15151F` | Superfície 2 (modais, cards, dropdown) |
| `--s3` | `#1B1B27` | Superfície 3 (inputs, botões secundários, hover) |
| `--s4` | `#222230` | Superfície 4 (hover mais forte) |
| `--bd` | `#23232f` | Borda padrão |
| `--bd2` | `#2E2E40` | Borda destacada (modais, dropdown, tooltips) |
| `--tx` | `#E4E4F0` | Texto primário |
| `--tx2` | `#8E8EA8` | Texto secundário |
| `--tx3` | `#4A4A60` | Texto terciário / placeholder / muted |
| `--white` | `#FFFFFF` | Texto de máximo contraste (títulos) |
| `--green` | `#3ECF8E` | Semântico: sucesso/positivo |
| `--red` | `#E05555` | Semântico: erro/perigo |
| `--blue` | `#5B8DEF` | Semântico: info |
| `--purple` | `#9B72CF` | Semântico: admin (avatar/pill admin) |
| `--r` | `12px` | Raio base (pouco usado; a maioria dos raios é literal) |

### 1.2 CSS Custom Properties , Tema CLARO `body.theme-light` (linhas 18-22)

Sobrescreve só as variáveis de superfície/texto (mantém os tokens de acento e semânticos):

| Token | Valor claro |
|---|---|
| `--bg` | `#F3F4F6` |
| `--s1` | `#FFFFFF` |
| `--s2` | `#F8F9FC` |
| `--s3` | `#ECEFF5` |
| `--s4` | `#E1E5EE` |
| `--bd` | `#D7DCE6` |
| `--bd2` | `#C4CBD8` |
| `--tx` | `#1B1E2A` |
| `--tx2` | `#5F6675` |
| `--tx3` | `#8B94A3` |
| `--white` | `#111827` (no claro, "white" vira quase-preto = texto de título) |

No tema claro, vários containers ganham sombra suave (linhas 23-33):
`.auth-card, .admin-section, .cal-a1, .cal-a2, .cc-section, .welcome-bar, .sidebar, .topbar, .modal` recebem `box-shadow:0 18px 50px rgba(15,23,42,.08)`.

### 1.3 Paleta alternativa , Cinza/Prata `body.palette-silver` (linhas 34-40)

Substitui apenas os tons de acento (transforma o dourado em prata/cinza):

| Token | Valor prata |
|---|---|
| `--gold` | `#B9BDC7` |
| `--gold2` | `#8F96A3` |
| `--gold3` | `#E4E7EC` |
| `--gold-bg` | `rgba(185,189,199,.14)` |

Os "dots" de logo ganham glow prata: `box-shadow:0 0 12px rgba(185,189,199,.55)` (linhas 37-39).

> **Matriz de tema:** 2 eixos independentes e combináveis , Modo (`dark` | `light` via classe `theme-light`) × Paleta de acento (`gold` | `silver` via classe `palette-silver`). 4 combinações possíveis.

### 1.4 Tipografia

- Import (linha 7): `Inter` pesos `300;400;500;600;700` + `Space Grotesk` pesos `400;500;600;700;800`.
- **Inter** (`font-family:'Inter',sans-serif`): fonte de corpo. Definida no `body` (linha 56, `font-size:13px`, `-webkit-font-smoothing:antialiased`). Usada em inputs, botões de filtro, texto geral, pills, tabs.
- **Space Grotesk** (`font-family:'Space Grotesk',sans-serif`): fonte de display/títulos e elementos "de marca". Usada em: logo da sidebar (14.5px/800), logo do auth (21px/800), avatares, `.tb-title` (15px/700), `.modal-title` (16px/700), títulos de cards, valores grandes (ex.: `.sales-period-value` 34px/900), botões de papel, pills de cargo.
- Escala de tamanhos observada (px): 8.5, 9, 9.5, 10, 10.5, 11, 11.2, 11.5, 12, 12.5, 13 (base), 14.5, 15, 16, 21, 34.
- Pesos usados: 300, 400, 500, 600, 700, 800, 900 (o 900 aparece em rótulos uppercase de filtros/KPIs, ainda que o import vá só até 800 , o navegador faz fallback para o mais pesado).
- Padrões de rótulo: `text-transform:uppercase` + `letter-spacing` (de `.5px` a `2px`) + peso alto é o tratamento recorrente de "label/eyebrow".

### 1.5 Espaçamento, raio, sombras, blur, gradientes

- **Espaçamento:** sem escala em tokens; valores literais em px. Gaps comuns: 6, 7, 8, 9, 10, 11, 12, 14, 18, 24. Paddings de container: 14-26px.
- **Border-radius (literais):** 6, 7, 8, 9 (inputs/botões), 10, 11, 12 (`--r`, cards), 14 (cards de filtro), 16 (modal), 18 (auth-card), 20 (pills), 999px / 50% (pills totalmente arredondadas e avatares).
- **Sombras (box-shadow) , catálogo:**
  - Modal: `0 28px 90px rgba(0,0,0,.65)` (linha 492)
  - Auth-card: `0 32px 100px rgba(0,0,0,.55)` (linha 73)
  - User-dropdown: `0 10px 40px rgba(0,0,0,.6)` (linha 137)
  - Auth-tab ativa: `0 1px 5px rgba(0,0,0,.45)` (linha 83)
  - Auth-btn hover: `0 6px 20px rgba(200,169,110,.25)` + `translateY(-1px)` (linha 93)
  - Glow do dot do logo: `0 0 12px rgba(200,169,110,.5)` (linha 75)
  - Sombras inset/foco-ring: `inset 0 0 0 1px rgba(200,169,110,.25/.35)`, `0 0 0 2px rgba(200,169,110,.06)` (linhas 201, 224, 542, 569)
  - Tooltip de mapa: `0 16px 40px rgba(0,0,0,.38)` (linha 5304)
- **Blur / glassmorphism (`backdrop-filter`):**
  - `.modal-bg`: `blur(5px)` + fundo `rgba(0,0,0,.72)` (linha 483)
  - `.demand-b8-modal-bg`: `blur(5px)` + `rgba(0,0,0,.58)` (linha 5581)
  - `.map-overlay` (loader): `blur(3px)` + `rgba(10,10,16,.82)` (linha 452)
  - `#modal-stock-ideal`: `blur(8px)` (linha 1804)
  - Chips/cards com vidro: `blur(10px)` (ex.: linha 4879)
- **Gradientes recorrentes:**
  - Avatares e logos: `linear-gradient(135deg,var(--gold),var(--gold2))`; variante admin `linear-gradient(135deg,var(--purple),#6B4FA0)` (linhas 131-132, 172-173)
  - Barra de acento vertical: `linear-gradient(180deg,var(--gold),var(--gold2))` (ex.: `.sales-period-hero::before`, linha 4704)
  - Linha decorativa no topo do welcome-bar: `linear-gradient(90deg,var(--gold),transparent)` (linha 171)
  - Glows de fundo do auth (radiais): `radial-gradient(circle,rgba(200,169,110,.05)...)` e `...rgba(91,141,239,.035)...` (linhas 62-63)
  - "Setinha" custom de selects via dois `linear-gradient(45deg/135deg)` desenhando o caret (ex.: `.demand-b8-period`, linha 5520)
- **Reset global (linha 54):** `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}`; `html,body{height:100%;overflow:hidden}` (linha 55). App é full-viewport sem scroll de página (scroll é interno aos módulos).

---

## 2. ANIMAÇÕES E TRANSIÇÕES

### 2.1 @keyframes , existe APENAS 1

- `@keyframes spin{to{transform:rotate(360deg)}}` (linha 455). É o spinner de loading (usado no `.map-overlay` e estados de carregamento). **Não há nenhum outro `@keyframes` no arquivo inteiro.**

### 2.2 Transições (não há tokens; tudo inline por componente)

Durações observadas: `.12s`, `.15s`, `.16s`, `.2s`, `.25s`. Easing: padrão (`ease`) na esmagadora maioria; a única curva custom é a da sidebar.

- **Sidebar (expandir/recolher):** `transition:width .25s cubic-bezier(.4,0,.2,1)` (linha 103). Elementos internos animam `opacity .15s/.2s` (logo, labels, user-info) para fade ao expandir.
- **`.nav-item`:** `transition:all .15s` (linha 115); hover muda `background`/`color`.
- **`#settings-arrow`:** `transition:transform .15s` + `.open{transform:rotate(90deg)}` (linhas 126-127) , seta do submenu Ajustes.
- **Botões/inputs em geral:** `transition:all .12s/.15s/.2s`.
- **`.sales-c1` (card-botão de período):** `transition:border-color .16s,transform .16s,background .16s` (linha 4701).
- **Hover/active/focus padrão:**
  - Hover de `.nav-item`: `background:var(--s3);color:var(--tx)`; ativo: `background:var(--gold-bg);color:var(--gold)` + barra lateral `::before` dourada (linhas 117-119).
  - Hover de inputs/`.ef-input:focus`: `border-color:var(--gold)` (linha 515).
  - Hover de botões primários: `background:var(--gold3)` (linhas 153, 522).
  - `:focus-within` em caixas de busca: borda dourada + focus-ring `0 0 0 2px rgba(200,169,110,.06)` (linhas 224, 569).
  - Auth-btn hover: lift `translateY(-1px)` + sombra dourada (linha 93).

**Resumo de animações: 1 `@keyframes` (`spin`) + transições CSS inline por componente (5 durações distintas, 1 curva cubic-bezier).** Sem bibliotecas de animação, sem AOS, sem Framer.

---

## 3. SHELL DA APLICAÇÃO

### 3.1 Dois "screens" de topo (linhas 5932, 5997)

- `#scr-auth` (`class="screen active"`, linha 5932): tela de login/registro. Tem glows radiais decorativos (`::before`/`::after`).
- `#scr-app` (`class="screen"`, linha 5997): o app autenticado. CSS: `.screen{display:none}` / `.screen.active{display:flex}` (linhas 57-58). Troca via classe `active` nas funções de login/logout (`doLogout`, linhas 8180-8187).

### 3.2 Sidebar (`<aside class="sidebar" id="sidebar">`, linha 5998)

- **Comportamento:** colapsada por padrão `width:60px`; expandida `224px` via classe `.expanded` (linhas 103-104). Transição suave (cubic-bezier). Toggle pelo hambúrguer: `toggleSidebar()` = `classList.toggle('expanded')` (linha 8190). Ao expandir, logo/labels/seções/user-info fazem fade-in (opacity).
- **`.sidebar-top` (linha 5999):** botão hambúrguer (SVG 3 linhas) + logo `.sidebar-logo` ("● Icaro Group", dot dourado).
- **`.sidebar-nav` (linha 6005):** scrollbar oculta (`::-webkit-scrollbar{width:0}`).
  - Seção **"Principal"** (`.nav-section`, linha 6006):
    1. `nav-home` , **Início** (ícone casa) , `navTo('home')` , visível
    2. `nav-estoque` , **Estoque** (ícone caixa/cubo) , `navTo('estoque')` , `display:none` até ter permissão
    3. `nav-demandas` , **Demandas** (ícone checklist) , `navTo('demandas')` , oculto até permissão
    4. `nav-vendas` , **Vendas** (ícone gráfico de linha) , `navTo('vendas')` , oculto até permissão
  - Seção **"Menu"** (`#nav-settings-section`, oculta até permissão admin, linha 6024):
    5. `nav-settings` , **Ajustes** (ícone engrenagem) , `toggleSettingsMenu()` , abre submenu, tem seta `#settings-arrow` (›) que rotaciona 90°
    - Submenu `#settings-submenu` (linha 6030):
      - `nav-admin` , **Painel de Usuários** (ícone pessoas) , `navTo('admin')`
      - `nav-tela` , **Tela** (ícone monitor) , `navTo('tela')` , é a tela de aparência/tema
      - `nav-odoo` , **Odoo API** (ícone tabela) , `navTo('odoo')`
- **`.sidebar-user` (linha 6046):** avatar (`#uav`, gradiente dourado; variante admin roxa) + nome (`#uname`) + cargo (`#urole`). Clique abre `.user-dropdown` (`#udd`) que tem só um item: **"Sair do portal"** (`.ud-item.danger` → `doLogout()`). Fecha ao clicar fora (listener global, linha 8189).
- **Ícones:** todos SVG inline (stroke `currentColor`, 17×17, viewBox 24, stroke-width 2), estilo "Feather/Lucide".

### 3.3 Header / Topbar

- Há CSS de topbar (`.topbar` linha 143: `height:58px`, fundo `--s1`, borda inferior; `.tb-title` 15px Space Grotesk; `.tb-btn` / `.tb-btn.primary`). Existe a const JS `TITLES` mapeando módulo → título (linha 8192). **Porém o `#scr-app` NÃO renderiza uma topbar global no DOM**; cada módulo cuida do próprio cabeçalho interno (ex.: a tela de Vendas tem `.sales-topbar` na linha 6824 com o controle de período centralizado). Ou seja, o layout efetivo é **sidebar + área de conteúdo (`.app-content`, linha 6060)**, sem barra superior única. As classes `.topbar/.tb-*` são vestígios reutilizáveis.

### 3.4 FAB (botão flutuante)

- **NÃO EXISTE FAB.** Grep por `class="fab"`, `.fab{`, `floating`, `snackbar` retornou 0 ocorrências de UI. As ações de adicionar (ex.: evento, colaborador) são botões inline dentro dos módulos (`.a2-add-btn`, `#cc-add-btn`), controlados por permissão em `applyDrawerAccess()` (linhas 8168-8169).

### 3.5 Toggle de tema (tela "Tela" = `#mod-tela`, linha 7236)

Não é um switch no header; é uma tela de configuração com dois cards (`.screen-card`, linhas 7243-7259):

- **Card "Modo de exibição":** botões `#screen-mode-dark` ("Escuro" → `setAppearanceMode('dark')`) e `#screen-mode-light` ("Claro" → `setAppearanceMode('light')`).
- **Card "Paleta de cores":** botões `#screen-palette-gold` ("Dourado" → `setAccentPalette('gold')`) e `#screen-palette-silver` ("Cinza/Prata" → `setAccentPalette('silver')`).

Lógica (linhas 7777-7811):
- `getAppearanceSettings()` lê `localStorage[DB_APPEARANCE]`, default `{mode:'dark',palette:'gold'}`.
- `saveAppearanceSettings(cfg)` persiste em JSON.
- `applyAppearanceSettings()` aplica classes no `body`: `theme-light` se `mode==='light'`; `palette-silver` se `palette==='silver'`; depois chama `updateAppearanceButtons`.
- `updateAppearanceButtons(cfg)` marca `.active` no botão correspondente de cada card (helper `set(id,on)`).
- `setAppearanceMode(mode)` / `setAccentPalette(palette)` mutam o cfg, salvam e reaplicam.
- `navTo('tela')` chama `updateAppearanceButtons()` ao entrar na tela (linha 8211).

### 3.6 Responsividade

- Quebras pontuais via `@media`. Ex.: `@media(max-width:850px){.screen-card-grid{grid-template-columns:1fr}}` (linha 52); `@media(max-width:760px)` reorganiza filtros/headers de Demandas e o grid de presets (linha 5601). Não há um sistema de breakpoints unificado; cada bloco define o seu (`760px`, `850px` recorrentes). Sidebar não vira drawer mobile , permanece colapsável.

---

## 4. NAVEGAÇÃO

### 4.1 Mecanismo

Troca de módulo por **CSS show/hide**, não por router. Cada tela é um `<div class="module" id="mod-XXX">`; `.module{display:none}` / `.module.active{display:flex}` (linhas 154-155).

`navTo(mod)` (linhas 8193-8213):
1. Checa `hasPerm(mod)`; se negado, cai para o primeiro módulo permitido (`DRAWER_KEYS.find`) ou `alert('Acesso negado.')`.
2. Remove `.active` de todos `.nav-item` e marca o `#nav-<mod>`.
3. Se for `admin`/`tela`/`odoo`, também ativa o item "Ajustes" e abre o submenu (`toggleSettingsMenu(true)`).
4. Remove `.active` de todos `.module` e ativa `#mod-<mod>`.
5. Hooks de render por módulo: `admin`→`adminRefresh()`; `demandas`→`renderDemandasDashboard()`; `vendas`→`renderSalesDashboard()`; `tela`→`updateAppearanceButtons()`; `odoo`→`initOdooSettings()`.

Mapa de títulos: `TITLES={home:'Início',estoque:'Estoque',demandas:'Demandas',vendas:'Vendas',admin:'Painel de Usuários',tela:'Tela',odoo:'Odoo API'}` (linha 8192).

Login define o módulo inicial (linha 8153): primeiro permitido na ordem home→estoque→demandas→vendas→admin→home.

### 4.2 Inventário de telas/abas (hierarquia)

```
#scr-auth (login/registro)          [screen de topo]
#scr-app  (aplicação)               [screen de topo]
 ├─ Sidebar › Principal
 │   ├─ #mod-home      "Início"              (navTo('home'))
 │   ├─ #mod-estoque   "Estoque"            (navTo('estoque'))
 │   ├─ #mod-demandas  "Demandas"           (navTo('demandas'))
 │   └─ #mod-vendas    "Vendas"             (navTo('vendas'))
 ├─ Sidebar › Menu (Ajustes ▸ submenu, admin-only)
 │   ├─ #mod-admin     "Painel de Usuários" (navTo('admin'))
 │   ├─ #mod-tela      "Tela" (aparência)   (navTo('tela'))
 │   └─ #mod-odoo      "Odoo API"           (navTo('odoo'))
 └─ #mod-mapa  (linha 6760)  — módulo presente no DOM, SEM item de menu
```

> **Achado:** `#mod-mapa` (linha 6760) existe como módulo mas **não tem botão de navegação** na sidebar e não está no `TITLES`. É um módulo de mapa órfão/legado (provavelmente acessado embutido ou descontinuado). Reconstruir com atenção: confirmar se deve ser exposto ou removido.

Permissões controlam visibilidade dos itens via `applyDrawerAccess()` (linhas 8155-8170) , cada `nav-*` começa `display:none` e é revelado por `hasPerm()`.

---

## 5. FILTROS DE PERÍODO

> **Importante:** não existe um seletor de período "global" único no shell. Há **três seletores de período independentes, cada um escopado a uma tela**. O mais completo (e o que mais se parece com "filtro global de período") é o da tela **Vendas**.

### 5.1 Período de VENDAS (`#mod-vendas`) , o principal

- Gatilho na `.sales-topbar` (linha 6824). Chip `#sales-period-value` mostra o rótulo atual (default **"Últimos 30 dias"**, linha 6830).
- Abre `openSalesPeriodModal()` (linha 16093) → modal `#modal-sales-period` (linhas 7097-7175).
- Estado global JS: `SALES_PERIOD={mode,start,end,label}` (linha 16060), persistido (`saveSalesPeriod`/`loadSalesPeriod`) e reaplicado a todos os quadros C2, C3... (texto do modal, linha 7102). Ao aplicar, chama `renderSalesDashboard()`.
- **Cinco abas de modo** (`.sales-period-tab`, linhas 7108-7112): **Dias, Meses, Anos, Trimestres, Semestres** (`setSalesPeriodMode`).
- **PRESETS EXATOS por aba** (`salesQuickPeriod(kind)`, linhas 16117-16131):

| Aba | Preset (label exato) | `kind` | Cálculo |
|---|---|---|---|
| **Dias** | **Hoje** | `today` | hoje→hoje |
| **Dias** | **Últimos 7 dias** | `last7` | hoje-6 → hoje |
| **Dias** | **Últimos 30 dias** | `last30` | hoje-29 → hoje |
| **Dias** | **Últimos 90 dias** | `last90` | hoje-89 → hoje |
| **Meses** | **Mês atual** | `currentMonth` | 1º→último dia do mês |
| **Meses** | **Mês anterior** | `lastMonth` | mês -1 |
| **Meses** | **Últimos 6 meses** | `last6Months` | mês-5 → fim do mês atual |
| **Anos** | **Ano atual** | `currentYear` | 01/01→31/12 |
| **Anos** | **Ano anterior** | `lastYear` | ano -1 |
| **Trimestres** | (sem preset; só custom) | , | selects 1º-4º trimestre + ano inicial/final |
| **Semestres** | (sem preset; só custom) | , | selects 1º/2º semestre + ano inicial/final |

- **Período personalizado por aba** (inputs nativos): Dias = `<input type="date">` inicial/final; Meses = `<input type="month">`; Anos = `<input type="number">` (2000-2100); Trimestres/Semestres = ano(s) + `<select>` de trimestre/semestre. `applySalesPeriodFromModal()` (linha 16137) valida (inicial ≤ final) e monta o label (ex.: "T2/2025 até T4/2025", "S1/2024 até S2/2024", "Ano 2025").
- Ações do modal: **Cancelar** (`closeSalesPeriodModal`) e **Aplicar período** (`applySalesPeriodFromModal`) (linhas 7170-7171).

### 5.2 Período de COMPARAÇÃO de Vendas (`#modal-sales-compare`, linhas 7062-7095)

Modal auxiliar para preencher quadros comparativos (Estado + Período). `<select>` de período com 9 opções (linhas 7079-7087): **Período atual do C1** (`current`), **Hoje**, **Últimos 7 dias**, **Últimos 30 dias**, **Últimos 90 dias**, **Mês atual**, **Mês anterior**, **Ano atual**, **Ano anterior**. Aplicar: `applySalesCompareModal()`.

### 5.3 Período de DEMANDAS (`#mod-demandas`, bloco B8)

- Botão `#demand-b8-period-btn` (linha 6721, label inicial **"Todos os períodos"**) → `openDemandB8PeriodModal()` (linha 15253) → modal `.demand-b8-modal-bg#demand-b8-period-modal` (linha 15157).
- Estado: `DEMAND_B8_PERIOD` (default `'all'`, linha 15041). Presets (linhas 15063-15064, lógica 15074-15075): **Todos os períodos** (`all`), **Últimos 30 dias da base** (`base_30`), **Últimos 90 dias da base** (`base_90`). "Da base" = ancorado na data máxima dos dados, não em hoje. Grid de presets `.demand-b8-preset-grid` (3 colunas) + caixa de período personalizado (`.demand-b8-custom-box`).

### 5.4 Month picker / calendário (`#mod-home`)

- `openMonthPicker()` (linha 8798) e `calToday()` (botão "Hoje", linha 6080) pertencem ao **calendário da Home** , navegação de mês do calendário, não um filtro de período de relatórios.

### 5.5 Como o período afeta as telas

Cada seletor mantém seu estado em variável JS própria + localStorage e dispara o re-render do dashboard daquela tela (`renderSalesDashboard`, `renderDemandB8Chart`/`renderDemandasDashboard`). **Não há propagação cross-tela** , mudar o período de Vendas não altera Demandas e vice-versa.

---

## 6. UTILITÁRIOS VISUAIS COMPARTILHADOS

### 6.1 Modais (sistema único)

- Estrutura: wrapper `.modal-bg` (overlay fixed, `rgba(0,0,0,.72)` + `backdrop-filter:blur(5px)`, z-index 800; linha 483) contendo `.modal` (fundo `--s2`, borda `--bd2`, radius 16px, padding 26px, sombra `0 28px 90px rgba(0,0,0,.65)`; linha 492).
- Abrir/fechar genérico: `openModal(id)` = adiciona `.open`; `closeModal(id)` = remove `.open` (linhas 8214-8215). `.modal-bg.open{display:flex}` (linha 484).
- Fechar ao clicar no backdrop: listener global em todos `.modal-bg` (linha 8216).
- `.modal-title` (Space Grotesk 16px/700) e `.modal-close` (✕ no canto, hover muda fundo) (linhas 493-495).
- Inputs de formulário padronizados: `.ef-input`/`.ef-select` (fundo `--s3`, foco borda dourada) e botão `.ef-btn` (dourado, hover `--gold3`) (linhas 497-522).
- Variantes específicas reutilizam a base: `.sales-period-modal`, `.sales-compare-modal`, `.demand-b8-modal-bg`, `#modal-stock-ideal`, `#modal-uf-picker`.

### 6.2 Mapas (utilitário genérico)

- `buildMap()` (linha 9373) é o construtor genérico de mapa (SVG do Brasil), reusado por Estoque, Demandas (`#demand-brazil-map`) e o `#mod-mapa`. Acompanha `.map-overlay` (loader com spinner), `.map-tt`/`.demand-map-tooltip` (tooltips flutuantes), `.map-legend-bar` (gradiente da legenda), `.map-badge` (badge dourado).

### 6.3 Tooltips

- Genérico de mapa: `.map-tt` (`position:fixed`, fundo `--s2`, borda `--bd2`) (linha 456) e `.demand-map-tooltip` (com `transition:opacity .12s`, posicionado via transform off-screen quando oculto) (linhas 5304-5307).

### 6.4 Badges e Pills

- **Pills de cargo/usuário:** `.welcome-role-pill` (gold-bg) + variante `.admin-pill` (roxa); `.pill-admin`/`.pill-user` (linhas 178-179, 355-357).
- **Pills de tipo de evento (calendário/agenda):** `.day-evt-pill` + `.pill-reuniao` (azul `#8FB5F5`), `.pill-prazo` (vermelho `#EE9090`), `.pill-entrega` (verde `#6FE0B0`), `.pill-interno` (dourado) (linhas 272-276).
- **Pills de tipo de demanda:** `.pill-inventario` (verde), `.pill-prospeccao` (azul), `.pill-carregamento` (vermelho), `.pill-organizacao_estoque` (dourado), `.pill-assembleia` (roxo `#C6A8F0`) (linhas 294-298).
- **Pills de status de demanda:** `.demand-detail-pill` + `.late` (vermelho), `.open` (amarelo `#F6C453`) (linhas 5401-5404).
- **Badges:** `.a2-count-badge` (contador cinza), `.event-detail-pill` (pill uppercase dourada), `.map-badge` (badge dourado em fundo dourado→texto `#0A0A10`) (linhas 245, 260, 428).
- Padrão visual de pill: `border-radius:999px` ou `~10-20px`, uppercase, peso 700-900, fundo translúcido `rgba(cor,.08-.14)` + texto na cor cheia.

### 6.5 Toasts / Notificações

- **NÃO EXISTEM.** Sem sistema de toast/snackbar. Feedback ao usuário é via `alert()` nativo (ex.: "Acesso negado." em `navTo`, "Preencha o período..." em `applySalesPeriodFromModal`) e via mensagens inline nos próprios módulos (ex.: `showErr`/`hideErr` no auth, `showOdooResult` na tela Odoo).

### 6.6 Avatares

- `.avatar` (30×30, círculo, gradiente dourado, iniciais em Space Grotesk; variante `.admin-av` roxa) e `.welcome-avatar` (44×44, radius 12) (linhas 131-132, 172-173).

---

## 7. NOTAS PARA A RECONSTRUÇÃO (Next.js/React/Tailwind)

- **Tokens → CSS vars / Tailwind theme:** portar as 19 vars do `:root` + os 3 overrides (`theme-light`, `palette-silver`) como `data-theme`/`data-palette` ou classes no `<html>/<body>`. Os 2 eixos (modo × paleta) são ortogonais.
- **Tema:** replicar persistência em `localStorage` (chave do `DB_APPEARANCE`), default `{mode:'dark',palette:'gold'}`. Reconstituir a tela "Tela" com os 2 cards (4 botões).
- **Navegação:** virar rotas reais (App Router) ou estado de aba; preservar gating por permissão (`hasPerm`) e os hooks de render por módulo.
- **`#mod-mapa` órfão:** decidir destino (expor ou descartar).
- **Período de Vendas:** componente de modal com 5 abas e os 9 presets exatos da tabela §5.1 + custom por tipo; estado persistido; afeta só a tela Vendas.
- **Sem FAB e sem toasts no original:** se forem desejados na reconstrução, são adição nova (não "perda" do protótipo). Substituir os `alert()` por um sistema de toast é melhoria recomendada, mas registrar que o original usa alert nativo.
- **Fontes:** Inter (corpo) + Space Grotesk (display/marca). Pesos até 800 no import; o CSS usa 900 (fallback).
- **Animação:** só `spin`. O resto é transição CSS , trivial de portar com `transition-*` do Tailwind.
