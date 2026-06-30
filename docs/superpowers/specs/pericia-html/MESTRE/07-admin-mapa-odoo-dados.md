# Perícia HTML MESTRE , Capítulo 07: Admin / Usuários / Permissões / UF + Mapa órfão + Integração Odoo + Modelo de dados / Mocks

> Arquivo periciado: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html` (18.971 linhas).
> Todas as linhas citadas referem-se a esse arquivo. Citações verbatim conferidas linha a linha.
> Convenção: VIVO = roda no protótipo; MORTO = código presente mas inalcançável/no-op.

Este capítulo cobre, de forma exaustiva, quatro frentes interligadas:
1. Painel de Usuários (`#mod-admin`): tabela, abas, CRUD, badges, modal de edição, foto base64.
2. Permissões por gaveta e seletor de UF (escopo geográfico) + hierarquia comercial de 4 níveis.
3. O módulo Mapa órfão (`#mod-mapa`), que existe no DOM mas saiu do menu, com runtime completo.
4. Integração Odoo ao vivo (pipeline JSON-RPC) e o modelo de dados / mocks transversal do protótipo inteiro.

---

## 1. Painel de Usuários (`#mod-admin`)

### 1.1 Estrutura DOM (7178-7233)

O módulo abre em `7179` (`<div class="module" id="mod-admin">`) dentro de `.admin-container` (7180). É um dos sete módulos navegáveis (chave `admin` em `TITLES`, linha 8192: `Painel de Usuários`).

**Abas (`.admin-tabs`, 7183-7192):** dois botões.
- `#atab-users` (7184) "Usuários", `onclick="adminTab('users')"`, classe `active` por padrão. Ícone SVG de grupo de pessoas (7185).
- `#atab-create` (7188) "Criar Usuário", `onclick="adminTab('create')"`. Ícone SVG de pessoa com "+" (7189).

**Aba Usuários (`#apane-users`, 7195-7207, classe `active`):**
- Cabeçalho `.admin-section-header` (7197) com ícone roxo (`color:var(--purple)`), título `.admin-section-title` "Usuários Cadastrados" (7199) e botão `.cc-add-btn` "Atualizar" `onclick="adminRefresh()"` (7200).
- Tabela `.admin-table` (7202) com 8 colunas no `thead` (7203): `Nome | Usuário | Cargo | Hierarquia | UF(s)/Estado(s) | Permissões | Cadastro | Ação`.
- Corpo `<tbody id="admin-users-table">` (7204) com placeholder inicial `<td colspan="8" ...>Carregando…</td>`.

**Aba Criar Usuário (`#apane-create`, 7210-7230, `max-width:480px`):**
- Cabeçalho com ícone dourado (`color:var(--gold)`, 7213) e título "Criar Novo Usuário" (7214).
- Formulário (7216-7228) com os campos:
  - Nome completo: `#au-name` placeholder "Nome do colaborador" (7217).
  - Usuário de login: `#au-username` placeholder "ex: joao.silva" (7218).
  - E-mail: `#au-email` type email, placeholder "email@icaro.com" (7219).
  - Cargo: `#au-cargo` select com única opção `VENDEDOR` (7220).
  - Hierarquia: `#au-hierarchy` select com 4 opções (7221): `VENDEDOR REGIONAL`, `GERENTE COMERCIAL REGIONAL`, `SUB GERENTE COMERCIAL GLOBAL`, `DIRETOR COMERCIAL GLOBAL`.
  - UF(s)/Estado(s) (7222): rótulo com nota "(obrigatório para Vendedor/Gerente Regional)"; hidden `#au-uf`; linha `.uf-field-row` com `.uf-display.empty#au-uf-display` texto "Nenhuma UF selecionada" e botão "Editar" `onclick="openUfPicker('au-uf')"`; ajuda `.uf-help` explicando o picker e o TODOS.
  - Senha inicial: `#au-pass` type text, placeholder "Mínimo 6 caracteres" (7223). Atenção: type=text (senha visível em tela).
  - Nota (7224): "As permissões das gavetas podem ser definidas no botão Editar de cada usuário, na guia Permissões."
  - Erro `.auth-err#au-err` (7225).
  - Botão `#btn-admin-create-user` "Criar usuário" `onclick="adminCreateUser()"` (7226).
  - Nota final (7227) sobre login do usuário criado e recomendação de troca de senha.

### 1.2 Renderização da tabela , `adminRefresh()` (9060-9081) , VIVO

- Lê `getUsers()` (9061). Se vazio, mostra "Nenhum usuário cadastrado ainda." (9063).
- Para cada usuário (9064-9080) monta uma linha `<tr>`:
  - **Coluna Permissões** (9065): `DRAWER_KEYS.filter(k => u.permissions?.[k] || u.type==='admin').map(k=>DRAWERS[k]).join(', ')`; fallback "Nenhuma gaveta liberada".
  - `locked = u.id==='owner-icaro' || u.type==='admin'` (9066).
  - **Badges de papel (9068):** nome em destaque; se `locked` recebe `<span class="admin-pill pill-admin">Master</span>`; se tem foto recebe `<span class="admin-pill pill-user">Foto</span>`.
  - Coluna Usuário (9069): username + e-mail abaixo em fonte menor.
  - Cargo (9070): `u.cargo||u.role||'—'`.
  - Hierarquia (9071): `u.hierarchy||'—'`.
  - UF(s) (9072): `formatUfList(u)`.
  - Cadastro (9074): `u.createdAt` formatado `toLocaleDateString('pt-BR')`.
  - Ação (9075-9078): botão "Editar" `adminOpenEditUser('<id>')`; se não locked, botão "Remover" `adminDeleteUser('<id>')`. O Master não exibe botão Remover.

### 1.3 Troca de aba , `adminTab(tab)` (9082-9090) , VIVO

Itera `['users','create']`, alterna classe `active` em `atab-*` e `apane-*`. Ao entrar em `users`, chama `adminRefresh()` (9089).

> Observação: o caractere usado em `'—'` nos fallbacks do código (ex. 9069, 9070) é o travessão dentro de strings JS do protótipo original; é dado de origem, não texto desta perícia.

---

## 2. Modelo de usuário e persistência (base de tudo)

### 2.1 Chaves de armazenamento (7748) , VIVO

