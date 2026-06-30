# Perícia Forense MESTRE , Capítulo 01: FUNDAÇÃO

> Design System + Shell + Navegação + Tema + Autenticação + módulo "Tela/Aparência"
>
> Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Monolito de 18.971 linhas, ~1MB, HTML+CSS+JS vanilla. Único recurso externo: Google Fonts (Inter + Space Grotesk, linha 7). Sem nenhuma biblioteca (sem React, sem jQuery, sem framework de animação).
> Título da aba (linha 6): `Icaro Group — Portal`. `<html lang="pt-BR">` (linha 2).
> Todas as referências de linha abaixo são deste arquivo. Cada valor (hex, px, duração, texto) é transcrito do código, não inferido.

---

## 0. Sumário do capítulo

Este capítulo cobre a camada de base sobre a qual todos os módulos de negócio (Estoque, Demandas, Vendas, Painel de Usuários, Odoo) se apoiam:

1. Design System completo (tokens, tipografia, espaçamento, raios, sombras, blur, gradientes).
2. Os dois eixos de tema (modo claro/escuro x paleta dourado/prata) e o módulo "Tela".
3. Animações (`@keyframes`) e transições/estados globais.
4. Shell da aplicação (sidebar, ausência de topbar global, ausência de FAB/toast).
5. Navegação (`navTo`, gating por permissão, inventário de telas).
6. Autenticação (tela `#scr-auth`, seletor de perfil, abas, 3 formulários, estados de erro).
7. Utilitários visuais compartilhados (modais, badges/pills/chips, tooltips).

---

# PARTE A , DESIGN SYSTEM

O bloco `<style>` abre na linha 8. O design é "dark-first" com estética de luxo: fundo quase preto, acento dourado, quatro tons de superfície escalonados. Tudo é definido com CSS custom properties no `:root`, mais dois conjuntos de overrides por classe no `<body>`.

## A.1 Custom properties , tema ESCURO (padrão), `:root` (linhas 9-16)

| Token | Valor | Papel no produto |
|---|---|---|
| `--gold` | `#C8A96E` | Acento primário (dourado). Linha 10. |
| `--gold2` | `#B89858` | Dourado escuro (fim de gradiente, hover). Linha 10. |
| `--gold3` | `#E8D5A8` | Dourado claro (hover de botões primários). Linha 10. |
| `--gold-bg` | `rgba(200,169,110,.09)` | Fundo translúcido do acento (estado ativo de nav, pills). Linha 10. |
| `--bg` | `#0A0A10` | Fundo da aplicação (quase preto, leve azulado). Linha 11. |
| `--s1` | `#101018` | Superfície 1 (sidebar, topbar, auth-card). Linha 11. |
| `--s2` | `#15151F` | Superfície 2 (modais, cards, dropdown). Linha 11. |
| `--s3` | `#1B1B27` | Superfície 3 (inputs, botões secundários, hover). Linha 11. |
| `--s4` | `#222230` | Superfície 4 (hover mais forte). Linha 11. |
| `--bd` | `#23232f` | Borda padrão. Linha 12. |
| `--bd2` | `#2E2E40` | Borda destacada (modais, dropdown, tooltips). Linha 12. |
| `--tx` | `#E4E4F0` | Texto primário. Linha 13. |
| `--tx2` | `#8E8EA8` | Texto secundário. Linha 13. |
| `--tx3` | `#4A4A60` | Texto terciário / placeholder / muted. Linha 13. |
| `--white` | `#FFFFFF` | Texto de máximo contraste (títulos). Linha 13. |
| `--green` | `#3ECF8E` | Semântico: sucesso/positivo. Linha 14. |
| `--red` | `#E05555` | Semântico: erro/perigo. Linha 14. |
| `--blue` | `#5B8DEF` | Semântico: info. Linha 14. |
| `--purple` | `#9B72CF` | Semântico: admin (avatar/strip/pill admin). Linha 14. |
| `--r` | `12px` | Raio base. Pouco usado; a maioria dos raios é literal. Linha 15. |

São 19 tokens de cor + 1 de raio. Não há tokens de espaçamento nem de tipografia (esses valores são literais espalhados pelo CSS).

## A.2 Custom properties , tema CLARO `body.theme-light` (linhas 18-22)

O modo claro sobrescreve apenas as superfícies, bordas e texto (mantém os tokens de acento dourado e os semânticos):

| Token | Valor claro | Linha |
|---|---|---|
| `--bg` | `#F3F4F6` | 19 |
| `--s1` | `#FFFFFF` | 19 |
| `--s2` | `#F8F9FC` | 19 |
| `--s3` | `#ECEFF5` | 19 |
| `--s4` | `#E1E5EE` | 19 |
| `--bd` | `#D7DCE6` | 20 |
| `--bd2` | `#C4CBD8` | 20 |
| `--tx` | `#1B1E2A` | 21 |
| `--tx2` | `#5F6675` | 21 |
| `--tx3` | `#8B94A3` | 21 |
| `--white` | `#111827` | 21 (no claro, "white" vira quase-preto = cor de título) |

No tema claro, um conjunto de containers ganha sombra suave de elevação (linhas 23-33): os seletores `.auth-card, .admin-section, .cal-a1, .cal-a2, .cc-section, .welcome-bar, .sidebar, .topbar, .modal` recebem `box-shadow:0 18px 50px rgba(15,23,42,.08)`. No tema escuro esses elementos não têm essa sombra (o escuro usa borda em vez de sombra para separar planos).

## A.3 Paleta alternativa , Cinza/Prata `body.palette-silver` (linhas 34-40)

Substitui só os tons de acento, transformando o dourado em prata/cinza:

