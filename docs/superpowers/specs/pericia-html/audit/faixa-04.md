# Auditoria de cobertura adversarial , Faixa 04 (linhas 7200-9600)

> HTML alvo: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Faixa auditada: **7200 a 9600** (HTML final dos módulos Painel/Tela/Odoo + bloco `<script>` 7716-9600).
> Perícia cruzada: `docs/superpowers/specs/pericia-html/00..06`.
> Convenção: **[COBERTO]** = a perícia já descreve o item com profundidade equivalente; **[GAP]** = não documentado, ou só citado de passagem sem o comportamento/dado real.

## Mapa macro da faixa

- **7200-7393 (HTML):** fim do módulo Painel de Usuários (aba Criar Usuário), módulo **Tela** (aparência), módulo **Odoo API** (form gigante de integração).
- **7397-7714 (HTML):** todos os **modais** (month picker, evento, detalhes do evento, excluir evento, excluir usuário, filtros avançados, UF picker, editar usuário, contra-cheque).
- **7716-7775 (dados):** `GEO` (paths SVG dos 27 estados), `UF_FULL`, chaves `DB_*`, `OWNER_USER`, `DRAWERS`/`DRAWER_KEYS`, `LEVELS`, `CARGOS`, `HIERARQUIAS`.
- **7777-9345 (JS):** aparência, hierarquia/UF, usuários/auth, drawers/nav, Odoo settings, calendário/agenda completa, contra-cheque, admin CRUD de usuários, permissões.
- **9348-9600 (JS):** **mapa de vendas** (buildMap + KPIs + tabela + filtros), **pipeline JSON-RPC ao vivo** (rpc/connect/load/sync/disconnect), dados mock `DEMO`/`STOCK_PRODUCTS`/`STOCK_SERIALS` e helpers de estoque.

---

## 1. Módulo Tela / Aparência (7236-7264 HTML; 7777-7811 JS)

- **HTML `mod-tela` (7236-7264):** `.screen-card-grid` com 2 cards. Card "Modo de exibição" -> botões `setAppearanceMode('dark'|'light')` (ids `screen-mode-dark`/`screen-mode-light`). Card "Paleta de cores" -> `.palette-preview` + botões `setAccentPalette('gold'|'silver')` (ids `screen-palette-gold`/`screen-palette-silver`). **[COBERTO]** (06 item 4 + 00:178-185).
- `getAppearanceSettings` (7777, default `{mode:'dark',palette:'gold'}`), `saveAppearanceSettings` (7783, `DB_APPEARANCE`), `applyAppearanceSettings` (7786, aplica classes `theme-light`/`palette-silver` no `body`), `updateAppearanceButtons` (7792), `setAppearanceMode` (7800), `setAccentPalette` (7806). **[COBERTO]**.

## 2. Módulo Odoo API , form de configuração (7267-7393 HTML; 8220-8336 JS)

- **5 cards do form (7291-7385):** Conexão/auth (status, ambiente, protocolo jsonrpc/xmlrpc/json2, versão, URL, db, user, authMethod, password+toggle, proxyPath `/api/odoo`, timeout); Empresa/escopo (companyId, companyName, companyIds, warehouseIds, locationIds, categoryIds, lang, timezone); Modelos/endpoints (authEndpoint, datasetEndpoint, 10 nomes de modelo); Sincronização (6 checkboxes, autoSync, interval, batchLimit, dateFrom, extraDomain textarea); Segurança/webhooks (allowedOrigin, webhookSecret, webhookPath, logLevel, notes). Nota de aviso (7388) + `#odoo-settings-result`. **[COBERTO]** (06 §5.1).
- `ODOO_DEFAULT_SETTINGS` (8221, version default `'18'`). Helpers `cloneOdooDefault`/`normalizeOdooUrl`/`getOdooSettings`/`setOdooVal`/`setOdooCheck`/`getOdooVal`/`getOdooCheck` (8230-8245). `updateOdooStatus` (8246, badge 3 estados), `syncCompactOdooPanel` (8256, espelha p/ `ou/odb/ous/opw` do Mapa), `initOdooSettings` (8263), `collectOdooSettings` (8275), `showOdooResult` (8287), `saveOdooSettings(silent)` (8293), `resetOdooSettings` (8304), `toggleOdooSecret` (8310), `testOdooSettings` (8314, fetch real ao proxy, valida `result.uid`). **[COBERTO]** (06 §5.2).