`localStorage` keys (linha 7748):
- `DB_USERS='ig_users_v17_login_corrigido_eventos_colaboradores_anexos'` (banco vigente).
- Legados para migração: `DB_USERS_OLD='ig_users'`, `DB_USERS_PREV='ig_users_v10_login_fixo_cargo_hierarquia_uf'`, `DB_USERS_PREV2='ig_users_v7_login_fixo'`.
- `DB_EVENTS='ig_events'`, `DB_CC='ig_cc'`, `DB_PERMS='ig_user_drawer_perms'` (legado de permissões, não usado pelo modelo atual), `DB_SESSION='ig_session_v17_...'`, `DB_APPEARANCE='ig_appearance_v1'`, `DB_ODOO_CONFIG='ig_odoo_api_settings_v1'`.

### 2.2 Usuário Master semente , `OWNER_USER` (7751-7770) , VIVO

Objeto fixo Ícaro: `id:'owner-icaro'`, `name:'Ícaro'`, `username:'icaro'`, `email:'icaro@icarogroup.com.br'`, `role/cargo:'VENDEDOR'`, `hierarchy:'DIRETOR COMERCIAL GLOBAL'`, `uf:''`, `ufs:[]`, `pass:btoa('icaro@2026')` (senha base64, NÃO criptografia), `type:'admin'`, `level:'admin'`, `permissions:{home,estoque,demandas,vendas,admin todos true}` (7764), além de `birthdate/cpf/cnpj/photo` vazios.

### 2.3 Vocabulário fixo (7771-7775) , VIVO

- `DRAWERS={home:'Início',estoque:'Estoque',demandas:'Demandas',vendas:'Vendas',admin:'Painel de Usuários'}` (7771).
- `DRAWER_KEYS=['home','estoque','demandas','vendas','admin']` (7772).
- `LEVELS={admin:'Administrador Master',usuario:'Usuário'}` (7773) , só dois níveis técnicos.
- `CARGOS=['VENDEDOR']` (7774) , único cargo.
- `HIERARQUIAS=['VENDEDOR REGIONAL','GERENTE COMERCIAL REGIONAL','SUB GERENTE COMERCIAL GLOBAL','DIRETOR COMERCIAL GLOBAL']` (7775).

### 2.4 Leitura + migração , `getUsers()` (7994-8086) , VIVO

- `parseUsers` (7997) protege contra JSON inválido.
- Se `DB_USERS` existe, parseia direto (8005-8006). Senão (primeira abertura desta versão, 8007-8029): junta usuários dos 3 bancos legados (`DB_USERS_PREV`, `DB_USERS_PREV2`, `DB_USERS_OLD`), exclui qualquer Ícaro antigo (id/username/email, 8021), deduplica por chave (8022-8024), e insere `{...OWNER_USER}` no topo (8027).
- Garante Ícaro presente (8031-8065): se não achar, `unshift(OWNER_USER)`; se achar, NÃO sobrescreve a senha (comentário 8036-8037), mas força `id:'owner-icaro'`, `type/level:'admin'`, permissões todas true (8052), normaliza hierarquia/UF, preenche campos vazios.
- Normaliza cada usuário (8066-8083): garante username (deriva de email/nome, 8067), cargo/role, hierarquia (default `VENDEDOR REGIONAL`, ou `DIRETOR COMERCIAL GLOBAL` se admin, 8070), `uf/ufs` via `normalizeUfList`, campos birthdate/cpf/cnpj/photo, e default de `permissions` (8079: `{home:true,estoque:false,admin:false}`), acrescentando chaves `estoque/demandas/vendas` se faltarem (8080-8082).
- Persiste se `changed` (8084).
- `saveUsers(u)` (8087): grava em `DB_USERS`. `decodePass(v)` (8088): `atob` protegido.

### 2.5 Login , `doLogin()` (8104-8118) e companhia , VIVO

- Stubs desativados (8099-8103): `selectRole`/`switchTab` (no-op), `doRegister` (erro "Cadastro público desativado..."), `doAdminLogin` (chama `doLogin`), `doDemo` (erro "Modo demonstração desativado...").
- `doLogin` (8104): lê `#l-email` (login por username OU email, normalizado) e `#l-pass`. Encontra usuário casando username OU email (8112) e validando senha por 3 caminhos (8114): `u.pass===btoa(pass)`, ou `decodePass(u.pass)===pass`, ou `String(u.pass)===pass` (texto puro legado). Erro "Usuário ou senha inválidos." Em sucesso chama `loginUser`.
- `refreshCurrentUserDisplay()` (8119-8143): calcula iniciais, detecta admin (`type==='admin'||permissions.admin`), pinta avatares `uav`/`wav` (foto base64 ou iniciais, 8125-8133), preenche `uname`/`urole`/`wname`/`wdate` e a pill `wrole-pill` ("Administrador Master" se admin). Chama `applyDrawerAccess()`.
- `loginUser(user)` (8144-8154): seta `CU`, troca telas (`scr-auth` -> `scr-app`), e dispara em sequência `buildMap();populateUF();rendTable();updColors();` (8149 , runtime do Mapa órfão, ver seção 9), `initCalendar();renderCC();` e a seleção do dia atual; se admin, `adminRefresh()`; navega para a primeira gaveta permitida na ordem home->estoque->demandas->vendas->admin (8153).

---

## 3. CRUD de usuários

### 3.1 Criar , `adminCreateUser()` (9091-9115) , VIVO

- Lê nome, username (via `normalizeUsername`), email (lower), cargo, hierarquia (via `normalizeHierarchyValue`), UFs (via `getUfSelectValues('au-uf')`), senha (9093-9100).
- Validações: obrigatórios nome/usuário/senha (9101); se hierarquia regional e sem UF, erro "Informe ao menos uma UF/Estado ou selecione TODOS para Vendedor Regional ou Gerente Comercial Regional." (9102); senha mínima 6 (9103); username duplicado (9105); email duplicado (9106).
- Cria o objeto (9107): `id:Date.now()`, `pass:btoa(pass)`, `type:'user'`, `level:'usuario'`, `permissions:{home:true,estoque:false,demandas:false,admin:false}` (note: `vendas` NÃO consta nesse default explícito, mas `getUsers` o injeta como false na próxima leitura).
- Limpa o form, reseta cargo/hierarquia/UF (9109-9112), faz `alert('Usuário "X" criado com sucesso!...')` (9113), volta para aba Usuários.
- `bindAdminCreateUserButton()` (9117-9126): liga o botão `#btn-admin-create-user` com guarda `dataset.bound` para evitar duplo bind.

### 3.2 Abrir edição , `adminOpenEditUser(id)` (9189-9211) , VIVO