| Token | Valor prata | Linha |
|---|---|---|
| `--gold` | `#B9BDC7` | 35 |
| `--gold2` | `#8F96A3` | 35 |
| `--gold3` | `#E4E7EC` | 35 |
| `--gold-bg` | `rgba(185,189,199,.14)` | 35 |

Além disso, os "dots" de logo ganham glow prata (linhas 37-39): `body.palette-silver .auth-logo-dot, body.palette-silver .sidebar-logo-dot{box-shadow:0 0 12px rgba(185,189,199,.55)}`. Também o `.screen-option-btn.active` recebe uma borda prata específica (linha 50: `border-color:rgba(185,189,199,.55)`).

> **Matriz de tema:** dois eixos independentes e combináveis. Modo (`dark` padrão | `light` via classe `theme-light`) x Paleta de acento (`gold` padrão | `silver` via classe `palette-silver`). Quatro combinações possíveis: dark+gold (default), dark+silver, light+gold, light+silver. As classes são aplicadas no `<body>`; como os tokens são CSS vars, toda a árvore reage sem JS extra.

## A.4 Tipografia

- **Import (linha 7):** `Inter` pesos `300;400;500;600;700` + `Space Grotesk` pesos `400;500;600;700;800`, via `fonts.googleapis.com/css2` com `display=swap`.
- **Inter** (`'Inter',sans-serif`): fonte de corpo. Definida no `body` (linha 56: `font-size:13px`, `-webkit-font-smoothing:antialiased`). Usada em inputs (`.auth-input` linha 89, `font-family:Inter`), texto geral, pills, chips, botões de filtro.
- **Space Grotesk** (`'Space Grotesk',sans-serif`): fonte de display/marca. Usada em: `.screen-card-title` (linha 44, 12px/800), `.screen-option-btn` (linha 47, 11px/700), `.auth-logo-text` (linha 76, 21px/800), `.role-btn` (linha 66, 12px/600), `.auth-btn` (linha 92, 12.5px/700), `.sidebar-logo` (linha 108, 14.5px/800), `.avatar` (linha 131, 10.5px/800), `.tb-title` (linha 144, 15px/700).
- **Escala de tamanhos observada nesta camada (px):** 9 (`.nav-section` linha 113), 9.5, 10 (`.f-label` linha 86, `.urole` linha 136), 10.5 (`.avatar`), 11 (`.auth-subtitle`, `.admin-strip`, `.role-label`, `.tb-role`), 11.5 (`.auth-tab` linha 82, `.nav-soon-tag`? não; `.uname` linha 135, `.ud-item` linha 139, `.tb-btn` linha 150), 12 (`.tb-welcome` linha 146), 12.5 (`.auth-input`, `.nav-item` linha 115), 13 (base do body + `#settings-arrow` linha 126), 14.5 (logo sidebar), 15 (tb-title), 21 (logo auth).
- **Pesos:** 400, 500, 600, 700, 800 nesta camada. (No restante do arquivo aparece 900 em rótulos de KPI; o import vai só até 800, o navegador faz fallback.)
- **Padrão de rótulo/eyebrow:** `text-transform:uppercase` + `letter-spacing` (de `.5px` a `2px`) + peso 700-800. Exemplos: `.nav-section` (`letter-spacing:2px`, linha 113), `.role-label` (`1.2px`, linha 72), `.f-label` (`.6px`, linha 86), `.urole` (`.6px`, linha 136), `.screen-card-title` (`.8px`, linha 44).

## A.5 Espaçamento, raio, sombras, blur, gradientes

- **Espaçamento:** sem escala em tokens; valores literais em px. Gaps recorrentes nesta camada: 8, 9, 10, 11, 12, 13, 14, 24. Paddings de container: `.auth-card` `34px 32px` (linha 73), `.screen-card` `15px` (linha 42), `.topbar` `0 24px` (linha 143).
- **Border-radius (literais):** 7 (`.auth-tab`, `.auth-err`), 8 (`.tb-btn`), 9 (`.screen-option-btn`, `.auth-input`, `.auth-btn`, `.admin-strip`, `.auth-tabs`, `.nav-item`, `.user-row`, `.user-dropdown`, `.sidebar-hamburger`), 12 (`.screen-card`, `--r`, `.role-btn`), 14 (`.tb-role`), 18 (`.auth-card` linha 73), 50% (`.avatar` e os dots de logo).
- **Sombras (box-shadow):**
  - Auth-card: `0 32px 100px rgba(0,0,0,.55)` (linha 73).
  - Auth-tab ativa: `0 1px 5px rgba(0,0,0,.45)` (linha 83).
  - Auth-btn hover: `0 6px 20px rgba(200,169,110,.25)` + `translateY(-1px)` (linha 93).
  - User-dropdown: `0 10px 40px rgba(0,0,0,.6)` (linha 137).
  - Glow do dot de logo (auth): `0 0 12px rgba(200,169,110,.5)` (linha 75).
  - Sombra de elevação no tema claro: `0 18px 50px rgba(15,23,42,.08)` (linha 32).
- **Blur / glassmorphism:** nesta camada não há `backdrop-filter` (ele aparece nos modais, ver Parte G). O efeito de profundidade da fundação é por borda + sombra.
- **Gradientes recorrentes:**
  - Avatar dourado: `linear-gradient(135deg,var(--gold),var(--gold2))` (linha 131); variante admin `linear-gradient(135deg,var(--purple),#6B4FA0)` (linha 132).
  - Preview de paleta: `linear-gradient(90deg,var(--gold),var(--gold2))` (`.palette-preview`, linha 51).
  - Glows radiais decorativos do fundo de auth: `radial-gradient(circle,rgba(200,169,110,.05) 0%,transparent 60%)` (linha 62) e `radial-gradient(circle,rgba(91,141,239,.035) 0%,transparent 60%)` (linha 63).
