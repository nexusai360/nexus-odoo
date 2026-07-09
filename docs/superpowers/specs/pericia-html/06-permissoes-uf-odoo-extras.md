# Perícia HTML , Módulo 06: Usuários / Permissões / Seletor de UF / Config Odoo / Extras

Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.972 linhas).
Foco: matriz de permissões, seletor de UF, "CC" (contra-cheques), configuração Odoo e varredura final de recursos não cobertos pelos outros módulos.

Todas as linhas citadas são do arquivo acima. Nada aqui é inferido sem código de respaldo.

---

## 1. Modelo de usuários (base de tudo)

### 1.1 Estrutura de um usuário (objeto persistido)
Persistência: `localStorage`. Chaves (linha 7748):
- `DB_USERS='ig_users_v17_login_corrigido_eventos_colaboradores_anexos'` (atual), com migração de chaves antigas `DB_USERS_PREV='ig_users_v10_...'`, `DB_USERS_PREV2='ig_users_v7_login_fixo'`, `DB_USERS_OLD='ig_users'` (ver `getUsers`, linha 7994+).
- `DB_SESSION='ig_session_v17_...'` (sessão do usuário logado, `CU`).
- `DB_PERMS='ig_user_drawer_perms'` (declarada mas o fluxo real grava as permissões dentro do próprio objeto do usuário, não nesta chave).

Campos de um usuário (ver `adminCreateUser` 9091, `adminSaveEditUser` 9212, `OWNER_USER` 7751):
`id`, `name`, `username`, `email`, `role`/`cargo`, `hierarchy`, `uf` (CSV) + `ufs` (array), `pass` (ofuscada com `btoa`/base64, NÃO criptografia real , `decodePass` em 8088), `type` (`'admin'` | `'user'`), `level` (`'admin'` | `'usuario'`), `permissions` (objeto booleano por gaveta), `birthdate`, `cpf`, `cnpj`, `photo` (dataURL), `createdAt`.

### 1.2 Usuário Master fixo (semente)
`OWNER_USER` (7751-7770): id `'owner-icaro'`, nome "Ícaro", username `icaro`, senha `btoa('icaro@2026')`, `type:'admin'`, `level:'admin'`, hierarquia `DIRETOR COMERCIAL GLOBAL`, `permissions:{home,estoque,demandas,vendas,admin}` todas `true`. Garantido em toda primeira abertura (getUsers).

### 1.3 Login (auth)
- `doLogin()` (8104): normaliza login (username OU email), compara senha por 3 caminhos de compatibilidade (`u.pass===btoa(pass)`, `decodePass`, texto puro). Erro genérico "Usuário ou senha inválidos."
- `doAdminLogin()` (8102) = alias de `doLogin()`. `doRegister()` (8101) e `switchTab()` (8100) e `doDemo()` (8103) estão **desativados** (cadastro público e modo demo removidos) , exibem mensagem orientando criar usuário no Painel de Usuários.
- `loginUser()` (8144): seta `CU`, troca tela `scr-auth`→`scr-app`, inicializa mapa/UF/tabela/calendário/CC, e navega para a primeira gaveta permitida (home→estoque→demandas→vendas→admin).

---

## 2. MATRIZ DE PERMISSÕES (renderEditUserPerms / renderPermTable)

### 2.1 Catálogo de "gavetas" (a granularidade real)
Linhas 7771-7772:
```
DRAWERS = {home:'Início', estoque:'Estoque', demandas:'Demandas', vendas:'Vendas', admin:'Painel de Usuários'}
DRAWER_KEYS = ['home','estoque','demandas','vendas','admin']
```
**Granularidade = por GAVETA do menu lateral (5 itens), booleana on/off por usuário.** NÃO há permissão por tela interna, por seção, por ação (CRUD) nem por UF. UF é escopo de dado, não de permissão (seção 3).

`tela` (aparência) e `odoo` (config ERP) **não são permissões independentes**: `hasPerm` (8091-8098) deriva ambas de `admin` (`drawer==='tela'`/`'odoo'` → só `type==='admin' || permissions.admin`). Quem é admin vê tudo.