Preenche o modal `#modal-edit-user` a partir do usuário: id, name, username, email, birthdate, CPF/CNPJ (mascarados via `maskCpfValue`/`maskCnpjValue`), cargo, hierarquia (com default admin = `DIRETOR COMERCIAL GLOBAL`, 9202), UFs (`setUfSelectValues('eu-uf',...)`), senha atual em claro via `decodePass` no campo readonly `#eu-current-pass` (9204), foto (`setEditUserPhoto`), e chama `renderEditUserPerms(u)` (9209). Abre o modal (9210).

### 3.3 Salvar edição , `adminSaveEditUser(evt)` (9212-9288) , VIVO

- Lê todos os campos (9215-9228), incluindo nova senha + confirmação.
- Validações (9230-9237): id presente; nome/username obrigatórios; UF obrigatória se regional; email válido por regex; CPF com 11 dígitos; CNPJ com 14 (ou vazio); nova senha >=6; confirmação confere.
- Checa duplicidade de username/email entre outros usuários (9243-9247).
- Atualiza o usuário (9249-9261), aplicando `btoa(newPass)` só se houver nova senha (9261).
- **Permissões (9263-9273):** se NÃO for master, lê todos os checkboxes `#eu-perm-list .eu-perm-check-input` e monta `u.permissions=Object.fromEntries(DRAWER_KEYS.map(k=>[k,!!perms[k]]))` (9268). Se for master, força todas true e `type/level='admin'` (9270-9272).
- `saveUsers` (9275). Se o usuário editado é o logado (`CU`), atualiza `CU`, grava em `DB_SESSION` e chama `refreshCurrentUserDisplay()` (9277-9281), reaplicando o acesso ao menu.
- Fecha modal, `adminRefresh()`, `renderPermTable()` (9285, ver MORTO em 6.5), `alert('Usuário atualizado com sucesso.')`.

### 3.4 Excluir , fluxo com modal de confirmação (9314-9345) , VIVO

- `PENDING_DELETE_USER_ID` (9314).
- `adminDeleteUser(id)` (9315-9326): bloqueia Master (9320) e bloqueia remover o próprio usuário logado (9321); senão guarda o id, escreve "Usuário: <nome>" em `#user-delete-name` (9324) e abre `#modal-user-delete`.
- `cancelDeleteUser()` (9327-9330): limpa pendência e fecha.
- `confirmDeleteUser()` (9331-9345): revalida as mesmas regras, filtra o usuário fora, salva, fecha, `adminRefresh()`, `renderPermTable()`, `alert('Usuário removido com sucesso.')`.

**Modal `#modal-user-delete` (7507-7520):** título "Remover usuário"; botão fechar -> `cancelDeleteUser()`; aviso `.event-delete-warning` com `.event-delete-title` "DESEJA EXCLUIR O USUÁRIO?" e `#user-delete-name` (texto default "Esta ação não poderá ser desfeita."); ações: botão danger "Excluir" -> `confirmDeleteUser()` e botão "Cancelar" -> `cancelDeleteUser()`.

---

## 4. Modal Editar Usuário (`#modal-edit-user`, 7619-7700)

`max-width:860px`, título "Editar usuário", fechar via `closeModal('modal-edit-user')`. Hidden `#eu-id` e `#eu-photo-data` (7624-7625).

### 4.1 Guias , `edit-user-tabs` (7627-7630) + `editUserTab` (9128-9135) , VIVO

Dois botões: `#eu-tab-info` "Informações do usuário" (active) e `#eu-tab-perms` "Permissões". `editUserTab(tab)` alterna classe `active` em `eu-tab-*` e nos panes `eu-pane-*`.

### 4.2 Pane Informações (`#eu-pane-info`, 7632-7682)

**Foto (`.photo-box`, 7636-7649):**
- `.photo-preview#eu-photo-preview` com texto inicial "Sem foto" (7637).
- Input file `#eu-photo-file` accept `image/*` (7641).
- Botões "Selecionar foto" (dispara o input, 7644) e "Remover foto" danger -> `removeEditUserPhoto()` (7645).
- Ajuda `.photo-help` "A foto será salva junto ao cadastro do usuário no navegador." (7647).

Funções da foto:
- `setEditUserPhoto(src)` (9136-9151): grava `src` no hidden `#eu-photo-data`; se tem src, limpa o texto, aplica `backgroundImage:url("<src>")` e borda sólida; senão volta a "Sem foto" e borda tracejada.
- `removeEditUserPhoto()` (9152): limpa foto e o input file.
- `handleEditUserPhoto(e)` (9153-9161): valida tipo imagem; **limite 900 KB** (9157, alerta "A foto deve ter no máximo 900 KB..."); usa `FileReader.readAsDataURL` (base64) e chama `setEditUserPhoto(reader.result)`. A foto é persistida como Data URL base64 dentro do objeto do usuário no localStorage.

**Campos pessoais (7651-7671):** Nome `#eu-name`; Login `#eu-username`; E-mail `#eu-email`; Data de nascimento `#eu-birthdate` (date); CPF `#eu-cpf` (maxlength 14, máscara); CNPJ `#eu-cnpj` (opcional, maxlength 18, máscara); Cargo `#eu-cargo` (só VENDEDOR); Hierarquia `#eu-hierarchy` (4 opções); UF(s) `#eu-uf` (hidden) + display `#eu-uf-display` "Nenhuma UF selecionada" + botão Editar -> `openUfPicker('eu-uf')` (7671).

Máscaras: `digitsOnly` (9162), `maskCpfValue` (9163-9166), `maskCnpjValue` (9167-9170).

**Seção Senha (7674-7681):** "Senha atual" `#eu-current-pass` readonly (mostra a senha decodificada, exposição em claro); "Mudar senha" `#eu-new-pass` e "Confirmar nova senha" `#eu-confirm-pass` (ambos type text).

### 4.3 Pane Permissões (`#eu-pane-perms`, 7684-7692)

Título "Permissões por gaveta lateral", texto "Selecione quais gavetas/abas do menu lateral este usuário poderá acessar." e o container `.eu-perm-list#eu-perm-list` (7690) preenchido por `renderEditUserPerms`.

Rodapé (7694-7698): erro `#eu-err`, botão "Cancelar" (`closeModal`) e botão `#btn-save-edit-user` "Salvar alterações".

---

## 5. Permissões (matriz por gaveta)

### 5.1 Granularidade real , VIVO

Permissão é **booleana por GAVETA do menu lateral**, 5 itens (`DRAWER_KEYS`). NÃO há permissão por tela interna, por seção, por ação CRUD nem por UF. `tela` (aparência) e `odoo` (config ERP) NÃO são permissões independentes: são derivadas de `admin`.