- **Reset global (linha 54):** `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}`.
- **Viewport travado (linha 55):** `html,body{height:100%;overflow:hidden}`. O app é full-viewport sem scroll de página; o scroll é interno a cada módulo. `body` em si (linha 56): `background:var(--bg)`, `color:var(--tx)`, `font-size:13px`.

## A.6 Sistema de "screens" (SPA show/hide), linhas 57-58

- `.screen{display:none;width:100%;height:100%}` (linha 57).
- `.screen.active{display:flex}` (linha 58).

Apenas um dos dois screens de topo fica visível por vez (auth vs app). A troca é feita adicionando/removendo a classe `active` (ver Partes E e F).

---

# PARTE B , ANIMAÇÕES E TRANSIÇÕES

## B.1 `@keyframes` , existe APENAS 1 no arquivo inteiro

- `@keyframes spin{to{transform:rotate(360deg)}}` (linha 455). É o spinner de loading, usado no overlay do mapa. **Não há nenhum outro `@keyframes` em todo o arquivo** (confirmado por varredura). Não há AOS, Framer, animate.css nem qualquer lib de animação. As animações dinâmicas de números (count-up dos KPIs do mapa) são feitas em JS via `requestAnimationFrame`, não em CSS.

## B.2 Transições , sem tokens, tudo inline por componente

Durações observadas nesta camada: `.12s`, `.15s`, `.2s`, `.25s`. Easing: `ease` (padrão implícito) na esmagadora maioria; a única curva custom é a da sidebar.

- **Sidebar (expandir/recolher):** `transition:width .25s cubic-bezier(.4,0,.2,1)` (linha 103). Elementos internos fazem fade ao expandir: `.sidebar-logo` `transition:opacity .2s` (linha 108), `.nav-label` `opacity .15s` (linha 120), `.nav-section` `all .2s` (linha 113), `.user-info` `opacity .15s` (linha 133).
- **`.nav-item`:** `transition:all .15s` (linha 115).
- **`#settings-arrow`:** `transition:transform .15s` (linha 126); `.open{transform:rotate(90deg)}` (linha 127).
- **`.screen-card` / `.screen-option-btn`:** `transition:all .15s` (linhas 42, 47).
- **`.role-btn` e seu svg:** `transition:all .2s` (linhas 66-67).
- **`.auth-tab` / `.auth-input` / `.auth-btn`:** `transition:all .2s` (linhas 82, 89, 92).
- **`.tb-btn`:** `transition:all .2s` (linha 150).
- **`.user-row`:** `transition:background .15s` (linha 129); `.ud-item` `transition:background .12s` (linha 139); `.sidebar-hamburger` `transition:all .15s` (linha 106).

## B.3 Estados globais hover/active/focus

- **`.nav-item`:** hover `background:var(--s3);color:var(--tx)` (linha 117); ativo `background:var(--gold-bg);color:var(--gold)` (linha 118) + barra lateral dourada `::before` (linha 119: `position:absolute;left:0;top:22%;bottom:22%;width:2.5px;background:var(--gold);border-radius:2px`).
- **`.auth-input:focus`:** `border-color:var(--gold);background:var(--s2)` (linha 90).
- **`.auth-btn:hover`:** `background:var(--gold3);transform:translateY(-1px)` + sombra dourada (linha 93). Variante `.ghost:hover` (linha 95) cancela o lift (`transform:none;box-shadow:none`).
- **`.screen-card:hover`:** `border-color:var(--gold);background:var(--s3)` (linha 43). `.screen-option-btn:hover` (linha 48): borda + texto dourados. `.active` (linha 49): `background:var(--gold-bg);border-color:rgba(200,169,110,.45);color:var(--gold)`.
- **`.role-btn`:** hover (linha 68) clareia borda/texto e leva o svg a `opacity:.8`; `.selected` (linha 70) aplica gold-bg + svg `opacity:1;color:var(--gold)`.
- **`.tb-btn:hover`:** `border-color:var(--gold);color:var(--gold)` (linha 151).
- **`.ud-item.danger:hover`:** `background:rgba(224,85,85,.08);color:var(--red)` (linha 141).

Resumo: 1 `@keyframes` (`spin`) + transições CSS inline (4 durações distintas + 1 cubic-bezier). Trivial de portar para `transition-*` do Tailwind.

---

# PARTE C , SHELL DA APLICAÇÃO

## C.1 Dois "screens" de topo

- `#scr-auth` (`class="screen active"`, linha 5932): tela de login. Tem dois glows radiais decorativos via `::before` (dourado, linha 62) e `::after` (azul, linha 63), e `overflow:hidden` (linha 61).
- `#scr-app` (`class="screen"`, linha 5997): o app autenticado. `#scr-app{flex-direction:row}` (linha 102) = sidebar à esquerda + conteúdo à direita.

A troca entre eles é por classe `active` (ver `loginUser` e `doLogout`, Parte E).

## C.2 Sidebar (`<aside class="sidebar" id="sidebar">`, linha 5998)

- **Comportamento de largura:** colapsada por padrão `width:60px` (linha 103); expandida `224px` via `.expanded` (linha 104). Transição `width .25s cubic-bezier(.4,0,.2,1)`. `overflow:hidden`, `z-index:50`, `height:100vh`. Toggle pelo hambúrguer: `toggleSidebar()` faz `classList.toggle('expanded')` (linha 8190). Ao expandir, logo, labels, nomes de seção e bloco de usuário fazem fade-in via `opacity`.
- **`.sidebar-top` (linha 5999):** altura 58px, borda inferior. Contém:
  - Botão hambúrguer `.sidebar-hamburger` (linha 6000) com SVG de 3 linhas (`<line>` x3, 17x17, stroke-width 2), `onclick="toggleSidebar()"`.
  - Logo `.sidebar-logo` (linha 6003): `<span class="sidebar-logo-dot"></span>Icaro Group` (dot dourado de 7x7, linha 110). O texto "Icaro Group" só aparece expandido.