## 3. Hierarquia comercial e escopo UF (7775, 7813-7988 JS)

- `HIERARQUIAS` (7775) e `HIERARCHY_LEVELS` (7813): REGIONAL(1) < GERENTE COMERCIAL REGIONAL(2) < SUB GERENTE COMERCIAL GLOBAL(3) < DIRETOR COMERCIAL GLOBAL(4). `normalizeHierarchyValue` (7819, sinônimos), `hierarchyLevelOf` (7828), `isRegionalHierarchyValue` (7829). **[COBERTO]** (06 §3.6).
- Utilitários de UF: `normalizeUfValue` (7833), `UFS` (7841, 27 estados), `normalizeUfList` (7842, dedup + 'TODOS'), `ufListHasAll` (7848), `ufListContains` (7849), `ufListsOverlap` (7854), `formatUfList` (7860), `userRegionalUfs`/`userRegionalUf` (7866-7869). **[COBERTO]** (06 §3.1).
- Campo UF (display + multi-select): `renderUfFieldDisplay` (7873), `setUfSelectValues` (7882), `getUfSelectValues` (7893), `bindUfMultiSelects` (7904). **[COBERTO]**.
- **UF Picker (modal `modal-uf-picker` 7599-7617):** `UF_PICKER_SELECTED`, `ufPickerOptions` (7921, 'TODOS' + 27), `renderUfPickerGrid` (7924, cards checkbox), `openUfPicker` (7936, reanexa modal ao body), `toggleUfPickerValue` (7946, 'TODOS' exclui individuais), `handleUfPickerCheck`/`ufPickerSelectAll`/`ufPickerClear`/`saveUfPicker`/`closeUfPicker` (7960-7979). **[COBERTO]** (06 §3, UfPicker).
- `regionalUfsCanSeeEvent(viewer,creator,ev)` (7980): regra de visibilidade por UF (viewer 'TODOS' vê tudo; senão casa UF do evento, senão overlap criador). **[COBERTO]** (06:97, 05:426).

## 4. Usuários, login e gaveta de acesso (7748-7775, 7990-8214 JS)

- Chaves `DB_*` (7748, `DB_USERS='ig_users_v17_...'` + 3 legados para migração). `OWNER_USER` (7751, `owner-icaro`, hierarquia DIRETOR COMERCIAL GLOBAL, pass `btoa('icaro@2026')`, type admin). `DRAWERS`/`DRAWER_KEYS` (7771-7772: home/estoque/demandas/vendas/admin). `LEVELS`, `CARGOS=['VENDEDOR']`, `HIERARQUIAS`. **[COBERTO]** (06 §1/§3).
- `getUsers` (7994): parse + **migração de versões antigas** (PREV/PREV2/OLD), garante Ícaro no topo sem sobrescrever senha, normaliza hierarquia/UF/permissões de cada usuário. `saveUsers` (8087), `decodePass` (8088, atob), `normalizeUsername`/`esc` (7992-7993). **[COBERTO]** (06 §1.1).
- Auth: `hasPerm(drawer)` (8091, 'tela'/'odoo' exigem admin), stubs desativados `selectRole`/`switchTab`/`doRegister`/`doAdminLogin`/`doDemo` (8099-8103), `doLogin` (8104, login por username OU email, 3 caminhos de senha), `refreshCurrentUserDisplay` (8119, avatar/foto/pill admin), `loginUser` (8144, monta tela e chama `buildMap();populateUF();rendTable();updColors();initCalendar();renderCC()` + navega), `applyDrawerAccess` (8155, show/hide do menu por permissão), `toggleSettingsMenu` (8171), `doLogout` (8180), `toggleUserMenu`/`toggleSidebar` (8188-8190). **[COBERTO]** (06 §1.3).
- `TITLES` (8192) + `navTo(mod)` (8193): fallback p/ 1ª gaveta permitida, ativa submenu de Ajustes, chama hooks `renderDemandasDashboard`/`renderSalesDashboard`/`updateAppearanceButtons`/`initOdooSettings`. `openModal`/`closeModal` (8214-8215) + fechar por clique no backdrop (8216). **[COBERTO]**.