### 5.2 `hasPerm(drawer)` (8091-8098) , VIVO

- Sem `CU` -> false.
- `drawer==='tela'` ou `'odoo'` -> exige admin (`CU.type==='admin'||CU.permissions?.admin`) (8093-8094).
- drawer fora de `DRAWER_KEYS` -> false (8095).
- admin -> true (8096); senão `CU.permissions?.[drawer]` (8097).

### 5.3 `renderEditUserPerms(u)` (9171-9188) , VIVO , a UI real de permissões

- `locked = u.id==='owner-icaro' || u.type==='admin'` (9174).
- Para cada `drawer` de `DRAWER_KEYS` monta `.eu-perm-row` (9177): título `DRAWERS[drawer]`; subtítulo "Permissão obrigatória para Administrador Master" se locked, senão "Liberar ou bloquear esta gaveta no menu lateral" (9180); toggle `<input class="eu-perm-check-input" type="checkbox" data-drawer="..." checked? disabled?>` dentro de `.eu-switch` + `.eu-slider` (9182-9184). `checked` se `locked || u.permissions?.[drawer]`; `disabled` se locked.

### 5.4 `toggleUserDrawerPerm(id,drawer)` (9304-9312) , VIVO (porém ver 5.5)

Inverte `u.permissions[drawer]` (não atua em admin), salva, e chama `renderPermTable()` + `adminRefresh()`. É o handler usado SOMENTE pela tabela `renderPermTable` (que está morta), portanto na prática nunca é acionado pela UI atual. O salvamento real de permissões vive em `adminSaveEditUser` (3.3).

### 5.5 `renderPermTable()` / `resetPerms()` (9289-9313) , MORTO

`renderPermTable()` (9289) procura `document.getElementById('perm-table-body')` e retorna cedo se não existir (9292). **`perm-table-body` só aparece nessa única referência JS (9291); não existe nenhum elemento com esse id no DOM.** Logo a função é no-op em todo o protótipo, e as chamadas a ela (9285, 9311, 9343) não produzem efeito. `resetPerms()` (9313) só chama `renderPermTable()`, igualmente morta. A `.perm-check` (span clicável, 9299) e o `toggleUserDrawerPerm` por clique pertencem a essa tabela legada e nunca renderizam. CONCLUSÃO: a matriz "perm-check" antiga foi substituída pelos toggles do modal (`renderEditUserPerms`); marcar como código legado morto na reconstrução.

### 5.6 `applyDrawerAccess()` (8155-8170) , VIVO

Mostra/esconde itens do menu por `hasPerm`: `nav-home`, `nav-estoque`, `nav-demandas`, `nav-vendas`, `nav-settings-section` (block), `nav-settings`, `nav-admin`, `nav-tela`, `nav-odoo` (8157-8165). Esconde o submenu de Ajustes se não admin (8166-8167). Esconde o botão de adicionar evento `.a2-add-btn` se sem `home` (8168) e o `cc-add-btn` se sem `admin` (8169). Não há `nav-mapa` (confirmando o módulo Mapa órfão, seção 9).

### 5.7 Papéis (roles) , o que existe de fato

Apenas dois níveis técnicos (`LEVELS`, 7773): **`admin` = "Administrador Master"** (locked, todas as gavetas + tela + odoo, não editável/removível, não pode se auto-remover) e **`usuario` = "Usuário"** (acesso conforme `permissions`). NÃO existem "gerente"/"visualizador"/"super_admin". A hierarquia comercial (seção 6.4) é um eixo SEPARADO e não controla acesso a menu. Badges na tabela: `pill-admin` "Master" e `pill-user` "Foto" (9068).

---

## 6. Seletor de UF (escopo geográfico) e hierarquia comercial

### 6.1 Para que serve

A UF é **escopo de dado** (visibilidade geográfica), não permissão de menu. É obrigatória para hierarquias regionais (níveis 1 e 2) e ignorada para globais (3 e 4, que veem tudo). Aparece em dois campos (`au-uf` no criar, `eu-uf` no editar) e na regra de visibilidade de eventos do calendário (`regionalUfsCanSeeEvent`).

### 6.2 Conjunto e normalização (7833-7872) , VIVO

- `UFS` (7841): 27 unidades `AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO`.
- `normalizeUfValue` (7833): uppercase, remove acentos, mapeia `TODOS/TODAS/ALL`->`'TODOS'`, senão pega as 2 primeiras letras se A-Z.
- `normalizeUfList` (7842): split por `[;,|]`, dedup; se contém TODOS retorna `['TODOS']`; senão filtra só UFs válidas.
- Helpers: `ufListHasAll` (7848), `ufListContains` (7849), `ufListsOverlap` (7854), `formatUfList` (7860, retorna `'—'` vazio, `'TODOS'`, ou join), `userRegionalUfs`/`userRegionalUf` (7866-7872).

### 6.3 Campo UF (display + binds) , VIVO

- `renderUfFieldDisplay(id)` (7873-7881): pinta `#<id>-display`. Vazio -> classe `empty` + "Nenhuma UF selecionada". TODOS -> `<span class="uf-tag">TODOS</span>` + "Todas as UFs vinculadas". Senão um chip `.uf-tag` por UF.
- `setUfSelectValues` (7882), `getUfSelectValues` (7893) (lê de SELECT ou input hidden), `bindUfMultiSelects` (7904, liga change em `au-uf`/`eu-uf`, com regra de TODOS exclusivo).

### 6.4 UF Picker (modal `#modal-uf-picker`, 7599-7617) , VIVO

DOM: título "Selecionar UF(s)", fechar `closeUfPicker()`, hidden `#uf-picker-target` (7603), texto explicando que TODOS desmarca individuais (7604-7606), ferramentas (7607-7610: botões "Marcar TODOS" -> `ufPickerSelectAll()`, "Limpar seleção" -> `ufPickerClear()`), grid `#uf-picker-grid` (7611), ações (7612-7615: "Salvar UFs" -> `saveUfPicker()`, "Cancelar" -> `closeUfPicker()`).