- **`.sidebar-nav` (linha 6005):** `flex:1`, scroll vertical com scrollbar oculta (`::-webkit-scrollbar{width:0}`, linha 112).
  - **Seção "Principal"** (`.nav-section`, linha 6006). Quatro itens, todos `<button class="nav-item">` com SVG inline 17x17 (estilo Feather/Lucide, stroke `currentColor`, stroke-width 2) e `<span class="nav-label">`:
    1. `nav-home` , **Início** , ícone casa , `navTo('home')` , começa visível e `.active` (linha 6007).
    2. `nav-estoque` , **Estoque** , ícone caixa/cubo , `navTo('estoque')` , `style="display:none"` até ter permissão (linha 6011).
    3. `nav-demandas` , **Demandas** , ícone checklist , `navTo('demandas')` , oculto até permissão (linha 6015).
    4. `nav-vendas` , **Vendas** , ícone gráfico de linha , `navTo('vendas')` , oculto até permissão (linha 6019).
  - **Seção "Menu"** (`#nav-settings-section`, `style="display:none"`, linha 6024). Revelada só para admin.
    5. `nav-settings` , **Ajustes** , ícone engrenagem , `toggleSettingsMenu()` (linha 6025). Inclui `<span class="nav-soon-tag" id="settings-arrow">›</span>` (linha 6028), a seta `›` que rotaciona 90° quando o submenu abre (`#settings-arrow.open`, linha 127). Curiosidade: o elemento da seta reusa a classe `.nav-soon-tag` (originalmente "em breve", em itálico, linha 122).
    - Submenu `#settings-submenu` (`.settings-submenu`, `style="display:none"`, linha 6030), com `padding-left:8px` (linha 124) e subitens com `padding-left:18px` quando a sidebar expande (linha 125):
      - `nav-admin` , **Painel de Usuários** , ícone pessoas , `navTo('admin')` (linha 6031).
      - `nav-tela` , **Tela** , ícone monitor , `navTo('tela')` (linha 6035). É a tela de aparência/tema.
      - `nav-odoo` , **Odoo API** , ícone tabela , `navTo('odoo')` (linha 6040).
- **`.sidebar-user` (linha 6046):** rodapé com borda superior. `.user-row` (`onclick="toggleUserMenu()"`, linha 6047) contém:
  - Avatar `#uav` (`.avatar`, 30x30, gradiente dourado; vira roxo `.admin-av` se admin), texto inicial "?" até o login.
  - `.user-info`: `.uname` (`#uname`, nome) e `.urole` (`#urole`, cargo). Ambos "—" até o login.
  - Dropdown `.user-dropdown` (`#udd`, linha 6051), posicionado `bottom:60px`, com um único item: `.ud-item.danger` "Sair do portal" (ícone logout) , `onclick="doLogout()"` (linha 6052). Abre/fecha por `toggleUserMenu()` (linha 8188) e fecha ao clicar fora (listener global, linha 8189: qualquer clique fora de `.sidebar-user` remove `.open`).

## C.3 Header / Topbar , existe CSS, NÃO existe no DOM do app

- Há CSS completo de topbar: `.topbar` (linha 143: `height:58px`, `background:var(--s1)`, borda inferior, `padding:0 24px`), `.tb-title` (15px Space Grotesk, linha 144), `.tb-sep` (linha 145), `.tb-welcome` (linha 146, com `strong` dourado linha 147), `.tb-role` (linha 148, pill), `.tb-actions` (linha 149), `.tb-btn` / `.tb-btn.primary` (linhas 150-153). E existe a const JS `TITLES` mapeando módulo para título (linha 8192).
- **Porém o `#scr-app` NÃO renderiza nenhuma topbar global no DOM.** Logo após a `</aside>` da sidebar (linha 6058) vem direto `<div class="app-content">` (linha 6060), sem nó `.topbar`. Cada módulo cuida do próprio cabeçalho interno (ex.: a tela de Vendas tem sua própria `.sales-topbar`). O layout efetivo é **sidebar + `.app-content`** (linha 142: `flex:1;flex-direction:column;height:100vh;overflow:hidden`). As classes `.topbar/.tb-*` são vestígios reaproveitáveis, não montadas nesta versão.

## C.4 FAB (botão flutuante) , NÃO EXISTE

Não há nenhum botão de ação flutuante. Não há classe `.fab`, nem `snackbar`, nem `floating`. As ações de adicionar (evento na agenda, contra-cheque) são botões inline dentro dos módulos (`.a2-add-btn`, `#cc-add-btn`), gated por permissão em `applyDrawerAccess()` (linhas 8168-8169).

## C.5 Toasts / Notificações , NÃO EXISTEM

Não há sistema de toast/snackbar nem sino de notificações. O feedback ao usuário é via `alert()`/`confirm()` nativos do browser (ex.: `alert('Acesso negado.')` em `navTo`, linha 8197) e via mensagens inline nos próprios módulos (ex.: `showErr`/`hideErr` no auth, linhas 8089-8090; `#odoo-settings-result` na tela Odoo). Recomendação de reconstrução: substituir os `alert()` por um sistema de toast é melhoria, não recuperação de algo existente.

## C.6 Responsividade

Não há um sistema unificado de breakpoints; cada bloco define o seu. Nesta camada: `@media(max-width:850px){.screen-card-grid{grid-template-columns:1fr}}` (linha 52), que faz os dois cards da tela "Tela" empilharem. A sidebar não vira drawer mobile; permanece colapsável via hambúrguer em qualquer largura.