## 5. Calendário / Agenda (8338-9016 JS; modais 7398-7596)

- Constantes `MONTHS`/`DOWS` (8339-8340), estado `CAL_YEAR/CAL_MONTH/CAL_RANGE/SEL_DATE/EVT_FILTER/EVT_SEARCH/EVT_ADV_FILTERS` (8341), `EVENT_TYPE_LABELS` (8342, 9 tipos incl. interno/prazo/entrega). Helpers de tipo `eventTypeKey`/`eventTypeLabel`/`eventTypeClass` (8353-8355). **[COBERTO]** (05).
- Filtros: `setEvtFilter` (8357), `setEventSearch` (8365), `getEffectiveEventTypeFilter` (8369), `eventText` (8370), `eventParticipantsText`/`eventParticipantNames`/`eventAttachmentsText`/`eventAttachmentsHtml` (8378-8401). Filtros avançados (modal `modal-event-filters` 7522-7596): `openEventAdvancedFilters` (8538), `toggleEventCustomPeriod` (8550), `applyEventAdvancedFilters` (8555), `clearEventAdvancedFilters` (8572). `eventMatchesPeriod`/`eventMatchesTime`/`eventMatchesFilters` (8491-8536). **[COBERTO]** (05:373-440).
- **RBAC de eventos:** `currentUserTokens`/`eventCreatedByMe`/`eventHasCurrentUserParticipant` (8403-8410), `eventCreatedByUser` (8413), `eventUserIsCollaborator` (8419), `getUserById`/`getUserByUsername`/`getEventCreatorUser` (8437-8455), `isMasterUser` (8457), **`canViewEvent` (8458-8485)** (master vê tudo; criador/colaborador veem; `viewerLevel<=creatorLevel` bloqueia; GERENTE REGIONAL só vê VENDEDOR REGIONAL da UF; globais veem todos abaixo), `canDeleteEvent` (8486), `getVisibleEvents` (8490). **[COBERTO]** (05:421-429).
- Persistência: `getEvents` (8582, backfill de `id` ausente), `saveEvents` (8597, alert de quota). **[COBERTO]** (05).
- Render: `initCalendar` (8606), `renderCalendar` (8610, single/scroll multi-mês), `renderMonth` (8632), `makeCell` (8641, até 2 minis + tag "+N"), `isoDate` (8663), `selectDay` (8664), `renderDayPanel` (8665, painel do dia com cards de evento, anexos, botão excluir), `openEventDetails` (8707, modal de detalhes com grid), confirm exclusão `openEventDeleteConfirm`/`cancelDeleteEvent`/`confirmDeleteEvent`/`deleteEvent` (8757-8786). **[COBERTO]** (05).
- Navegação de data: `calNav`/`calToday` (8787-8793), month picker (modal 7398-7418): `openMonthPicker`/`mpYearNav`/`renderMPMonths`/`selectMPMonth`/`applyMonthPicker` (8798-8814). Datas/máscaras: `isoToBR`/`brToISO`/`setQuickDate`/`setQuickTime`/`maskDate`/`maskTime` (8815-8838). **[COBERTO]** (05).
- **Picker de colaboradores (estilo Outlook, modal-event 7462-7470):** `normalizeCollabSearchText` (8840), `eventCollaboratorUsers` (8843), `focusEventCollabInput` (8846), `resetEventCollaborators` (8850), `populateEventCollaborators` (8856), `addEventCollaborator` (8859), `removeEventCollaborator` (8868), `renderEventCollaboratorPicker` (8874), `closeEventCollaboratorSuggestions` (8915), `initEventCollaboratorPicker` (8919), `selectedEventCollaborators` (8941). **[COBERTO]** (05:291).
- Anexos: `refreshEventFileList` (8948), `readEventAttachments` (8956, FileReader -> dataUrl), `initEventAttachmentInput` (9018). Criação: `openAddEvent` (8972, pré-preenche UF do usuário), `saveEvent` (8983, valida título/data/hora, grava `createdBy*`+hierarquia). **[COBERTO]** (05).

## 6. Contra-cheque / CC (7703-7714 HTML; 9027-9057 JS)