Funções (7920-7979):
- `UF_PICKER_SELECTED` (7920) estado.
- `ufPickerOptions()` (7921): primeiro `{value:'TODOS',label:'TODOS — Todas as UFs'}` depois cada UF como `"<UF> — <Nome>"` (nome de `UF_FULL`).
- `renderUfPickerGrid()` (7924): cards `.uf-check-card` com checkbox, classe `checked`, `onclick="toggleUfPickerValue('<v>')"` e suporte a teclado (Enter/Espaço).
- `openUfPicker(targetId)` (7936): valida o campo, **reanexa o modal ao body** (7940, evita ficar dentro de container com overflow), seta o target, carrega `UF_PICKER_SELECTED=getUfSelectValues(targetId)`, renderiza e abre o modal.
- `toggleUfPickerValue(v)` (7946): TODOS alterna exclusivo (limpa individuais); UF individual remove TODOS e alterna a si própria.
- `handleUfPickerCheck` (7960), `ufPickerSelectAll` (7964: `['TODOS']`), `ufPickerClear` (7968: `[]`), `saveUfPicker` (7972: aplica ao campo via `setUfSelectValues` e fecha), `closeUfPicker` (7977).

### 6.5 Hierarquia comercial , 4 níveis (eixo separado) , VIVO

- `HIERARCHY_LEVELS` (7813-7818): `VENDEDOR REGIONAL`=1, `GERENTE COMERCIAL REGIONAL`=2, `SUB GERENTE COMERCIAL GLOBAL`=3, `DIRETOR COMERCIAL GLOBAL`=4.
- `normalizeHierarchyValue` (7819-7827): aceita sinônimos (ex. "VENDEDOR", "GERENTE REGIONAL", "GERENTE COMERCIAL GLOBAL", "DIRETOR") e mapeia para o nome canônico; default `VENDEDOR REGIONAL`.
- `hierarchyLevelOf(user)` (7828); `isRegionalHierarchyValue(v)` (7829-7832): true para níveis 1 e 2 (os que exigem UF).
- O select `#au-hierarchy`/`#eu-hierarchy` lista os 4 níveis. Esse eixo define visibilidade de dado, não acesso a gaveta.

### 6.6 Regra de visibilidade por UF , `regionalUfsCanSeeEvent(viewer,creator,ev)` (7980-7988) , VIVO

Viewer sem UF -> não vê (false). Viewer TODOS -> vê tudo. Senão, se o evento tem UF, casa a UF do evento (`ufListContains`); senão decide por overlap com as UFs do criador (`ufListsOverlap`). Usado no calendário (módulo Home), citado aqui por ser o consumidor do escopo UF.

---

## 7. Módulo Mapa órfão (`#mod-mapa`)

### 7.1 Status de órfão , CONFIRMADO

- `mod-mapa` aparece em apenas 2 linhas: CSS (411) e DOM (6760). Não há `nav-mapa`, não há `onclick="navTo('mapa'...)`, não há item ">Mapa<" no sidebar, e `TITLES` (8192) NÃO tem a chave `mapa`. Logo `navTo` não consegue abrir o módulo e ele nunca fica visível.
- Porém o runtime do Mapa É EXECUTADO no login: `loginUser` (8149) chama `buildMap();populateUF();rendTable();updColors();`. Ou seja, o protótipo monta o mapa invisível toda vez que alguém entra. Comportamento órfão: código vivo alimentando DOM nunca exibido.
- Conclusão para reconstrução: decidir entre (a) reativar como tela de "Distribuição por estado", ou (b) remover por completo. É o único ponto do protótipo com UI de conexão direta ao Odoo (seção 8).

### 7.2 DOM (6759-6818)

**Barra de filtros `.mapa-filters` (6761-6779):**
- Busca `.mf-si` com input `#msi` placeholder "Buscar modelo, cliente, UF…" (6764).
- Select `#mfuf` "Todos os estados" (6766, populado por `populateUF`).
- Select `#mfst` de status (6767-6773): "Todos os status", `sale`=Confirmado, `done`=Entregue, `draft`=Rascunho, `cancel`=Cancelado.
- Botões "Filtrar" -> `applyF()` (6774) e "Limpar" -> `clearF()` (6775).
- `#mchips` (chips de filtro ativo, 6776).
- Botão "Sync Odoo" -> `syncOdoo()` (6777) e status `#msyt` "não sincronizado" (6778).

**Corpo `.mapa-wrap` (6780-6817):**
- Esquerda `.map-left` (6781-6789): cabeçalho "Pedidos" + badge `#mrc` (0); tabela `.maptbl` colunas Cliente/Modelo/UF/Prazo; `<tbody id="mtb">` com placeholder "Use os filtros para buscar".
- Centro `.map-center` (6790-6800): título "Brasil — Distribuição por Estado", legenda "Menor [barra] Maior"; `.map-area` com overlay de loading `#mov` (`#movmsg` "Carregando…") e o SVG `#bsvg` (preserveAspectRatio xMidYMid meet); tooltip `.map-tt#mtt`.
- Direita `.map-right` (6801-6816): 3 KPIs (`.mkpi` Total `#mkt` "pedidos"; Média/Estado `#mkm` + `#mks2`; Líder `#mklid` dourado + `#mks3`), todos com valor inicial "—"; barchart "Top Estados" `#mte` ("Sem dados"); e o painel Odoo embutido (ver 8.1).

### 7.3 Runtime do Mapa , VIVO (no DOM invisível)

- `buildMap()` (9373-9391): seta `viewBox=GEO_VB`, limpa o SVG, injeta um `<path>` por estado de `GEO` (id `s<UF>`, classe `st`), liga hover (`showMTT`/`moveMTT`/`hideMTT`) e click (`filterUF`), e adiciona um `<text>` com a sigla para todos exceto `DF` (9383-9388). Chama `updColors`.
- `updColors()` (9392-9403): conta pedidos por UF em `MFD`, acha o máximo. Estado sem pedido -> fill quase transparente. Estado com pedido -> **fórmula heatmap**: `r=n/mx`, `a=0.15+r*0.78`, `g2=round(169*(1-r*.8))`, `b2=round(110*(1-r*.8))`, `fill=rgba(200,g2,b2,a)`, stroke `rgba(200,140,60,.7)` (9399-9400). Chama `updMKPIs` e `updMBars`.
- Tooltip: `showMTT(e,uf)` (9404) "<UF> — <nome>" + "N pedido(s)"; `moveMTT` (9411) segue o cursor; `hideMTT` (9412) opacidade 0.
- KPIs: `updMKPIs(cnt,mx)` (9413-9420): total, média/estado (`tot/estados`), líder (UF com mais pedidos); `animN(id,tgt)` (9421-9424) faz count-up de 600ms via `requestAnimationFrame`.
- Barras: `updMBars(cnt)` (9425-9430): top-6 UFs, barras horizontais `.mbar-row` proporcionais; "Sem dados" se vazio.
- Tabela: `rendTable()` (9431-9436): preenche `#mrc` com `MFD.length` e o `#mtb` com Cliente/Modelo/UF/Prazo; "Nenhum resultado" se vazio. `hiR(i)` (9437-9440): marca linha ativa e dá **flash brightness(1.8) por 700ms** no estado correspondente.
- Filtros: `applyF()` (9441-9447): filtra `MALL` por busca (cliente/modelo/UF), UF e status, monta os chips (🔍 busca, 📍 UF, ● status) e re-renderiza. `clearF()` (9448) reseta. `cS/cU/cT` (9449-9451) limpam cada filtro. `filterUF(uf)` (9452): **stub no-op** com comentário "Mapa de Vendas removido do menu lateral." (clique no estado não filtra). `populateUF(data)` (9453-9456): popula `#mfuf` com as UFs presentes nos dados.