---

# PARTE D , TEMA E MÓDULO "TELA"

## D.1 Módulo "Tela" (`#mod-tela`, linhas 7236-7264)

Tela de configuração de aparência, acessível em Ajustes > "Tela" (só admin). Estrutura: `.admin-container` > `.admin-section` com header (ícone monitor dourado + título "Tela", linhas 7239-7242) e `.screen-card-grid` (dois cards, linha 7243):

- **Card "Modo de exibição"** (linhas 7244-7251): título "Modo de exibição", descrição "Escolha entre o modo escuro atual ou uma versão clara do portal." (linha 7246). Dois botões:
  - `#screen-mode-dark` , texto "Escuro" , `onclick="setAppearanceMode('dark')"` (linha 7248).
  - `#screen-mode-light` , texto "Claro" , `onclick="setAppearanceMode('light')"` (linha 7249).
- **Card "Paleta de cores"** (linhas 7252-7260): título "Paleta de cores", descrição "Troque os detalhes dourados por uma paleta cinza/prata." (linha 7254), swatch `.palette-preview` (gradiente, linha 7255). Dois botões:
  - `#screen-palette-gold` , texto "Dourado" , `onclick="setAccentPalette('gold')"` (linha 7257).
  - `#screen-palette-silver` , texto "Cinza/Prata" , `onclick="setAccentPalette('silver')"` (linha 7258).

## D.2 Lógica do tema (JS, linhas 7777-7811)

Chave de persistência: `DB_APPEARANCE='ig_appearance_v1'` (declarada na linha 7748, junto das demais chaves `DB_*`).

- **`getAppearanceSettings()` (linha 7777):** lê `localStorage[DB_APPEARANCE]`, faz `JSON.parse` com fallback `'{}'`; retorna `{mode:data.mode||'dark', palette:data.palette||'gold'}`. Em erro de parse, retorna o default `{mode:'dark',palette:'gold'}` (linha 7781). Default canônico = **dark + gold**.
- **`saveAppearanceSettings(cfg)` (linha 7783):** `localStorage.setItem(DB_APPEARANCE, JSON.stringify(cfg))`.
- **`applyAppearanceSettings()` (linha 7786):** lê o cfg e aplica classes no `<body>`: `classList.toggle('theme-light', cfg.mode==='light')` (linha 7788) e `classList.toggle('palette-silver', cfg.palette==='silver')` (linha 7789); por fim chama `updateAppearanceButtons(cfg)` (linha 7790).
- **`updateAppearanceButtons(cfg)` (linha 7792):** marca `.active` no botão correto de cada card via helper `set(id,on)` (linha 7794), para os quatro ids `screen-mode-dark`, `screen-mode-light`, `screen-palette-gold`, `screen-palette-silver` (linhas 7795-7798). Pode ser chamada sem argumento (recarrega do storage).
- **`setAppearanceMode(mode)` (linha 7800):** seta `cfg.mode` para `'light'` se `mode==='light'`, senão `'dark'` (sanitiza), salva e reaplica.
- **`setAccentPalette(palette)` (linha 7806):** seta `cfg.palette` para `'silver'` se `palette==='silver'`, senão `'gold'`, salva e reaplica.

## D.3 Quando o tema é aplicado

- No carregamento: `applyAppearanceSettings()` é chamado dentro do `DOMContentLoaded` principal (linha 10071) e novamente, com guarda try/catch, ao fim do script (linha 10102: "aplica tema salvo antes do primeiro login, quando possível"). Ou seja, o tema persiste e é aplicado já na tela de login, antes de autenticar.
- Ao navegar para a tela: `navTo('tela')` chama `updateAppearanceButtons()` (linha 8211) para sincronizar o estado visual dos botões ao entrar.

---

# PARTE E , NAVEGAÇÃO

## E.1 Mecanismo (CSS show/hide, sem router)

Cada tela é um `<div class="module" id="mod-XXX">`. `.module{display:none;flex:1;...}` (linha 154) e `.module.active{display:flex}` (linha 155). A troca é por classe, não por rota de URL.

## E.2 `navTo(mod)` (linhas 8193-8213)

1. **Gate de permissão:** se `!hasPerm(mod)` (linha 8194), tenta o fallback `DRAWER_KEYS.find(k=>hasPerm(k))`; se houver e for diferente, re-chama `navTo(fallback)`; senão `alert('Acesso negado.')` (linha 8197).
2. Remove `.active` de todos `.nav-item` e marca `#nav-<mod>` (linhas 8199-8200).
3. Se `mod` for `admin`, `tela` ou `odoo` (linha 8201): também marca `#nav-settings` como `.active` e abre o submenu via `toggleSettingsMenu(true)` (linhas 8202-8204).
4. Remove `.active` de todos `.module` e ativa `#mod-<mod>` (linhas 8206-8207).
5. **Hooks de render por módulo:** `admin` chama `adminRefresh()` (linha 8208); `demandas` chama `renderDemandasDashboard()` (linha 8209); `vendas` chama `renderSalesDashboard()` (linha 8210); `tela` chama `updateAppearanceButtons()` (linha 8211); `odoo` chama `initOdooSettings()` (linha 8212).

Mapa de títulos (linha 8192): `TITLES={home:'Início', estoque:'Estoque', demandas:'Demandas', vendas:'Vendas', admin:'Painel de Usuários', tela:'Tela', odoo:'Odoo API'}`. (Usado conceitualmente; como não há topbar global montada, não é renderizado num nó fixo nesta versão.)

## E.3 `hasPerm(drawer)` , a função de gating (linhas 8091-8098)