### 2.2 hasPerm , a função de gating (8091)
```
hasPerm(drawer):
  sem CU → false
  'tela'/'odoo' → admin?  (derivado de admin)
  drawer fora de DRAWER_KEYS → false
  CU.type==='admin' → true (admin vê tudo)
  senão → !!CU.permissions[drawer]
```

### 2.3 renderEditUserPerms(u) (9171) , a UI REAL de edição de permissões
Renderiza, no modal "Editar usuário" → aba **Permissões** (`#eu-perm-list`), uma linha por gaveta de `DRAWER_KEYS`:
- `locked = u.id==='owner-icaro' || u.type==='admin'`.
- Cada linha: título (`DRAWERS[drawer]`) + subtítulo. Se locked: "Permissão obrigatória para Administrador Master"; senão "Liberar ou bloquear esta gaveta no menu lateral".
- Controle = toggle switch (`<input type=checkbox data-drawer=... class=eu-perm-check-input>`), `checked` se `locked || u.permissions[drawer]`, `disabled` se locked.
- Markup: `.eu-perm-row` / `.eu-switch` / `.eu-slider`.

Salvamento em `adminSaveEditUser` (9212-9288): se NÃO for master, lê todos os checkboxes `#eu-perm-list .eu-perm-check-input` e monta `permissions = Object.fromEntries(DRAWER_KEYS.map(k=>[k,!!checked]))`. Se for master, força todas as gavetas `true` e `type/level='admin'`. Após salvar, se o usuário editado é o logado, atualiza `CU` e `refreshCurrentUserDisplay()` (re-aplica `applyDrawerAccess`).

### 2.4 renderPermTable() / toggleUserDrawerPerm() / resetPerms() , CÓDIGO LEGADO MORTO
`renderPermTable` (9289) procura `#perm-table-body` e **retorna cedo se não existir**. A busca por `perm-table-body` no HTML retorna **apenas a referência JS (9291)** , **não existe nenhum elemento `id="perm-table-body"` no markup deste arquivo.** Logo:
- `renderPermTable()`, `toggleUserDrawerPerm()` (9304), `resetPerms()` (9313) e a classe `.perm-check` (`on`/`locked`, clique chama `toggleUserDrawerPerm`) são **uma matriz de permissões em grade que NÃO está montada na UI desta versão** (era a versão antiga; foi substituída pela aba Permissões do modal). As chamadas a `renderPermTable()` em `adminSaveEditUser`/`confirmDeleteUser`/`toggleUserDrawerPerm` são no-ops.
  - Para referência da reconstrução: a grade legada renderizava 1 linha por usuário, 1 coluna por gaveta, com `.perm-check on/locked` clicável togglando `permissions[drawer]` (admin sempre locked). É o modelo "matriz" caso se queira reintroduzir.

### 2.5 Listagem de usuários (aba Usuários do Painel) , adminRefresh (9060)
Tabela `#admin-users-table` (cabeçalho 7203): **Nome, Usuário, Cargo, Hierarquia, UF(s)/Estado(s), Permissões, Cadastro, Ação**.
- Coluna Permissões = read-only: `DRAWER_KEYS.filter(perm liberada).map(DRAWERS).join(', ')` ou "Nenhuma gaveta liberada".
- Pills: "Master" (locked: owner-icaro ou admin), "Foto" (tem foto).
- Ações: "Editar" (`adminOpenEditUser`) e "Remover" (`adminDeleteUser`, oculto para master).
- Vazio: "Nenhum usuário cadastrado ainda." / "Carregando…" inicial.

### 2.6 Papéis (roles) , o que existe de fato
- Dois níveis técnicos (linha 7773 `LEVELS`): **`admin` = "Administrador Master"** e **`usuario` = "Usuário"**. NÃO existem papéis "gerente"/"visualizador"/"super_admin" no código , a hierarquia comercial (seção 3.5) é um eixo separado e não controla menu.
- `type:'admin'` ⇒ todas as gavetas + tela + odoo, é "locked" (não editável/removível), não pode se auto-remover.
- `type:'user'` (`level:'usuario'`) ⇒ acesso conforme `permissions`.
- `CARGOS=['VENDEDOR']` (7774) , único cargo no select.