---

## 8. Integração Odoo ao vivo (pipeline JSON-RPC)

> Nota do briefing: documentado 100%, porém NÃO vai ao produto final. O acesso oficial ao Odoo é via worker/cache; este pipeline é referência.

### 8.1 Painel Odoo embutido no Mapa (`.odoo-pnl`, 6806-6815)

- Cabeçalho "Odoo ERP" com `.odoo-dot` (6807).
- Status `.odoo-status` com indicador `#ooi` (classe `off`/`on`) e texto `#ootx` "Desconectado" (6808).
- Inputs: `#ou` (URL Odoo), `#odb` (Database), `#ous` (Usuário/E-mail), `#opw` (Senha ou API Key, type password) (6809-6812).
- Botões "Conectar" -> `connectOdoo()` (6813) e "Desconectar" -> `disconnectOdoo()` (`#mbtnDisc`, escondido por padrão, 6814).

### 8.2 Estado vivo

`let MALL=[...DEMO],MFD=[...DEMO],MOC=false,MOG={}` (9371). `MALL` = dataset completo, `MFD` = filtrado (o que renderiza), `MOC` = flag "conectado ao Odoo", `MOG` = credenciais da sessão Odoo (`{url,db,uid,password}`).

### 8.3 `rpc(ep,payload)` (9457-9464) , VIVO

POST ao proxy `cfg.proxyPath || '/api/odoo'` (9460) com `{baseUrl,url,endpoint:ep,payload,timeout}` (9461). Lança erro em HTTP não-ok (9462) ou em `d.error` (9463); retorna `d.result`. Usa `getOdooSettings()` para baseUrl/timeout.

### 8.4 `connectOdoo()` (9465-9486) , VIVO

Lê `ou/odb/ous/opw` (ou os settings salvos como fallback, 9466-9470). Exige os 4 campos (9471). Mostra overlay (9472). Faz `rpc('/web/session/authenticate', {db,login,password})` (9474); exige `r.uid` (9475). Guarda `MOG={url,db,uid,password}`, `MOC=true` (9476). Persiste em `DB_ODOO_CONFIG` com `lastTest.ok=true` e atualiza status (9478-9481). Liga indicadores (`#ooi`->on, `#ootx`->"Conectado", mostra `#mbtnDisc`) e chama `loadOdoo()` (9482-9483). Erros via `alert`.

### 8.5 `loadOdoo()` (9487-9509) , VIVO , pipeline de 3 chamadas

1. `sale.order` `search_read` (9490): domínio `[['state','in',['sale','done']]]`, fields `name,partner_id,partner_shipping_id,state,commitment_date,date_order`, `limit:300`, `context:{lang:'pt_BR'}`. Se vazio, alerta "Nenhum pedido encontrado." (9491).
2. `res.partner` `read` (9493): ids de entrega/cliente coletados (9492), fields `id,name,state_id`. Monta mapa `pm` (9494).
3. `sale.order.line` `search_read` (9496): domínio `[['order_id','in',oids]]`, fields `order_id,product_id`, `limit:600`. Pega a primeira linha por pedido (`lm`, 9497).
- Monta o resultado (9498-9504): UF parseada de `partner.state_id[1]` (9499-9500) com 3 estratégias (split por `' - '`, split por `'-'` pegando o último, ou as 2 primeiras letras maiúsculas, fallback `'??'`); modelo da 1ª linha (`product_id[1]`, fallback `'N/D'`); prazo de `commitment_date||date_order` formatado pt-BR (fallback "A definir"); objeto final `{c:partner_id[1], m:modelo, u:uf, p:prazo, s:state}`, mesmo schema do `DEMO`.
- Atualiza `MALL=MFD=result`, `populateUF`, `rendTable`, `updColors`, e o `#msyt` com hora + contagem (9505-9506). Erros via `alert('Erro Odoo: ...')`.

### 8.6 `syncOdoo()` / `disconnectOdoo()` (9510-9515) , VIVO

`syncOdoo` recarrega via `loadOdoo` se `MOC`, senão alerta "Conecte ao Odoo primeiro." `disconnectOdoo` zera `MOC/MOG`, volta `MALL/MFD` para `DEMO`, reseta indicadores e re-renderiza.

### 8.7 Config Odoo nos Ajustes (módulo `odoo`) , VIVO (form), REFERÊNCIA

Acesso via `navTo('odoo')` (chave `odoo` em TITLES "Odoo API"), gated por admin (`hasPerm('odoo')`).

- `ODOO_DEFAULT_SETTINGS` (8221-8229): conexão (`enabled:false`, `environment:production`, `protocol:jsonrpc`, `version:18`, `baseUrl/database/username/apiKey` vazios, `authMethod:api_key`, `proxyPath:/api/odoo`, `timeout:30`); empresa/escopo (`companyId/companyName/companyIds/warehouseIds/locationIds/categoryIds`, `lang:pt_BR`, `timezone:America/Sao_Paulo`); endpoints (`authEndpoint:/web/session/authenticate`, `datasetEndpoint:/web/dataset/call_kw`); `models` (10 modelos: product.template, product.product, stock.quant, stock.location, stock.lot, sale.order, sale.order.line, purchase.order, purchase.order.line, res.partner); `sync` (6 toggles stock/products/serials/sales/purchases/partners + autoSync false, interval 30, batchLimit 300, dateFrom, extraDomain); `security` (allowedOrigin, webhookSecret, webhookPath:/api/odoo/webhook, logLevel:errors, notes); `lastTest:null`, `lastSaved:null`.
- `getOdooSettings()` (8232-8241): merge default + salvo (com merge profundo de models/sync/security).
- `initOdooSettings()` (8263-8274): popula TODOS os inputs do form a partir de `cfg` (ids `odoo-*`, ver 8265-8272), e chama `updateOdooStatus` + `syncCompactOdooPanel`. Disparado por `navTo('odoo')`.
- `updateOdooStatus(cfg)` (8246-8255): badge `#odoo-settings-status`. Estados: "Conexão testada" (classe `ok`, se `lastTest.ok`), "Configuração salva" (classe `warn`, se os 4 campos preenchidos), "Não configurado" (default).
- `syncCompactOdooPanel(cfg)` (8256-8262): espelha baseUrl/database/username/apiKey para o painel compacto do Mapa (`ou/odb/ous/opw`).
- `collectOdooSettings()` (8275-8286): lê o form de volta em objeto, com defaults por campo.
- `saveOdooSettings(silent)` (8293-8303): valida os 4 obrigatórios (8295), grava em `DB_ODOO_CONFIG`, atualiza status + painel compacto; mensagem de sucesso (8301).
- `resetOdooSettings()` (8304-8309): confirm, remove a chave, re-inicializa.
- `toggleOdooSecret()` (8310-8313): alterna type password/text no `#odoo-api-key`.
- `testOdooSettings()` (8314-8336): salva silencioso, faz `fetch` real ao proxy com payload `session/authenticate` (8319-8320); sucesso valida `result.uid`, grava `lastTest.ok` (8326-8329); falha grava `lastTest.ok=false` e mostra a mensagem de erro (8330-8334). Resultado em `#odoo-settings-result` (classes ok/err).