```
hasPerm(drawer):
  sem CU (não logado)            -> false
  drawer === 'tela'             -> CU.type==='admin' || CU.permissions?.admin   (derivado de admin)
  drawer === 'odoo'             -> CU.type==='admin' || CU.permissions?.admin   (derivado de admin)
  drawer fora de DRAWER_KEYS    -> false
  CU.type === 'admin'           -> true   (admin vê tudo)
  caso geral                    -> !!CU.permissions?.[drawer]
```

`tela` e `odoo` não são permissões independentes: são derivadas de `admin`. Quem é admin enxerga as três (Painel, Tela, Odoo).

## E.4 `applyDrawerAccess()` (linhas 8155-8170)

Mostra/oculta cada item de menu conforme a permissão, via helper `show(id,on,display)` (linha 8156):
- `nav-home`, `nav-estoque`, `nav-demandas`, `nav-vendas` por `hasPerm` respectivo (linhas 8157-8160).
- `nav-settings-section` (com `display:'block'`) e `nav-settings` por `hasPerm('admin')` (linhas 8161-8162).
- `nav-admin` por `hasPerm('admin')`, `nav-tela` por `hasPerm('tela')`, `nav-odoo` por `hasPerm('odoo')` (linhas 8163-8165).
- Se não for admin, força `#settings-submenu` oculto (linhas 8166-8167).
- Também controla os botões de ação: `.a2-add-btn` (adicionar evento) por `hasPerm('home')` e `#cc-add-btn` (adicionar contra-cheque) por `hasPerm('admin')` (linhas 8168-8169).

## E.5 `toggleSettingsMenu(forceOpen)` (linhas 8171-8179)

Retorna cedo se `!hasPerm('admin')` (linha 8172). Calcula `shouldOpen` (forçado, ou estava fechado), aplica `display` no submenu e roda `arrow.classList.toggle('open', shouldOpen)` (linhas 8176-8178), girando a seta `›`.

## E.6 Inventário de telas (hierarquia)

```
#scr-auth (login)                 [screen de topo, linha 5932]
#scr-app  (aplicação)             [screen de topo, linha 5997]
 ├─ Sidebar › Principal
 │   ├─ #mod-home      "Início"              navTo('home')      visível por padrão
 │   ├─ #mod-estoque   "Estoque"            navTo('estoque')   gated
 │   ├─ #mod-demandas  "Demandas"           navTo('demandas')  gated
 │   └─ #mod-vendas    "Vendas"             navTo('vendas')    gated
 ├─ Sidebar › Menu (Ajustes ▸ submenu, admin-only)
 │   ├─ #mod-admin     "Painel de Usuários" navTo('admin')
 │   ├─ #mod-tela      "Tela" (aparência)   navTo('tela')
 │   └─ #mod-odoo      "Odoo API"           navTo('odoo')
 └─ #mod-mapa  (existe no DOM, SEM item de menu, fora do TITLES)
```

> **Achado (módulo órfão):** `#mod-mapa` existe como módulo mas não tem botão de navegação na sidebar e não está em `TITLES`. É legado (Mapa de Vendas removido do menu; o stub `filterUF` comenta isso). Ainda assim, `buildMap()/populateUF()/rendTable()/updColors()` rodam no `loginUser` (linha 8149). Detalhamento do conteúdo do `#mod-mapa` pertence ao capítulo de Mapa/Vendas; aqui só registramos o status órfão.

## E.7 Sessão e ciclo de login/logout

- `CU` é a variável global do usuário corrente.
- **`loginUser(user)` (linhas 8144-8154):** seta `CU=user`; chama `refreshCurrentUserDisplay()`; remove `.active` de `#scr-auth` e adiciona em `#scr-app` (linhas 8147-8148); inicializa subsistemas: `buildMap();populateUF();rendTable();updColors();initCalendar();renderCC()` (linhas 8149-8150); seleciona o dia de hoje no calendário (linha 8151); se admin, `adminRefresh()`; navega para a primeira gaveta permitida na ordem home > estoque > demandas > vendas > admin (linha 8153).
- **`refreshCurrentUserDisplay()` (linhas 8119-8143):** calcula iniciais do nome (2 primeiras), descobre `isAdmin`, pinta os avatares `uav`/`wav` (foto base64 se houver, senão iniciais; classe `admin-av` se admin), preenche `uname`/`urole` (cargo ou "Administrador Master"), `wname`/`wdate` (data por extenso em pt-BR), e a pill `#wrole-pill` (com classe `admin-pill` se admin); por fim chama `applyDrawerAccess()`.
- **`doLogout()` (linhas 8180-8187):** zera `CU`; troca `#scr-app` por `#scr-auth`; fecha o dropdown `#udd`; limpa `#l-pass`; e `localStorage.removeItem(DB_SESSION)`.
- **Persistência de sessão:** `DB_SESSION='ig_session_v17_...'` (linha 7748). É **gravado** ao salvar permissões do próprio usuário (linha 9279: `localStorage.setItem(DB_SESSION, JSON.stringify(CU))`) e **removido** no logout (linha 8186). **Achado relevante:** não há leitura de `DB_SESSION` no startup; o app não restaura sessão automaticamente ao recarregar a página, sempre cai na tela de login. Na reconstrução, isso vira sessão real (NextAuth/JWT).

---

# PARTE F , AUTENTICAÇÃO (`#scr-auth`, linhas 5932-5994)

Card centralizado `.auth-card` dentro de `.auth-wrap` (max-width 420px, linha 64). Cabeçalho: `.auth-logo-row` (dot dourado + "Icaro Group", linha 5945) e `.auth-subtitle` "Portal Interno — Acesso Restrito" (linha 5946).

## F.1 Seletor de perfil (`.role-selector`, linhas 5934-5943) , OCULTO/LEGADO