### 2.7 Defaults de permissão ao criar usuário (9107)
Novo usuário nasce com `permissions:{home:true, estoque:false, demandas:false, admin:false}`.
**Atenção/bug a notar:** `vendas` NÃO está no objeto default ⇒ fica `undefined` (falsy) , novo usuário não vê Vendas até liberar. Só `home` vem ligado por padrão. `cargo/role` default `'VENDEDOR'`, `hierarchy` default `'VENDEDOR REGIONAL'`.

### 2.8 Criar usuário , adminCreateUser (9091) e modal de edição
Form "Criar Usuário" (`#apane-create`, 7210-7230): Nome, Usuário de login, E-mail, Cargo (select VENDEDOR), Hierarquia (4 opções), UF(s) (via picker), Senha inicial. Validações: nome+usuário+senha obrigatórios; senha ≥6; se hierarquia regional, ≥1 UF (ou TODOS); username/email únicos. Texto: "As permissões das gavetas podem ser definidas no botão Editar de cada usuário, na guia Permissões." Aviso pós-criação: o usuário já entra pela tela inicial.

Modal "Editar usuário" (`#modal-edit-user`, 7619-7700): duas abas , **Informações** (foto até 900KB; nome, username, email, nascimento, CPF com máscara `maskCpfValue` 9163, CNPJ opcional `maskCnpjValue` 9167, cargo, hierarquia, UF picker; bloco Senha: senha atual readonly em texto claro via `decodePass`, mudar senha + confirmar) e **Permissões** (renderEditUserPerms). `adminOpenEditUser` (9189) preenche tudo; `adminSaveEditUser` (9212) valida (email regex, CPF=11 dígitos, CNPJ=14, nova senha ≥6 e confere).

### 2.9 Remoção de usuário (modal de confirmação)
`adminDeleteUser` (9315) → `modal-user-delete` (`#user-delete-name`) → `confirmDeleteUser` (9331)/`cancelDeleteUser` (9327). Bloqueios: master não removível; não pode remover o usuário logado. Mensagens: "O Administrador Master não pode ser removido.", "Você não pode remover o usuário que está logado no momento.", sucesso "Usuário removido com sucesso." Usa variável `PENDING_DELETE_USER_ID`.

---

## 3. SELETOR DE UF (openUfPicker / renderUfPickerGrid / renderUfFieldDisplay)

### 3.1 Para que serve
Escopo geográfico de atuação do usuário (estados que ele cobre). Obrigatório para hierarquias regionais (`VENDEDOR REGIONAL`, `GERENTE COMERCIAL REGIONAL` , `isRegionalHierarchyValue` 7829). Armazenado em `u.ufs` (array normalizado) + `u.uf` (CSV `ufs.join(',')`). Usado depois para visibilidade de eventos/dados por UF (`regionalUfsCanSeeEvent` 7980, `ufListsOverlap` 7854).

### 3.2 Conjunto de UFs (7841)
`UFS` = 27 unidades (AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO). `UF_FULL` (7747) = nome completo derivado do `GEO` (paths do mapa do Brasil). Opções do picker (`ufPickerOptions` 7921): primeiro `{value:'TODOS', label:'TODOS — Todas as UFs'}` depois cada UF como `"UF — Nome"`.

### 3.3 Normalização (7833-7858)
- `normalizeUfValue` (7833): uppercase, remove acentos, `TODOS/TODAS/ALL`→`'TODOS'`, senão pega 2 primeiras letras se forem A-Z.
- `normalizeUfList` (7842): split por `[;,|]`, dedup, se contém TODOS retorna `['TODOS']`, senão filtra só UFs válidas.
- Helpers: `ufListHasAll`, `ufListContains`, `ufListsOverlap`, `userRegionalUfs`/`userRegionalUf`.