---

## 9. Modelo de dados / Mocks (transversal)

Inventário de TODA fonte de dado mock, com o que cada uma alimenta. Isto é o catálogo do que precisa virar dado REAL do cache na reconstrução.

### 9.1 `DEMO` , 20 pedidos hardcoded (9349-9370) , MOCK , alimenta Mapa + Demandas + Vendas

Array de 20 objetos schema `{c:cliente, m:modelo, u:uf, p:data BR, s:status}`. Modelos: `T600X`, `E200`, `C100`. Status: `sale`, `done`, `draft`, `cancel`. Exemplos: `{c:"Academia Força Total",m:"T600X",u:"SP",p:"15/07/2025",s:"sale"}` (9350) ... `{c:"BodyMax Santos",m:"E200",u:"SP",p:"11/08/2025",s:"sale"}` (9369). UFs presentes: SP, MG, RJ, RS, PR, PA, PE, BA, GO, DF, AM, CE, RN, SC, MT.
- Alimenta o Mapa via `MALL/MFD` (9371).
- Alimenta Demandas via `demandBaseRows()` (13967-13969): usa `window.MALL || MALL || DEMO`.
- Alimenta Vendas via `salesRowsFromDemand` (16243-16245) e `salesClosedOrderRows` (16556), mesmo fallback.
- **Troca mock<->Odoo:** `connectOdoo/loadOdoo` substituem `MALL/MFD` por dados reais (mesmo schema); `disconnectOdoo` volta para `DEMO`. Esse é o ponto exato em que o dado real entraria.

### 9.2 Geometria do mapa , `GEO` / `GEO_VB` / `UF_FULL` (7717, 7747) , DADO ESTÁTICO (não substituir)

`GEO` (paths SVG dos 27 estados, com `d/cx/cy`), `GEO_VB` (viewBox), `UF_FULL` (nome completo por sigla, derivado de `GEO`). São geometria, não dado de negócio; permanecem estáticos.

### 9.3 Estoque , `STOCK_*` (9518-9569) , MOCK , alimenta módulo Estoque

- `STOCK_LOCATIONS` (9518-9524): 5 depósitos `{name,search,value}` (CEILÂNDIA, VICENTE PIRES, SERGIPE, VALINHOS, JARINU) com `value` numérico mock.
- `STOCK_TABLE_LOCATIONS` (9525): as 5 colunas de localização.
- `STOCK_IDEAL_STORAGE_KEY='stock_ideal_config_v73'` (9526): chave de persistência do "estoque ideal" editável.
- `STOCK_CATEGORIES` (9527): FORÇA, CARDIO, PESO LIVRE, ACESSÓRIOS, EXTRAS.
- `STOCK_SUPPLIERS` (9528): JOHNSON, LONG LIFE, XMASTER, BODY JOY.
- `STOCK_PRODUCTS` (9529-9548): **gerado por fórmula**, 48 itens. Para cada `n=idx+1`, `base=(n%9)+1`: `product:'Modelo catálogo NNN'`, categoria/fornecedor ciclados, `demanda:base*12+n`, `disponiveis:base*18+n`, `ideal:45+base*6+n`, e `qty` por localização (`CEILÂNDIA:base*3+n`, `VICENTE PIRES:base*2+n`, `SERGIPE:base+n`, `VALINHOS:base*4+n`, `JARINU:base*5+n`). Todos os números do estoque saem daqui.
- `STOCK_SERIALS` (9549-9569): **gerado por fórmula** a partir de `STOCK_PRODUCTS`; cada produto gera `4+(idx%4)` seriais com `serial:'SER-NNN-SSSS'`, `cost:850+(idx%12)*185+(idx+1)*11+seq*37`, `purchaseDate`/`arrivalDate` calculadas e `leadDays`. Alimenta a aba Seriais.
- Estado vivo: `ACTIVE_STOCK_LOCATION` (9570), `STOCK_IDEAL_MAP` (9571).
- Helpers: `normalizeStockText` (9572), `formatStockCurrency` (9575), `formatStockISODate` (9578), `formatStockDate` (9584), `getStockLeadDays` (9590), `formatLeadDays` (9597).

### 9.4 Compras , `STOCK_PURCHASE_ORDERS` (11143+) , MOCK , alimenta Compras

Array de ordens de compra hardcoded `{id,label,supplier,purchaseDate,arrivalDate,user,freight,amountPaid,items:[{model,qty,deliveredQty,unitCost,category}]}`. Exemplos: `PO-2026-001` "COMPRA 001" Johnson, frete 4200, pago 61500, 4 itens (esteira/bike/remada/supino, 11144-11159); `PO-2026-002` "COMPRA 002" Long Life (11160-11174). Alimenta a tela de Compras (ativas/entregues) e é fonte para `salesBrandFromModel` cruzar marca por modelo (16221-16225).

### 9.5 Demandas , helpers e valores mock (13937-13980) , MOCK , alimenta Demandas

- `demandUnitValue(model)` (13937-13945): **preço unitário mock por modelo** via heurística de string (t600/esteira=42000, e200/eliptico=18000, c100/climb=26000, bike=14500, forca/force=22000, default=16000).
- `demandInferQty(row,idx)` (13946-13952): quantidade inferida quando ausente (t600=1+idx%2, e200=1+idx%3, default 1).
- `demandStatus` (13953), `demandIsLate` (13960), `demandBaseRows` (13967, fonte `MALL/DEMO`), `getDemandOrders` (13971) que monta os pedidos de demanda combinando status, qty, total (valor real do row OU `demandUnitValue*qty`, 13976), pendências e atrasos.