- Modal `modal-cc` (7703-7714, nome/período/arquivo). `getCC`/`saveCC` (9027-9028, `DB_CC`), `renderCC` (9029, cards, delete só admin), `openCCModal` (9043), `saveCCFile` (9044, **só metadados, não salva o binário**), `deleteCC` (9054, confirm). **[COBERTO]** (06 §contra-cheque 127-137).

## 7. Admin , CRUD de usuários e permissões (7188-7230 HTML; 9060-9345 JS; modais 7507-7700)

- `adminRefresh` (9060, tabela de usuários com pills Master/Foto), `adminTab` (9082), **`adminCreateUser`** (9091, valida nome/usuário/senha, UF obrigatória p/ regional, senha >=6, unicidade username/email), `bindAdminCreateUserButton` (9117). **[COBERTO]** (06 §2).
- Editar (modal `modal-edit-user` 7619-7700, abas info/perms): `editUserTab` (9128), foto `setEditUserPhoto`/`removeEditUserPhoto`/`handleEditUserPhoto` (9136-9160, limite 900KB), máscaras `digitsOnly`/`maskCpfValue`/`maskCnpjValue` (9162-9169), `renderEditUserPerms` (9171, switches por gaveta, admin travado), `adminOpenEditUser` (9189), **`adminSaveEditUser`** (9212, valida email/CPF/CNPJ/senha+confirmação, unicidade, atualiza permissões e sessão se for o próprio CU). **[COBERTO]** (06 §2, 87-94).
- Tabela de permissões: `renderPermTable` (9289), `toggleUserDrawerPerm` (9304), `resetPerms` (9313). Excluir (modal `modal-user-delete` 7507-7520): `adminDeleteUser` (9315, bloqueia Master e auto-exclusão), `cancelDeleteUser`/`confirmDeleteUser` (9327-9344). **[COBERTO]** (06 §2, 62-70).

## 8. MAPA DE VENDAS , runtime (9348-9455 JS) , **GAP**

- **`DEMO` (9349-9370): 20 pedidos mock hardcoded**, schema `{c:cliente, m:modelo, u:uf, p:data BR, s:status}`. Modelos `T600X/E200/C100`; status `sale/done/draft/cancel`. Estado vivo `MALL`/`MFD`/`MOC`/`MOG` (9371). **[GAP]** , a perícia (03:46, 01:171) só cita `DEMO`/`MALL` como *fallback* do dataset de Demandas; o **conteúdo das 20 linhas, o schema dos campos e a troca mock<->Odoo** não estão inventariados.
- `buildMap` (9373): injeta 27 `<path>` SVG + labels (DF sem label), liga hover/click. **Parcial** , 00:295 descreve só o conceito genérico + classes CSS; o resto do runtime abaixo NÃO está documentado.
- `updColors` (9392): **fórmula de heatmap** `rgba(200, g2, b2, a)` com `g2=169*(1-r*.8)`, `b2=110*(1-r*.8)`, `a=0.15+r*0.78`. **[GAP]**.
- Tooltip do mapa: `showMTT` (9404, "N pedidos"), `moveMTT` (9411), `hideMTT` (9412). **[GAP]**.
- KPIs do mapa: `updMKPIs` (9413, total/média por estado/estado líder), `animN` (9421, **count-up 600ms** via requestAnimationFrame). **[GAP]**.
- Barras top-6: `updMBars` (9425, ranking horizontal das 6 UFs com mais pedidos). **[GAP]**.
- Tabela do mapa: `rendTable` (9431), `hiR` (9437, destaque de linha + **flash brightness 700ms** no estado). **[GAP]**.
- Filtros do mapa + chips: `applyF` (9441, busca/UF/status), `clearF` (9448), `cS`/`cU`/`cT` (9449-9451), `populateUF` (9453). **[GAP]**.
- `filterUF` (9452): **stub no-op** , comentário "Mapa de Vendas removido do menu lateral" (o módulo saiu do menu, mas `buildMap`/`updColors`/`rendTable` ainda rodam no `loginUser`). **[GAP]**.

## 9. Pipeline Odoo ao vivo (mapa) (9457-9515 JS) , **GAP**