### 3.4 Modal picker (`modal-uf-picker`, 7599-7617) + funções
- `openUfPicker(targetId)` (7936): valida campo alvo, reanexa o modal ao `document.body` (evita stacking dentro de outro modal), guarda alvo em `#uf-picker-target`, carrega seleção atual (`getUfSelectValues`), `renderUfPickerGrid()`, abre.
- `renderUfPickerGrid()` (7924): grid de cards `.uf-check-card` (`.checked` quando marcado), role=button, tabindex=0, suporte teclado Enter/Espaço, cada card tem checkbox visual e label. Clique → `toggleUfPickerValue`.
- `toggleUfPickerValue(value)` (7946): **TODOS é exclusivo** , marcar TODOS limpa individuais; marcar individual remove TODOS; toggle normal nos demais. Estado em `UF_PICKER_SELECTED`.
- Ferramentas: `ufPickerSelectAll()` (botão "Marcar TODOS") e `ufPickerClear()` ("Limpar seleção").
- `saveUfPicker()` (7972): aplica via `setUfSelectValues` no campo alvo e fecha. `closeUfPicker()` (7977).
- Texto do modal: "Marque as caixinhas das UFs que deseja vincular ao usuário. A opção TODOS representa todas as UFs e desmarca as opções individuais."

### 3.5 Exibição do campo escolhido (renderUfFieldDisplay 7873)
Campo nos forms (criar 7222 e editar 7671): `<input type=hidden id=au-uf/eu-uf>` + `.uf-display` + botão "Editar" (`openUfPicker('au-uf'|'eu-uf')`).
- Vazio: `.uf-display.empty` texto "Nenhuma UF selecionada".
- TODOS: chip "TODOS" + "Todas as UFs vinculadas".
- Seleção: chips `.uf-tag` por UF.
- `formatUfList` (7860) gera o texto para a tabela admin: `'—'` se vazio, `'TODOS'`, ou `'SP, MG, ...'`. Na coluna da tabela de permissões legada exibiria "UF não definida" quando `'—'`.

### 3.6 Hierarquia comercial (eixo separado, não é permissão de menu)
`HIERARQUIAS` (7775) / `HIERARCHY_LEVELS` (7813): VENDEDOR REGIONAL(1), GERENTE COMERCIAL REGIONAL(2), SUB GERENTE COMERCIAL GLOBAL(3), DIRETOR COMERCIAL GLOBAL(4). `normalizeHierarchyValue` (7819) aceita sinônimos. `hierarchyLevelOf` (7828). Regionais (níveis 1-2) precisam de UF; globais (3-4) veem tudo. Define visibilidade de dado, NÃO acesso a gaveta.

---

## 4. CC = CONTRA-CHEQUES (openCCModal / renderCC)

**"CC" = Contra-cheques (holerites/payslips).** Card na tela Início.

- Chave: `DB_CC='ig_cc'` (7748). `getCC` (9027) / `saveCC` (9028).
- Card na Home (`mod-home`, 6124-6134): cabeçalho "Contra-cheques" (ícone documento), botão "Adicionar" (`#cc-add-btn`, `onclick=openCCModal()`, `display:none` por padrão , só visível para admin via `applyDrawerAccess` 8169: `cc.style.display=hasPerm('admin')?'flex':'none'`).
- `renderCC()` (9029): lista cards `.cc-file` (ícone + nome + período `.cc-file-meta`). Botão excluir `.cc-file-del` ("×", `deleteCC`) **só se `CU.type==='admin'`**. Vazio: `.cc-empty` "Nenhum contra-cheque disponível."
- `openCCModal()` (9043) = `openModal('modal-cc')`. Modal (`modal-cc`, 7703-7714): título "Adicionar Contra-cheque", campos **Nome do arquivo** (`#cc-name`), **Mês/Período** (`#cc-period`), **Arquivo** (`#cc-file`, accept `.pdf,.png,.jpg`), botão "Adicionar arquivo".
- `saveCCFile()` (9044): exige nome; faz `files.push({id,name,period||'—',addedBy,addedAt})`. **Importante: o arquivo em si NÃO é armazenado** , só metadados (nome/período/quem/quando). O `<input type=file #cc-file>` é coletado mas ignorado no save. `deleteCC(id)` (9054) confirma "Remover este arquivo?".