`<div class="role-selector" style="display:none">` , está desligado. Dois botões `.role-btn`:
- `#rbtn-user` (`.selected`) , ícone pessoa , texto "Usuário" , `onclick="selectRole('user')"` (linha 5935).
- `#rbtn-admin` , ícone escudo , texto "Administrador" , `onclick="selectRole('admin')"` (linha 5939).

`selectRole()` (linha 8099) é um stub vazio ("login único: mantido apenas para compatibilidade"). O seletor existe no markup (com CSS completo `.role-btn`, linhas 65-72) mas não é exibido nem funcional.

## F.2 Faixa de aviso admin (`#admin-strip`, linhas 5947-5950) , OCULTA

`.admin-strip` (CSS na linha 78: `display:none`, fundo roxo translúcido `rgba(155,114,207,.08)`, borda roxa, ícone escudo roxo). Conteúdo (linha 5949): `<span>Painel de Usuáriosistrativo — acesso restrito à diretoria</span>`.

> **Achados a corrigir na reconstrução:** (1) typo evidente "Painel de Usuáriosistrativo" (deveria ser "Painel Administrativo"); (2) contém o caractere travessão `—`, proibido no projeto. Só apareceria se algum fluxo revelasse a strip (hoje fica oculta). Há outro travessão na própria `.auth-subtitle` "Portal Interno — Acesso Restrito" (linha 5946), também a sanear.

## F.3 Abas Login/Cadastro (`.auth-tabs`, linhas 5951-5954) , OCULTAS

`<div class="auth-tabs" id="auth-tabs" style="display:none">`. Duas abas: `#tab-login` "Entrar" (`.active`) e `#tab-reg` "Criar conta", ambas com `onclick="switchTab(...)"`. `switchTab()` (linha 8100) é stub vazio ("cadastro público desativado"). CSS das abas: linhas 81-83 (pill segmentada com aba ativa em `--s1` + sombra).

## F.4 Os três formulários

Todos usam `.auth-form` (linha 84) com campos `.f-label` + `.f-wrap` (ícone à esquerda) + `.auth-input`, e `.auth-err` para erro.

### F.4.1 Login (`#form-login`, linhas 5955-5965) , ÚNICO ATIVO
- `#l-email` , label "Usuário" , **`type="text"` apesar do id sugerir email** , placeholder "seu usuário", `autocomplete="off"` (linha 5958).
- `#l-pass` , label "Senha" , `type="password"`, placeholder "••••••••" (linha 5961).
- `#l-err` , div de erro (linha 5962).
- Botão "Entrar no site" , `onclick="doLogin()"` (linha 5963).
- Atalho: Enter em `l-email`/`l-pass` dispara `doLogin()` (binding na linha 10076).

### F.4.2 Cadastro (`#form-reg`, linhas 5966-5981) , DESATIVADO
`<div class="auth-form hidden" id="form-reg">`. Campos: `#r-name` ("Nome completo"), `#r-email` ("E-mail", `type=email`), `#r-role` (label **"Cargo / Função"**, placeholder "Ex: Analista Comercial", linha 5975), `#r-pass` ("Senha", placeholder "Mínimo 6 caracteres"), `#r-err`. Botão "Criar minha conta" , `onclick="doRegister()"` (linha 5980). `doRegister()` (linha 8101) apenas exibe erro em `l-err`: "Cadastro público desativado. Peça ao administrador para criar o usuário no Painel de Usuários."

### F.4.3 Admin (`#form-admin`, linhas 5982-5991) , DESATIVADO (vira login normal)
`<div class="auth-form hidden" id="form-admin">`. Campos: `#a-user` (label "Login administrativo", placeholder "admin", linha 5985), `#a-pass` (label **"Senha master"**, `type=password`, linha 5986), `#a-err`. Botão "Acessar painel admin" , `onclick="doAdminLogin()"` (linha 5990). `doAdminLogin()` (linha 8102) é apenas `doLogin()` (alias). Não há fluxo admin separado.

## F.5 `doLogin()` (linhas 8104-8118) e validações

- `hideErr('l-err')`; lê e normaliza o login (`normalizeUsername` do `#l-email`) e a senha (`.trim()` do `#l-pass`).
- Se faltar login ou senha: `showErr('l-err','Preencha usuário e senha.')` (linha 8108).
- Busca em `getUsers()` um usuário cujo username OU email normalizado bate, e cuja senha valida por três caminhos de compatibilidade (linha 8114): `u.pass===btoa(pass)` (base64), `decodePass(u.pass)===pass`, ou texto puro `String(u.pass||'')===pass`.
- Sem match: `showErr('l-err','Usuário ou senha inválidos.')` (linha 8116) , erro genérico (não revela se foi usuário ou senha).
- Com match: `loginUser(user)`.
- Não há "esqueci a senha". Não há `doDemo` ativo (linha 8103, stub que diz "Modo demonstração desativado").

## F.6 Estados de erro (`.auth-err`)

`.auth-err` (linha 96): fundo vermelho translúcido `rgba(224,85,85,.09)`, borda `rgba(224,85,85,.25)`, texto `#E88`, oculto por padrão; `.auth-err.show{display:block}` (linha 97). Controlado por `showErr(id,m)` (linha 8089, seta texto + adiciona `.show`) e `hideErr(id)` (linha 8090, remove `.show`).

## F.7 Inicialização da tela de auth (no `DOMContentLoaded`, linhas 10070-10094)

Ao carregar: aplica tema salvo (linha 10071), limpa `#l-email`/`#l-pass` (linhas 10072-10075), liga Enter nos dois inputs de login para `doLogin()` (linha 10076), e prepara o resto do app (bind de selects de UF, busca de estoque, settings Odoo, máscaras de CPF/CNPJ/data/hora, `getUsers()` para semear o usuário Master, etc.).