### 9.6 Demandas B8 , `moreSampleSales` (15749-15762) , MOCK , alimenta gráfico B8

12 vendas de amostra `{model,qty,date}` (ESTEIRA MOVEMENT R4, BIKE ERGOMÉTRICA B75, etc.). Patcheia `window.demandB8Rows` (15774-15781) acrescentando essas linhas (`isSampleB8:true`) à base, sob guarda `__DEMAND_B8_MORE_SAMPLE_PATCHED__`.

### 9.7 Vendas , marca, vendedor e linhas mock , MOCK , alimenta módulo Vendas

- `salesNormalizeBrand(value)` (16204-16211): canoniza marcas (Johnson, Long Life, XMaster, Body Joy, Vision, Movement, Kikos, Technogym, Life Fitness, Matrix, Athletic).
- `salesBrandFromModel(model)` (16213-16233): deduz a marca cruzando com `STOCK_PRODUCTS` (16217-16219) e `STOCK_PURCHASE_ORDERS` (16221-16225), com fallback por heurística de string; default "Marca não informada".
- `salesBrandFromRaw` (16235), `salesIsOrderClosedForSales` (16239), `salesRowsFromDemand` (16243).
- `salesClosedFallbackSeller(uf,idx)` (16547-16550): **vendedor mock por UF** (mapa regional: SP=Marina Costa, RJ=Rafael Lima, MG=Bruna Alves, etc.) com fallback ciclando 4 nomes (Ana Beatriz, Carlos Mendes, Juliana Prado, Felipe Castro).
- `salesClosedOrderRows` (16551-...): monta a tabela de pedidos fechados sobre `demandBaseRows`/`DEMO`, preenchendo client/uf/margin/total/seller/date/status com fallbacks mock (preço por modelo, custo, vendedor).
- `mockRows(card)` (17918-...): **gerador procedural** dos comparativos de Vendas C8/C9. Usa `SALES_COMPARE_CONFIG`, `UF_MULT`, `BRAND_MULT`, `BRANDS` e período para fabricar totais/margens/pedidos sintéticos por marca (base 182000/218000 conforme card, multiplicadores de UF e marca, ruído determinístico). Tudo fictício.

### 9.8 Tabela-resumo das fontes mock e o destino real

| Fonte mock | Linhas | Schema/efeito | Vira dado real de |
|---|---|---|---|
| `DEMO` | 9349-9370 | 20 pedidos `{c,m,u,p,s}` | cache `fato_*` de vendas (sale.order + res.partner UF + linha) |
| `STOCK_PRODUCTS` | 9529-9548 | 48 produtos por fórmula (demanda/disponíveis/ideal/qty por depósito) | cache de estoque (stock.quant por local) |
| `STOCK_SERIALS` | 9549-9569 | seriais por fórmula (custo/datas/lead) | cache de seriais (stock.lot) |
| `STOCK_PURCHASE_ORDERS` | 11143+ | ordens de compra com itens | cache de compras (purchase.order + linhas) |
| `STOCK_LOCATIONS` | 9518-9524 | 5 depósitos + valor | stock.location reais |
| `demandUnitValue` | 13937 | preço unit. heurístico | preço real do produto/linha |
| `moreSampleSales` | 15749 | 12 vendas amostra B8 | linhas reais de venda |
| `salesClosedFallbackSeller` | 16547 | vendedor por UF | user_id/salesperson real |
| `salesNormalizeBrand`/`salesBrandFromModel` | 16204/16213 | marca por heurística | fornecedor/marca real do produto |
| `mockRows` | 17918 | comparativos C8/C9 procedurais | agregados reais por período/UF/marca |

---

## 10. Vivo vs Morto , resumo do capítulo

**VIVO (executa e tem efeito):** todo o `#mod-admin` (abas, tabela, CRUD), `getUsers`/migração, `doLogin`/`loginUser`, `hasPerm`/`applyDrawerAccess`, `renderEditUserPerms`, `adminSaveEditUser` (persistência de permissões), foto base64, máscaras CPF/CNPJ, todo o seletor de UF e hierarquia, todo o runtime do Mapa (mesmo invisível), todo o pipeline Odoo (`rpc/connect/load/sync/disconnect`) e a Config Odoo dos Ajustes, e todos os mocks listados na seção 9.

**MORTO (presente, sem efeito):**
- `renderPermTable()`/`resetPerms()`/`.perm-check`/`toggleUserDrawerPerm` via tabela: `perm-table-body` não existe no DOM (só referência em 9291). As chamadas em 9285/9311/9343 são no-op.
- `filterUF(uf)` (9452): stub vazio (clique no estado não filtra), por o Mapa ter saído do menu.
- Stubs de auth desativados: `selectRole`, `switchTab`, `doRegister`, `doDemo` (8099-8103).

**ÓRFÃO (vivo mas inalcançável pela navegação):** o módulo `#mod-mapa` inteiro , montado no login (8149) mas sem item de menu, sem `navTo('mapa')` e sem chave em `TITLES`.

---

## 11. Notas de segurança / riscos a carregar para a reconstrução

- Senhas em `localStorage` apenas em base64 (`btoa/atob`), reversíveis (`OWNER_USER.pass`, `decodePass`); a senha atual é exibida em claro no modal de edição (7676, 9204) e a senha inicial é type=text (7223). Em produção: hash forte server-side, nunca expor.
- Credenciais Odoo (URL/DB/usuário/API key) ficam em `DB_ODOO_CONFIG` no navegador e são espelhadas para o painel do Mapa (`syncCompactOdooPanel`). Em produção isso some: o acesso ao Odoo é só pelo worker/cache, conforme decisões canônicas do projeto.
- Toda a base de usuários, permissões, eventos e contra-cheques é client-side (localStorage), single-device. Migração entre versões de chave (`DB_USERS_*`) é heurística e pode duplicar/perder usuários em casos de borda.
- Permissão é grossa (por gaveta). Se a plataforma precisar de RBAC por tela/ação/UF, o modelo do protótipo é insuficiente e serve só como ponto de partida visual.
- O pipeline `loadOdoo` deriva UF de `res.partner.state_id[1]` por parsing de string frágil (3 fallbacks até `'??'`); o cache real deve resolver UF de forma estruturada (id do estado), não por split de label.