Resumo: feature simples de "mural de contra-cheques" administrável pelo admin; visível a todos, gerenciável só por admin; não guarda o binário (apenas registro nominal). Útil documentar mas é candidato a redesign (sem upload real).

---

## 5. CONFIG ODOO (initOdooSettings / updateOdooStatus) , REFERÊNCIA (NÃO vai ao produto)

Tela `mod-odoo` (7268-7393), acessível em Ajustes → "Odoo API" (só admin). Persiste em `DB_ODOO_CONFIG='ig_odoo_api_settings_v1'` , **somente localStorage (protótipo)**; aviso explícito (7388): "esta tela salva a configuração do painel no navegador para o protótipo. Em produção, mantenha a senha/API key no backend/proxy seguro."

### 5.1 Defaults (`ODOO_DEFAULT_SETTINGS` 8221) e campos
Cards do form:
1. **Conexão e autenticação**: Status (Ativa/Inativa), Ambiente (Produção/Homologação/Desenvolvimento), Protocolo (JSON-RPC/XML-RPC/JSON-2 Bearer), Versão, URL base, Banco de dados, Usuário/e-mail, Método de auth (API key/Senha/Bearer), Senha/API key/token (campo password com toggle `toggleOdooSecret` 8310), Proxy do painel (`/api/odoo`), Timeout (s).
2. **Empresa, idioma e escopo**: company id, nome empresa, empresas liberadas (CSV ids), armazéns, locais de estoque, categorias de produto, idioma (`pt_BR`), fuso (`America/Sao_Paulo`).
3. **Modelos e endpoints**: auth endpoint (`/web/session/authenticate`), dataset endpoint (`/web/dataset/call_kw`), e nomes de modelos (product.template, product.product, stock.quant, stock.location, stock.lot, sale.order, sale.order.line, purchase.order, purchase.order.line, res.partner).
4. **Sincronização**: checkboxes (Estoque, Produtos, Seriais, Vendas, Compras, Parceiros), auto-sync sim/não, intervalo (min), lote por requisição, ler compras desde (data), domínio extra (textarea, ex. `[['active','=',true]]`).
5. **Segurança e webhooks**: origem autorizada, chave do webhook, rota webhook (`/api/odoo/webhook`), modo de logs (Somente erros/Resumo/Debug), observações internas.

### 5.2 Funções
- `initOdooSettings()` (8263): popula todos os campos a partir de `getOdooSettings()` (merge default+saved) e chama `updateOdooStatus` + `syncCompactOdooPanel`. Disparado por `navTo('odoo')` (8212).
- `getOdooSettings()` (8232) / `collectOdooSettings()` (8275) / `saveOdooSettings(silent)` (8293, valida URL+banco+usuário+key) / `resetOdooSettings()` (8304, confirm).
- `updateOdooStatus(cfg)` (8246): badge `#odoo-settings-status`. Estados: **"Conexão testada"** (classe `ok`, se `lastTest.ok`), **"Configuração salva"** (classe `warn`, se 4 campos preenchidos), **"Não configurado"** (default).
- `testOdooSettings()` (8314): salva silencioso e faz `fetch` real ao proxy (`/api/odoo`) com payload JSON-RPC `session/authenticate`; sucesso valida `result.uid`, grava `cfg.lastTest`. Mensagens de resultado em `#odoo-settings-result` (ok/err).
- `syncCompactOdooPanel` (8256): espelha url/db/user/key para um painel compacto do Mapa (`ou/odb/ous/opw`).

(Conforme briefing: documentado só para referência; não será reproduzido no produto final.)

---

## 6. VARREDURA FINAL , recursos fora dos módulos já cobertos