- **`rpc(ep,payload)` (9457):** POST ao proxy (`cfg.proxyPath` `/api/odoo`) com `{baseUrl,url,endpoint,payload,timeout}`; trata `d.error`. **[GAP]**.
- **`connectOdoo` (9465):** lê `ou/odb/ous/opw` (ou settings salvos), `session/authenticate`, guarda `MOG={url,db,uid,password}`, `MOC=true`, persiste em `DB_ODOO_CONFIG`, atualiza indicadores `ooi/ootx`, chama `loadOdoo`. **[GAP]**.
- **`loadOdoo` (9487):** pipeline de **3 chamadas JSON-RPC** , `sale.order` search_read (`state in [sale,done]`, fields name/partner_id/partner_shipping_id/state/commitment_date/date_order, limit 300) -> `res.partner` read (id/name/state_id) -> `sale.order.line` search_read (order_id in, fields order_id/product_id, limit 600). **Parsing de UF a partir de `state_id[1]`** (split `' - '`/`'-'`/2 primeiros chars), modelo da 1ª linha, prazo de `commitment_date||date_order`. Popula `MALL`/`MFD` e re-renderiza mapa. **[GAP]** , este é o único caminho de dado real do protótipo e não está documentado em nenhum doc.
- `syncOdoo` (9510, recarrega se conectado), `disconnectOdoo` (9511, volta para `DEMO`, reseta indicadores). **[GAP]**.

## 10. Dados mock e helpers de estoque (9518-9600 JS)

- `STOCK_LOCATIONS` (9518, 5 locais c/ search+value), `STOCK_TABLE_LOCATIONS` (9525), `STOCK_IDEAL_STORAGE_KEY='stock_ideal_config_v73'` (9526), `STOCK_CATEGORIES` (9527), `STOCK_SUPPLIERS` (9528). **Parcial** , nomes citados em 01/03/04, mas valores aqui.
- **`STOCK_PRODUCTS` (9529): 48 produtos gerados** por fórmula (`defaultIdeal=45+base*6+n`, `demanda=base*12+n`, `disponiveis=base*18+n`, qty por 5 locais). **`STOCK_SERIALS` (9549): seriais gerados** (`serialCount=4+(idx%4)`, `cost=850+(idx%12)*185+(idx+1)*11+seq*37`, `purchaseDate`/`arrivalDate`/`leadDays`). **[GAP]** , os docs referenciam os nomes mas **não a fórmula de geração** que determina todos os números mock.
- `ACTIVE_STOCK_LOCATION`/`STOCK_IDEAL_MAP` (9570-9571). Helpers `normalizeStockText` (9572), `formatStockCurrency` (9575), `formatStockISODate` (9578), `formatStockDate` (9584), `getStockLeadDays` (9590), `formatLeadDays` (9597). **[COBERTO/parcial]** , domínio Estoque (01); início das funções de estoque que continuam na faixa seguinte (>9600).

---

## Resumo de cobertura

- **Itens inventariados na faixa:** ~120 (constantes/dados + funções + modais + blocos HTML).
- **GAPs identificados:** 11 (concentrados no runtime do Mapa, no pipeline Odoo ao vivo e nos dados mock).

### Top 5 GAPs (mais importantes)

1. **Pipeline Odoo ao vivo `loadOdoo`/`connectOdoo`/`rpc` (9457-9515)** , 3 chamadas JSON-RPC (sale.order -> res.partner -> sale.order.line) + parse de UF do `state_id`; único caminho de dado real, não documentado em nenhum doc.
2. **Runtime do Mapa de Vendas (9392-9455)** , `updColors` (fórmula de heatmap), `updMKPIs`/`animN` (KPIs + count-up 600ms), `updMBars`, `rendTable`/`hiR` (flash 700ms), `applyF`/chips; 00:295 só cobre o conceito de `buildMap`.
3. **Dataset mock `DEMO` (9349-9371)** , 20 pedidos hardcoded com schema `{c,m,u,p,s}` e troca `MALL/MFD` mock<->Odoo; perícia só cita como fallback de Demandas, sem o conteúdo/schema.
4. **Fórmulas de geração `STOCK_PRODUCTS`/`STOCK_SERIALS` (9529-9569)** , algoritmos que produzem todos os números mock de estoque/seriais; docs citam os nomes, não as fórmulas.
5. **`filterUF` stub + Mapa removido do menu (9452)** , o módulo `mod-mapa` saiu do menu lateral mas `buildMap/updColors/rendTable` ainda executam no `loginUser` (8149); comportamento órfão não registrado.