---

# PARTE G , UTILITÁRIOS VISUAIS COMPARTILHADOS

> Detalhe completo dos modais por feature está nos capítulos de cada módulo; aqui ficam os utilitários genéricos que a fundação fornece a todos.

## G.1 Sistema de modais (genérico)

- Abrir/fechar: `openModal(id)` adiciona `.open` (linha 8214); `closeModal(id)` remove `.open` (linha 8215).
- Fechar ao clicar no backdrop: listener global em todos `.modal-bg` (linha 8216: fecha se `e.target===bg`).
- A base visual (`.modal-bg` overlay com blur, `.modal`, `.modal-title`, `.modal-close`) está no CSS a partir da linha 483 e é compartilhada por todos os modais de negócio (período de vendas, evento, editar usuário, UF picker, etc.). O blur (`backdrop-filter`) vive nessa camada de modal, não na fundação base.

## G.2 Botões padronizados

- **`.auth-btn`** (linha 92): botão primário dourado (fundo `--gold`, texto `#0A0A10`, Space Grotesk 700). Variante `.ghost` (linha 94): fundo `--s3`, texto secundário, peso 500.
- **`.screen-option-btn`** (linha 47): botão de opção (toggle) usado na tela "Tela"; estado `.active` em gold-bg.
- **`.tb-btn` / `.tb-btn.primary`** (linhas 150-153): botões de barra (CSS pronto, usado por cabeçalhos internos de módulo).
- **`.nav-item`** (linha 115): item de menu reutilizável (também base dos subitens via `.nav-subitem`).

## G.3 Avatares

- `.avatar` (linha 131): 30x30, círculo, gradiente dourado, iniciais em Space Grotesk 800; variante `.admin-av` (linha 132) com gradiente roxo `var(--purple)`→`#6B4FA0` e texto branco. Usado no rodapé da sidebar (`#uav`) e, com a mesma lógica, no `welcome-avatar` da Home (`#wav`).

## G.4 Pills e badges (base de marca)

- **Pills de cargo (fundação):** `.tb-role` (linha 148, pill cinza arredondada 14px) e `.welcome-role-pill`/`.admin-pill` (renderizadas por `refreshCurrentUserDisplay`, com `admin-pill` em roxo quando admin). As pills de tipo de evento/demanda/status pertencem aos respectivos módulos.
- **`.admin-strip`** (linha 78) como faixa de aviso (badge de seção), hoje oculta.
- Padrão visual de pill: cantos arredondados (14px a 999px), uppercase, peso alto, fundo translúcido `rgba(cor,.08-.14)` + texto na cor cheia.

## G.5 Tooltips genéricos

A fundação não tem um componente de tooltip próprio (não há `title` estilizado global). Tooltips ricos existem só no contexto do mapa (`.map-tt`, linha 456) e em alguns gráficos, cobertos nos capítulos de Mapa/Vendas/Demandas. Onde a fundação precisa de dica, usa o atributo nativo `title` (ex.: cada `.nav-item` tem `title="Início"`, `title="Estoque"` etc., linhas 6007-6040).

## G.6 Função utilitária de escape

`esc(v)` (linha 7993): escapa `& < > " '` para entidades HTML. É a defesa básica contra injeção ao montar HTML via template string em toda a aplicação (usada amplamente nos renders de tabela/cards dos módulos).

---

# PARTE H , NOTAS PARA A RECONSTRUÇÃO (Next.js / React / Tailwind)

- **Tokens:** portar as 19 vars de cor + `--r` do `:root` e os dois overrides (`theme-light`, `palette-silver`) como `data-theme`/`data-palette` ou classes no `<html>`. Os dois eixos (modo x paleta) são ortogonais e devem permanecer combináveis (4 combinações).
- **Tema:** replicar persistência em `localStorage` na chave `ig_appearance_v1`, default `{mode:'dark',palette:'gold'}`. Reconstruir a tela "Tela" com os dois cards (4 botões), aplicando antes do primeiro paint para evitar flash.
- **Tipografia:** Inter (corpo) + Space Grotesk (display/marca). Importar pesos até 800; onde o original usa 900, decidir entre incluir o peso ou ajustar.
- **Shell:** sidebar colapsável (60px ↔ 224px, cubic-bezier `.4,0,.2,1`). Sem topbar global (cada módulo tem seu cabeçalho) e sem FAB. Avaliar se a reconstrução mantém esse padrão ou introduz topbar/FAB (seria adição nova).
- **Navegação:** virar rotas reais (App Router) ou estado de aba, preservando o gating `hasPerm` e os hooks de render por módulo. `tela`/`odoo` continuam derivados de `admin`.
- **Autenticação:** o seletor de perfil, as abas Login/Cadastro, o cadastro público e o modo demo estão TODOS desativados; o único fluxo vivo é usuário+senha. Na reconstrução, login real (NextAuth/JWT + bcrypt), restauração de sessão (o protótipo não restaura `DB_SESSION` no reload), e remover o código morto de `selectRole`/`switchTab`/`doRegister`/`doDemo`.
- **Saneamento de texto:** corrigir o typo "Painel de Usuáriosistrativo" (linha 5949) e remover os travessões `—` da `.auth-subtitle` (linha 5946) e da `.admin-strip` (linha 5949), conforme a regra do projeto.
- **Feedback:** o original usa `alert()`/`confirm()` e mensagens inline (`showErr`/`hideErr`). Migrar para um sistema de toast é melhoria recomendada.
- **Animação:** só existe `@keyframes spin`. O resto é transição CSS, direto de portar com `transition-*` do Tailwind.