Módulos/telas (`mod-*`): home(6062), estoque(6139), demandas(6522), mapa(6760), vendas(6823), admin(7179), tela(7236), odoo(7268). Modais (`modal-*`): sales-compare(7062), sales-period(7097), monthpick(7398), event(7420), event-details(7483), event-delete(7492), user-delete(7507), event-filters(7522), uf-picker(7599), edit-user(7619), cc(7703), stock-ideal(10105).

Recursos relevantes a este módulo / ainda não cobertos:

1. **Tela de Login / Auth (`scr-auth`, 5944-5994)** , card "Icaro Group", subtítulo "Portal Interno — Acesso Restrito", strip "acesso restrito à diretoria". Forms login / registro / admin existem no markup, MAS registro público e modo demo estão **desativados** no JS (8100-8103). Único fluxo ativo: usuário+senha. Erro genérico. Sem "esqueci a senha". (Nota: há um typo no HTML , "Painel de Usuáriosistrativo" em 5949.)

2. **Menu lateral / Shell (sidebar, 5998-6058)** , hamburger `toggleSidebar` (colapsa), logo "Icaro Group", seção "Principal" (Início/Estoque/Demandas/Vendas, gavetas com `display:none` controladas por `applyDrawerAccess` 8155), seção "Menu" com "Ajustes" (`#nav-settings`, submenu expansível `toggleSettingsMenu` 8171) contendo **Painel de Usuários, Tela, Odoo API**. Rodapé: avatar/nome/role + dropdown (`toggleUserMenu`) com "Sair do portal" (`doLogout` 8180).

3. **Gating de navegação (applyDrawerAccess 8155 + hasPerm 8091)** , mostra/oculta cada `nav-*` por permissão; admin destrava Ajustes/Tela/Odoo; botões "Adicionar evento" e "Adicionar contra-cheque" também gated (home/admin).

4. **Aparência / Tema (`mod-tela`, 7236-7264)** , módulo "Tela": **Modo de exibição** (Escuro/Claro) e **Paleta** (Dourado/Cinza-Prata). `getAppearanceSettings`/`setAppearanceMode`/`setAccentPalette`/`applyAppearanceSettings` (7777-7811), persiste em `DB_APPEARANCE='ig_appearance_v1'`; aplica classes `theme-light`/`palette-silver` no body.

5. **Foto de usuário (avatar)** , upload base64 até 900KB (`handleEditUserPhoto` 9153, `setEditUserPhoto` 9136), exibida em avatar do sidebar e welcome bar.

6. **Confirmação genérica** , o app usa `alert()`/`confirm()` nativos do browser em vários pontos (criar/editar/remover usuário, CC, reset Odoo) , não há sistema de toast (busca por "toast" = 0 ocorrências).

7. **NÃO existe** (confirmado por busca): assistente de IA / chat / FAB flutuante; sistema de notificações (sino); exportação CSV (os únicos `download` são links `<a download>` para anexos de evento, `eventAttachmentsHtml` 8396-8401); busca global (só buscas locais por módulo, ex. busca de evento do dia). "fab"/"notif" no arquivo são falsos positivos ("fabricante", "demand-b8").

8. **`modal-stock-ideal` (10105)** e **`mod-mapa` (mapa SVG do Brasil, 6760 / `buildMap` 9373)** pertencem aos módulos Estoque e Vendas/Mapa (fora deste escopo), citados aqui só para fechar o inventário.

---

## 7. Notas de segurança / riscos a carregar para a reconstrução
- Senhas guardadas com `btoa` (base64), reversíveis (`decodePass`); "Senha atual" é exibida em texto claro no modal de edição. Em produção, hashing real (já previsto no stack Nexus: bcrypt).
- Permissões e usuários vivem em `localStorage` (protótipo). No produto, RBAC server-side.
- CC não persiste o binário; redesenhar com upload real se a feature for mantida.
- `renderPermTable`/grade `.perm-check` é código morto , a UI viva de permissões é a aba Permissões do modal de edição (`renderEditUserPerms`).
- Default de novo usuário deixa `vendas` indefinido (não liberado) e só `home=true`.
