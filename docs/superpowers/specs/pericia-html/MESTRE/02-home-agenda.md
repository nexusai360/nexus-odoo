# Perícia Forense MESTRE , Capítulo 02: HOME + AGENDA/CALENDÁRIO + CENTRAL DE ARQUIVOS (Contracheques)

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Protótipo HTML monolítico (18.971 linhas, JS/CSS/HTML vanilla, persistência 100% em `localStorage`).
> Escopo deste capítulo: a tela Início (`#mod-home`) inteira: barra de boas-vindas, a Agenda/Calendário
> (colunas A1 + A2), todos os modais e funções da agenda, e a Central de arquivos / Contracheques (CC, coluna A3).
> Cobertura exaustiva: cada bloco, função, campo, clique, hover, animação, estado vazio e texto exato, com nº de linha real.
> Nada inventado. Onde o protótipo é legado/morto ou candidato a redesign, está marcado.

Consolida e expande: `05-agenda.md` (agenda completa), `06-permissoes-uf-odoo-extras.md` §4 (CC) e §3.6 (hierarquia),
`audit/faixa-01.md` §4 (Home) e `audit/faixa-04.md` §5/§6 (agenda e CC), todos reverificados linha a linha contra o HTML.

---

## 0. Visão geral da tela Início

A tela Início **não tem módulo de agenda separado**: a agenda vive dentro da própria Home
(`<div class="module active" id="mod-home">`, linha 6062). É a única `module` com classe `active`
no carregamento (tela default pós-login).

Estrutura do contêiner (HTML 6063, CSS 6062/158-179, 593):

- `#mod-home` , `overflow:hidden;padding:18px` (linha 158).
- `.home-container` (linha 159 + 6063) , CSS Grid de **2 colunas x 3 linhas**, com `grid-template-areas`
  nomeando 4 zonas: `welcome` (linha topo, full width), `a1` (calendário, esquerda), `a2` (painel do dia, direita),
  `a3` (central de arquivos). Ordem visual de cima para baixo: barra de boas-vindas; embaixo, lado a lado,
  calendário (A1) e painel do dia (A2); embaixo de tudo, a faixa da central de arquivos (A3).
- **Responsivo** (linha 593, media query): `.home-container` colapsa para `grid-template-columns:1fr`
  e `grid-template-rows:auto 1fr 150px` com áreas `"welcome" "a1" "a3"` , no mobile a coluna A2 (painel do dia)
  some do grid e sobra welcome + calendário + central de arquivos empilhados.

Ordem dos blocos no DOM (6063-6135):
1. `.welcome-bar` (6064-6071) , área `welcome`.
2. `.cal-a1` (6073-6085) , área `a1`, a grade do calendário.
3. `.cal-a2` (6087-6121) , área `a2`, o painel do dia.
4. `.cc-section` (6124-6134) , área `a3`, a central de arquivos / contracheques.

---

## 1. Barra de boas-vindas (`.welcome-bar`)

HTML 6064-6071. CSS 170-179, 172-173, 355.

Composição:
- `.welcome-avatar#wav` (6065) , quadrado 44x44 arredondado (`border-radius:12px`, linha 172), gradiente dourado
  (`linear-gradient(135deg,var(--gold),var(--gold2))`), fonte Space Grotesk 800. Texto default `?`. Variante admin
  `.admin-av` (linha 173) usa gradiente roxo (`var(--purple)`→`#6B4FA0`) e texto branco.
- `.welcome-text` com:
  - `.welcome-title` , "Bem-vindo, " + `<span id="wname">—</span>` (default "—").
  - `.welcome-sub#wdate` , default "—".
- `.welcome-role-pill#wrole-pill` (6070) , pílula dourada (CSS 178: fundo `--gold-bg`, borda dourada, texto `--gold`,
  fonte Space Grotesk 600). Variante `.admin-pill` (CSS 179) vira roxa (fundo/borda/texto roxos). Texto default "Usuário".
- Detalhe visual: `.welcome-bar::before` (linha 171) desenha uma faixa de 2px no topo, gradiente
  `linear-gradient(90deg,var(--gold),transparent)` cobrindo 40% da largura (acento dourado).

Preenchimento dinâmico , `refreshCurrentUserDisplay()` (8120-8145):
- `init` (8121) = iniciais do nome: `(CU.name||'?').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase()`
  (até 2 letras, ex.: "João Vitor" => "JV").
- `isAdmin` (8122) = `CU.type==='admin' || !!CU.permissions?.admin`.
- Avatares `uav` (sidebar) e `wav` (home), loop 8123-8132:
  - alterna classe `.admin-av` conforme `isAdmin`;
  - se `CU.photo` existe => zera texto e aplica `background-image:url(photo)` com `cover`/`center` (foto do usuário);
  - senão => mostra as iniciais (`init`), sem imagem.
- `#wname` (8137) = **primeiro nome** apenas: `(CU.name||'Usuário').split(' ')[0]`.
- `#wdate` (8138) = data de hoje por extenso em pt-BR: `toLocaleDateString('pt-BR',{weekday:'long',year:'numeric',month:'long',day:'numeric'})`
  (ex.: "domingo, 28 de junho de 2026").
- `#wrole-pill` (8139-8141): texto = `isAdmin?'Administrador Master':(CU.role||'Usuário')`; classe `.admin-pill` ligada quando admin.
- Ao final chama `applyDrawerAccess()` (8142) , que aplica RBAC de menus e dos botões de adicionar (ver §9 e §10.2).

---

## 2. AGENDA , estado global e constantes

Declarações em 8339-8341:
```
const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOWS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
let CAL_YEAR=<ano atual>, CAL_MONTH=<mês atual>, CAL_RANGE=1, SEL_DATE=null,
    EVT_FILTER='', EVT_SEARCH='',
    EVT_ADV_FILTERS={type:'',period:'',from:'',to:'',time:'',createdBy:'',participants:'',participantText:''};
```
- `CAL_RANGE` , quantos meses mostrar de uma vez (1, 2, 3, 6 ou 12). Default 1.
- `SEL_DATE` , ISO `YYYY-MM-DD` do dia selecionado (null até clicar).
- `EVT_FILTER` , chip rápido de tipo ativo no painel do dia.
- `EVT_SEARCH` , texto da busca do dia (lowercase, trim).
- `EVT_ADV_FILTERS` , objeto dos filtros avançados (8 chaves).
- `EVENT_COLLAB_SELECTED_IDS` , array de IDs de colaboradores escolhidos no form (8851-8870).
- `MP_YEAR` / `MP_MONTH` (8797) , estado do seletor de mês (month picker).
- `PENDING_DELETE_EVENT_ID` (8756) , id aguardando confirmação de exclusão.
- Persistência: `DB_EVENTS='ig_events'` (7748), em `localStorage`.

`initCalendar()` (8606-8609) roda uma vez no boot, junto de `renderCC()` (8150).

### 2.1 Tipos de evento (rótulos), 8342-8352
```
const EVENT_TYPE_LABELS={
  reuniao:'REUNIÃO', inventario:'INVENTÁRIO', prospeccao:'PROSPECÇÃO',
  carregamento:'CARREGAMENTO', organizacao_estoque:'ORGANIZAÇÃO DE ESTOQUE',
  assembleia:'ASSEMBLEIA', interno:'INTERNO', prazo:'PRAZO', entrega:'ENTREGA'
};
```
Helpers (8353-8355):
- `eventTypeKey(type)` , default `'reuniao'` se vazio.
- `eventTypeLabel(type)` , rótulo do mapa, ou fallback `key.replace(/_/g,' ').toUpperCase()`.
- `eventTypeClass(type)` , normaliza para classe CSS (lowercase, sem acento, não-alfanum vira `_`).

**Crítico:** o mapa tem **9 tipos**, mas os `<select>` de criar (`#ef-type`) e de filtro (`#af-type`) e os chips do painel
oferecem apenas **6 ativos**: `reuniao, inventario, prospeccao, carregamento, organizacao_estoque, assembleia`.
Os três restantes (`interno`, `prazo`, `entrega`) só existem no mapa de rótulos e no CSS (cores) , legado de versão anterior.
Na reconstrução: decidir manter 6 ativos ou reabilitar 9.

### 2.2 Cores por tipo (CSS)
Cada tipo tem 4 expressões visuais: mini-evento na grade (`.cal-evt-mini.type-X`), borda esquerda do card no painel
(`.day-event.type-X`), pill do card/detalhe (`.pill-X` / `.day-evt-pill` / `.event-detail-pill`) e chip de filtro ativo
(`.a2-fchip.fc-X.active`).
Paleta base (10-14): `--gold:#C8A96E`, `--green:#3ECF8E`, `--red:#E05555`, `--blue:#5B8DEF`, `--purple:#9B72CF`, `--gold3:#E8D5A8`.

| Tipo | Conceito | mini bg/texto | borda card | pill bg/texto |
|---|---|---|---|---|
| `reuniao` | Azul | `rgba(91,141,239,.18)` / `#8FB5F5` | `--blue` | `rgba(91,141,239,.14)` / `#8FB5F5` |
| `inventario` | Verde | `rgba(62,207,142,.18)` / `#6FE0B0` | `--green` | `rgba(62,207,142,.14)` / `#6FE0B0` |
| `prospeccao` | Azul | `rgba(91,141,239,.18)` / `#8FB5F5` | `--blue` | `rgba(91,141,239,.14)` / `#8FB5F5` |
| `carregamento` | Vermelho | `rgba(224,85,85,.18)` / `#EE9090` | `--red` | `rgba(224,85,85,.14)` / `#EE9090` |
| `organizacao_estoque` | Dourado | `rgba(200,169,110,.16)` / `--gold3` | `--gold` | `--gold-bg` / `--gold3` |
| `assembleia` | Roxo | `rgba(155,114,207,.18)` / `#C6A8F0` | `--purple` | `rgba(155,114,207,.14)` / `#C6A8F0` |
| `interno` (legado) | Dourado | `rgba(200,169,110,.16)` / `--gold3` | `--gold` | `--gold-bg` / `--gold3` |
| `prazo` (legado) | Vermelho | `rgba(224,85,85,.18)` / `#EE9090` | `--red` | `rgba(224,85,85,.14)` / `#EE9090` |
| `entrega` (legado) | Verde | `rgba(62,207,142,.18)` / `#6FE0B0` | `--green` | `rgba(62,207,142,.14)` / `#6FE0B0` |

Não há ícones por tipo (só cor e rótulo). O único ícone nos cards é um relógio SVG ao lado do horário (8683).

---

## 3. Coluna A1 , grade do calendário (`.cal-a1`)

HTML 6073-6085. Cabeçalho `.cal-a1-header` (6074-6082):
- `‹` , `.cal-nav-btn` , `onclick="calNav(-1)"` , mês anterior.
- Botão central `.cal-month-btn` , `onclick="openMonthPicker()"` , com `<span id="cal-month-label">—</span>` +
  chevron-down SVG (polyline "6 9 12 15 18 9").
- `Hoje` , `.cal-today-btn` , `onclick="calToday()"`.
- `›` , `.cal-nav-btn` , `onclick="calNav(1)"` , próximo mês.
- `.cal-dow-row#cal-dow-row` (6083) , linha dos dias da semana (preenchida por JS com `DOWS`).
- `.cal-grid#cal-grid` (6084) , a grade dos dias.

### 3.1 `initCalendar()` (8606-8609)
Inicializa `CAL_YEAR/MONTH` com a data atual, preenche `#cal-dow-row` com `DOWS` e chama `renderCalendar()`.

### 3.2 `renderCalendar()` (8610-8631) , código real
- Atualiza `#cal-month-label`: se `CAL_RANGE===1` => `"Maio 2025"`; senão => `"Maio 2025 · N meses"`.
- Carrega eventos visíveis: `const events=getVisibleEvents(getEvents());` (RBAC, ver §8).
- Limpa a grade. `today=new Date()`.
- **1 mês**: `grid.className='cal-grid'`; uma `renderMonth(grid,CAL_YEAR,CAL_MONTH,events,today)`.
- **Multi-mês** (`CAL_RANGE>1`): `grid.className='cal-grid scroll'` (vira rolável); loop `mi=0..CAL_RANGE-1`
  calculando ano/mês com transbordo (`while(m>11){m-=12;y++;}`); para cada mês insere um rótulo
  `.cal-mlabel` (ex.: "Junho 2025") seguido da grade daquele mês. É puro **empilhamento vertical com scroll**, não há visão semana/dia.

### 3.3 `renderMonth(grid,y,m,events,today)` (8632-8640)
- `first` = dia da semana do dia 1; `days` = nº de dias do mês; `prevDays` = dias do mês anterior.
- Preenche os dias do **mês anterior** (`other=true`) antes do dia 1.
- Preenche os dias do mês (`makeCell` com `other=false`).
- Completa a última semana com dias do **mês seguinte** (`other=true`) até fechar múltiplo de 7
  (`rem=total%7===0?0:7-(total%7)`).

### 3.4 `makeCell(y,m,d,other,events,today)` (8641-8662) , código real
- Cria `.cal-cell` (+ `.other-month` se de outro mês).
- Marca `.today` se a data bate com `today` (e não for de outro mês).
- Marca `.selected` se `SEL_DATE===iso`.
- `.cal-day-num` com o número do dia.
- Filtra eventos do dia que passem `eventMatchesFilters(e)`; mostra **até 2** mini-eventos
  (`.cal-evt-mini type-X` com `(time? time+' ':'')+title` e `title` = título completo no hover).
- Se há mais de 2: tag `.cal-more-tag` com `"+N"` (ex.: "+3").
- `click` na célula => `selectDay(iso,date)`.

### 3.5 `isoDate(d)` (8663) e `selectDay(iso,dateObj)` (8664)
- `isoDate` , converte Date para `YYYY-MM-DD`.
- `selectDay` , seta `SEL_DATE`, re-renderiza a grade (para atualizar o destaque `.selected`) e abre o painel do dia.

### 3.6 Navegação , `calNav(dir)` (8787-8792) e `calToday()` (8793-8796)
- `calNav(dir)` , avança/recua o mês corrente (com transbordo de ano) e re-renderiza.
- `calToday()` , volta `CAL_YEAR/MONTH` para o mês atual e re-renderiza.

### 3.7 Seletor de mês / período (Month Picker, multi-mês)
Modal `#modal-monthpick` (HTML 7398-7418), título "Selecionar período".
- `openMonthPicker()` (8798-8803) , copia `CAL_YEAR/MONTH` para `MP_YEAR/MONTH`, escreve o ano na linha,
  seta o `<select> #mp-range` com o `CAL_RANGE` atual, renderiza os meses e abre o modal.
- Linha de ano `.mp-year-row` com `‹ <ano> ›` , `mpYearNav(dir)` (8804).
- `renderMPMonths()` (8805-8808) , grade de 4 colunas (`.mp-months`, CSS 527) com os 12 meses abreviados
  (`m.slice(0,3)` => "Jan","Fev"...). O mês corrente recebe `.selected` (fundo/borda dourados, CSS 530). Cada um `onclick="selectMPMonth(i)"`.
- `selectMPMonth(i)` (8809) , seta `MP_MONTH` e re-renderiza para mover o destaque.
- `<select> #mp-range` (7410-7414) , opções **1 mês / 2 meses / 3 meses / 6 meses / 1 ano** (valores 1/2/3/6/12).
- `applyMonthPicker()` (8810-8814) , aplica `CAL_YEAR/MONTH` e `CAL_RANGE`, fecha o modal e re-renderiza.

### 3.8 CSS notável da grade
`#mod-home{overflow:hidden}`; `.cal-grid.scroll` rola no multi-mês; células com transição de fundo `.12s`;
hover da célula usa `--s3`. `DOWS` = Dom..Sáb (semana iniciando no domingo, consistente com `first=getDay()`).

---

## 4. Coluna A2 , painel do dia (`.cal-a2`)

HTML 6087-6121. Estrutura:
- Header `.a2-header`: número grande do dia `#a2-daynum` (default "—"); `#a2-monthyear` ("Selecione um dia") +
  `#a2-weekday` ("no calendário").
- Botão `.a2-add-btn` (6095-6098) , ícone "+" + "Adicionar evento" , `onclick="openAddEventForSelected()"`.
  Estilo: borda tracejada dourada que vira sólida no hover (CSS 220-221). Visibilidade gated por `hasPerm('home')` (ver §9/§10.2).
- Busca `.a2-search-box` (6099-6105): input `#a2-event-search` (placeholder "Buscar evento do dia…",
  `oninput="setEventSearch(this.value)"`) + botão `⋯` `.a2-more-btn` (`onclick="openEventAdvancedFilters()"`,
  `title="Filtros avançados"`).
- Contador `.a2-count` (6106): "Eventos do dia" + badge `#a2-count`.
- Chips de filtro rápido `.a2-filters` (6107-6115): **Todos / Reunião / Inventário / Prospecção / Carregamento /
  Organização de Estoque / Assembleia**, cada um `onclick="setEvtFilter('<key>')"`. "Todos" inicia com `.active`.
- Corpo `.a2-body#a2-body` (6116-6120): estado inicial = empty state com ícone de calendário SVG + "Selecione um dia no calendário."

### 4.1 `renderDayPanel(iso,dateObj)` (8665-8706)
1. Resolve a data (`new Date(iso+'T12:00:00')` se não veio o objeto, fixando meio-dia para evitar fuso).
2. Preenche `#a2-daynum`; `#a2-monthyear` ("Maio 2025"); `#a2-weekday` (`toLocaleDateString('pt-BR',{weekday:'long'})` capitalizado, ex. "Segunda-feira").
3. `allDayEvents` = eventos visíveis do dia **sem** filtros (para decidir qual mensagem de vazio mostrar).
4. `events` = `getFilteredDayEvents(iso)` (visíveis + todos os filtros + ordenados por hora).
5. Atualiza o badge `#a2-count` com a contagem.
6. **Estado vazio** (8675-8680) com ícone de calendário SVG em `.a2-empty`:
   - Se há eventos no dia mas os filtros escondem tudo => "Nenhum evento encontrado com os filtros selecionados."
   - Senão => "Nenhum evento neste dia.<br>Use o botão acima para criar."
7. **Lista de eventos** (8681-8693): cada evento => card `.day-event type-X` (borda esquerda colorida por tipo,
   CSS 250/264-293), `data-event-id`, `title="Clique para ver detalhes"`, contendo:
   - `.day-evt-time` , relógio SVG + `ev.time` ou **"Dia todo"** se sem hora.
   - `.day-evt-title` , título.
   - `.day-evt-desc` , descrição (se houver).
   - `.day-evt-foot` , pill de tipo (`.day-evt-pill`) e botão `×` excluir (`.day-evt-del`, só se `canDeleteEvent(ev)` , RBAC).
8. **Delegação de clique** (8694-8705) em `body.onclick`:
   - Clique no `×` (`.day-evt-del`) => `openEventDeleteConfirm` (com `stopPropagation`).
   - Clique num link `<a>` (anexo) => ignora (deixa baixar).
   - Clique em qualquer outro ponto do card => `openEventDetails(id)`.

### 4.2 Filtro rápido e busca
- `setEvtFilter(f)` (8357-8364) , seta `EVT_FILTER` (e `EVT_ADV_FILTERS.type`), marca o chip ativo (`.a2-fchip.active`),
  sincroniza o `<select> #af-type`, re-renderiza calendário + painel.
- `setEventSearch(v)` (8365-8368) , seta `EVT_SEARCH` (lowercase/trim) e re-renderiza só o painel do dia.

---

## 5. Criar evento , `openAddEvent` / `openAddEventForSelected` / `saveEvent`

`openAddEventForSelected()` (8982) é **alias** de `openAddEvent()`.

### 5.1 `openAddEvent()` (8972-8981)
Pré-popula o `#ef-date` com `SEL_DATE` (em BR) ou a data de hoje, limpa os campos de colaboradores/anexos,
inicializa os pickers (colaboradores e arquivos) e abre o modal `#modal-event`.

### 5.2 Formulário (modal `#modal-event`, HTML 7420-7481)
Campos na ordem:
1. **Título** , `#ef-title`, texto, placeholder "Nome do evento". **Obrigatório.**
2. **Data** , `#ef-date`, texto com máscara `DD/MM/AAAA` (`maxlength=10`, inputmode numeric).
   Chips rápidos `.quick-chips`: **Hoje** (`setQuickDate(0)`), **Amanhã** (`setQuickDate(1)`), **+7 dias** (`setQuickDate(7)`). **Obrigatório.**
3. **Hora (opcional)** , `#ef-time`, texto com máscara `HH:MM` (`maxlength=5`). Chips: **09:00 / 14:00 / 18:00** (`setQuickTime(...)`).
4. **Tipo** , `<select> #ef-type`: REUNIÃO / INVENTÁRIO / PROSPECÇÃO / CARREGAMENTO / ORGANIZAÇÃO DE ESTOQUE / ASSEMBLEIA (6 opções).
5. **UF/Estado do evento** , `<select> #ef-uf`: opção vazia "Selecione a UF/Estado" + 27 UFs (formato "SP - São Paulo"). Alimenta a RBAC regional.
6. **Adicionar colaboradores** , picker "tipo Outlook" (ver §6). Ajuda: "Digite o nome, e-mail ou usuário do colaborador e selecione na lista, como no campo de cópia do Outlook."
7. **Anexar arquivos** , `<input type="file" multiple> #ef-files` (ver §7). Ajuda: "Arquivos anexados serão salvos junto ao evento neste navegador."
8. **Descrição** , `#ef-desc`, texto, placeholder "Detalhes (opcional)".
9. Botão **Salvar evento** (`.ef-btn`) => `saveEvent()`.

> Não há checkbox "dia inteiro": a ausência de hora é exibida como "Dia todo". Não há início/fim separados, só uma data e uma hora única.

### 5.3 Helpers de data/hora
- `setQuickDate(offset)` (8824-8827) , hoje+offset em BR no `#ef-date`.
- `setQuickTime(t)` (8828) , seta o texto no `#ef-time`.
- `maskDate(e)` (8829-8834) / `maskTime(e)` (8835-8839) , máscaras de digitação progressivas.
- `isoToBR` / `brToISO` (8815-8823) , conversões com validação de data real (rejeitam 31/02 etc).

### 5.4 `saveEvent()` (async, 8983-9016) , validações
1. Título e data obrigatórios => `alert('Preencha título e data.')`.
2. Data via `brToISO`; inválida => `alert('Data inválida. Use o formato DD/MM/AAAA.')`.
3. Hora, se preenchida, precisa casar `^([01]\d|2[0-3]):[0-5]\d$` => senão `alert('Hora inválida. Use o formato HH:MM.')`.
4. Lê anexos via `readEventAttachments()` (pode rejeitar por tamanho e abortar).
5. Monta e dá push em `getEvents()`:
   ```
   {id:'evt_'+Date.now(), title, date, time, type, uf, desc,
    participants:selectedEventCollaborators(), attachments,
    createdBy, createdByName, createdById, createdByUser, createdByEmail,
    createdByHierarchy, createdAt:ISOString}
   ```
6. `saveEvents()` (8597-8605) persiste; erro de quota => `alert('Não foi possível salvar o evento. Os anexos podem estar muito grandes...')`.
7. Limpa título/hora/descrição, reseta colaboradores e arquivos, fecha o modal, re-renderiza.

`getEvents()` (8582-8596) lê do localStorage e **auto-gera IDs faltantes** (`evt_<ts>_<i>_<rand>`).

---

## 6. Colaboradores , picker estilo Outlook

Campo no form: chips `#ef-collab-chips` + input `#ef-collab-search` + dropdown `#ef-collab-picker`
(com `#ef-collab-suggestions`). Estado: `EVENT_COLLAB_SELECTED_IDS`.

### 6.1 `renderEventCollaboratorPicker(forceOpen)` (8874-8914)
- **Chips** (8881) , cada selecionado vira `.event-person-chip` com nome + `×` (remove).
- **Busca** (8889-8897) , normaliza o texto (lowercase, sem acento) e filtra os não-selecionados por
  nome/email/username/cargo/hierarquia/UF. Mostra **até 8** sugestões (`slice(0,8)`).
- **Estados vazios** (8899-8902):
  - Sem usuários cadastrados => "Nenhum colaborador cadastrado" + "Crie usuários no Painel de Usuários...".
  - Sem match => "Nenhum colaborador encontrado" + "Tente pesquisar por outro nome, e-mail ou usuário."
- **Sugestões** (8904) , cada uma com nome + meta (email · username · UF) + tag de hierarquia
  (`.event-collab-suggestion-tag`). Seleção via `mousedown` (não perde o foco do input).
- **Abertura** (8912-8913) , o dropdown abre se o input está focado ou `forceOpen`, havendo usuários/query.

### 6.2 `initEventCollaboratorPicker()` (8919-8940) , código real
- Liga (`dataset.bound='1'`, uma única vez) os listeners do input `#ef-collab-search`:
  - `input` e `focus` => `renderEventCollaboratorPicker(true)`.
  - **`keydown`**:
    - `Enter` => `preventDefault` e adiciona a **primeira sugestão** (`#ef-collab-suggestions [data-add-collab]`) via `addEventCollaborator`.
    - `Backspace` com input vazio e havendo selecionados => remove o **último** colaborador (`removeEventCollaborator`).
    - `Escape` => `closeEventCollaboratorSuggestions()`.
  - `mousedown` no documento fora do picker => fecha as sugestões.
- `addEventCollaborator(id)` / `removeEventCollaborator(id)` , mexem em `EVENT_COLLAB_SELECTED_IDS` e re-renderizam.
- `selectedEventCollaborators()` (8941+) , mapeia os IDs para `{id,name,username,email,uf}` (UF via `formatUfList`),
  preservando ids órfãos como `{id}`. É o que vai para `participants` no save.

---

## 7. Anexos , `initEventAttachmentInput` / `readEventAttachments`

- Input `<input type="file" multiple> #ef-files` (7473). **Aceita qualquer tipo** (sem `accept`).
- `initEventAttachmentInput()` (9018-9024) , liga o `change` => `refreshEventFileList` (uma vez, `dataset.bound`).
- `refreshEventFileList()` (8948-8955) , lista os arquivos como `.event-file-chip` com nome + tamanho em KB arredondado para cima
  (`Math.ceil(size/1024) KB`). Vazio => limpa a lista.
- `readEventAttachments()` (8956-8971):
  - Soma os tamanhos; se **> 3 MB** => `alert('Os anexos somam mais de 3 MB. Remova arquivos grandes...')` e rejeita.
  - Lê cada arquivo como **DataURL** (base64) via `FileReader`, gerando `{name,size,type,dataUrl}`.
  - Os anexos ficam **embutidos no localStorage** (daí o teto de 3 MB e o alerta de quota).
- Exibição nos cards/detalhes , `eventAttachmentsHtml(ev)` (8394-8402) gera `<a href=dataUrl download=name>` para baixar;
  sem URL, mostra só o nome.

---

## 8. Detalhes do evento , `openEventDetails`

Modal `#modal-event-details` (HTML 7483-7490, max-width 620px, título "Detalhes do evento", botão "Fechar").

### 8.1 `openEventDetails(id)` (8707-8754)
- Busca o evento; não achou => `alert('Evento não encontrado.')`.
- **RBAC**: `!canViewEvent(ev)` => `alert('Acesso negado a este evento.')`.
- Monta `.event-detail-grid` (2 colunas, cards `.event-detail-card`):
  - **Título** (full width, destaque).
  - **Tipo** (pill colorido `.event-detail-pill`).
  - **Data e horário** (`DD/MM/AAAA · HH:MM` ou "Dia todo").
  - **UF/Estado** (ou "Não informado." em itálico).
  - **Descrição** (full, ou "Sem descrição cadastrada.").
  - **Colaboradores** (full, ou "Nenhum colaborador adicionado.").
  - **Anexos** (full, links de download, ou "Nenhum arquivo anexado.").
  - **Criado por** (full, `createdBy · createdByUser · createdByEmail`).
- Estados vazios usam `.event-detail-empty` (cinza, itálico).
- **Sem botão de editar nem de excluir dentro do modal de detalhes** , só "Fechar". A exclusão é pelo `×` no card do painel.

---

## 9. Excluir evento , `openEventDeleteConfirm` / `confirmDeleteEvent`

Modal `#modal-event-delete` (HTML 7492-7505, max-width 420px). Título "Excluir evento". Bloco de aviso vermelho
`.event-delete-warning`: "DESEJA EXCLUIR O EVENTO?" + `#event-delete-name`. Botões **Excluir** (`.danger-btn` vermelho)
e **Cancelar** (`.cancel-btn`).

Fluxo:
- `openEventDeleteConfirm(evt,id)` (8757-8768) , para propagação, valida id/evento, checa `canDeleteEvent(ev)`
  (senão `alert('Você não tem permissão para excluir este evento.')`), guarda `PENDING_DELETE_EVENT_ID`,
  mostra `Evento: <título>` (ou "Esta ação não poderá ser desfeita.") e abre o modal.
- `cancelDeleteEvent()` (8769-8772) , zera o pendente e fecha.
- `confirmDeleteEvent()` (8773-8785) , filtra o evento da lista, salva, fecha os dois modais (delete + details) e
  re-renderiza calendário + painel. Se já não existir => `alert('Evento não encontrado. Atualize a página...')`.
- `deleteEvent(id)` (8786) , atalho que chama `openEventDeleteConfirm(null,id)`.

---

## 10. Filtros avançados , `openEventAdvancedFilters`

Modal aberto pelo botão `⋯` do painel do dia.

### 10.1 Campos
- **Tipo de evento** , `#af-type`: Todos + os 6 tipos.
- **Período** , `#af-period`: Todos / Hoje / Esta semana / Este mês / Intervalo personalizado (`onchange="toggleEventCustomPeriod()"`).
- **Intervalo personalizado** , `#af-custom-period` (escondido até escolher "custom"): Data inicial `#af-date-from` (`type=date`) + Data final `#af-date-to`.
- **Horário** , `#af-time`: Todos / Manhã / Tarde / Noite.
- **Criado por** , `#af-created-by`: Todos / Apenas meus eventos / Eventos de outros usuários.
- **Participantes** , `#af-participants`: Todos / Eventos em que participo / Eventos com funcionários específicos.
- **Funcionário específico** , `#af-participant-text` (texto livre: nome, usuário ou e-mail).
- Dica: "A busca combina o texto digitado na barra com os filtros selecionados aqui."
- Ações: **Aplicar filtros** / **Limpar filtros** / **Fechar**.

### 10.2 Lógica e avaliação
- `applyEventAdvancedFilters()` , lê os campos para `EVT_ADV_FILTERS`, sincroniza o chip rápido e re-renderiza.
- `clearEventAdvancedFilters()` , zera todos os campos e o objeto.
- `eventMatchesFilters(ev)` (8522-8536) , avalia tipo + período (hoje/semana/mês/intervalo) + horário (manhã/tarde/noite por faixa de hora) +
  criado por (meus/de outros, comparando ao `CU`) + participantes (participo / com funcionário específico, casando `#af-participant-text`) +
  o texto da busca do dia (`EVT_SEARCH`). É usado tanto na grade (`makeCell`) quanto no painel (`getFilteredDayEvents`).

---

## 11. RBAC de eventos (visibilidade e exclusão) + UF

Eixo de **hierarquia comercial** (7813-7818, `HIERARCHY_LEVELS`; sinônimos por `normalizeHierarchyValue` 7819; nível por `hierarchyLevelOf` 7828):
`VENDEDOR REGIONAL`(1) < `GERENTE COMERCIAL REGIONAL`(2) < `SUB GERENTE COMERCIAL GLOBAL`(3) < `DIRETOR COMERCIAL GLOBAL`(4).
Regionais (1-2) dependem de UF; globais (3-4) veem tudo. É eixo de **visibilidade de dado**, não de acesso a menu.

- `canViewEvent(ev,user)` (8458-8485):
  - Master (admin / `owner-icaro` / `isMaster`) vê tudo.
  - Criador ou colaborador manual do evento sempre vê.
  - Senão, só vê eventos de **níveis inferiores** (`viewerLevel<=creatorLevel` bloqueia).
  - **Gerente Comercial Regional** só vê eventos de **Vendedor Regional da mesma UF** (`regionalUfsCanSeeEvent` 7980-7988; ex.: gerente do CE não vê vendedor da BA).
  - Sub Gerente Global e Diretor Global veem todos os de baixo, sem restrição de UF.
- `canDeleteEvent(ev,user)` (8486-8489) , master, admin, ou o próprio criador.
- `getVisibleEvents()` (8490) , filtra a lista por `canViewEvent`.
- A UF do evento (`#ef-uf`) e a UF do usuário (`userRegionalUfs`, 7866-7868) alimentam a regra.
- **Botão "Adicionar evento"** (`.a2-add-btn`) , `applyDrawerAccess` (8169) liga `display:'flex'` só se `hasPerm('home')`.

---

## 12. Coluna A3 , Central de arquivos / Contracheques (CC)

**"CC" = Contracheques (holerites).** Card na zona `a3` da Home. Chave de persistência `DB_CC='ig_cc'` (7748).

### 12.1 HTML do card (`.cc-section`, 6124-6134)
- `.cc-header`: ícone de documento SVG + `.cc-title` "Contra-cheques" + botão `.cc-add-btn#cc-add-btn`
  (ícone "+" + "Adicionar", `onclick="openCCModal()"`, `style="display:none"` por padrão).
- `.cc-body#cc-body`: conteúdo, iniciando com `.cc-empty` "Nenhum contra-cheque disponível.".
- CSS: corpo com scroll horizontal; cards `.cc-file` com ícone/nome/meta; `×` excluir aparece no hover.

### 12.2 Visibilidade administrável (só admin)
`applyDrawerAccess()` (8169): `cc.style.display = hasPerm('admin') ? 'flex' : 'none'` , o botão "Adicionar" só aparece para admin.
No `renderCC`, o `×` de excluir em cada card só é emitido se `CU?.type==='admin'`.

### 12.3 `getCC` / `saveCC` / `renderCC` (9027-9042) , código real
- `getCC()` , `JSON.parse(localStorage[DB_CC] || '[]')`. `saveCC(d)` , persiste.
- `renderCC()`:
  - Vazio => `.cc-empty` "Nenhum contra-cheque disponível." e retorna.
  - Senão, para cada arquivo => `.cc-file title="<nome>"` com `.cc-file-top` (ícone documento SVG + botão `×` `.cc-file-del`
    `onclick="deleteCC(<id>)"` **só se `CU?.type==='admin'`**), `.cc-file-name` (nome) e `.cc-file-meta` (período).

### 12.4 Modal `#modal-cc` (HTML 7703-7714)
- `max-width:380px`, título "Adicionar Contra-cheque", botão `×` (`closeModal('modal-cc')`).
- Campos:
  - **Nome do arquivo** , `#cc-name`, placeholder "Ex: Contra-cheque Janeiro 2025".
  - **Mês/Período** , `#cc-period`, placeholder "Ex: Janeiro 2025".
  - **Arquivo** , `#cc-file`, `type="file"`, `accept=".pdf,.png,.jpg"`.
  - Botão "Adicionar arquivo" (`.ef-btn`) => `saveCCFile()`.

### 12.5 `openCCModal` / `saveCCFile` / `deleteCC` (9043-9057) , código real
- `openCCModal()` , `openModal('modal-cc')`.
- `saveCCFile()`:
  - Lê `cc-name` e `cc-period` (trim). Sem nome => `alert('Informe o nome do arquivo.')`.
  - `files.push({id:Date.now(), name, period:period||'—', addedBy:CU?.name, addedAt:ISOString})`.
  - **CRÍTICO: o binário NÃO é salvo.** O `<input type=file #cc-file>` é coletado mas **ignorado** no save , só metadados (nome, período, quem adicionou, quando).
  - Limpa os campos, fecha o modal, `renderCC()`.
- `deleteCC(id)` , `confirm('Remover este arquivo?')`; se sim, remove e re-renderiza.

> Em síntese: "mural de contracheques" administrável só pelo admin, visível a todos, sem upload real (sem arquivo armazenado).
> Forte candidato a redesign na reconstrução (upload real para Postgres/storage). Note o `'—'` (travessão) usado como default de período no save: na reconstrução trocar por hífen/vírgula conforme a regra do projeto.

---

## 13. Interações, animações, estados e textos exatos (resumo)

- **Clicar num dia** da grade => seleciona (destaque dourado `.selected`) + abre o painel do dia. Sem drag-and-drop.
- **Hover**: célula do dia (fundo `--s3`), card de evento (fundo `--s3`), chips/botões (borda dourada), `.a2-add-btn` (tracejada => sólida), `.cc-file` (mostra `×`).
- **Tooltips nativos (`title`)**: mini-eventos (título completo), card do dia ("Clique para ver detalhes"), `×` ("Excluir evento"), `⋯` ("Filtros avançados"), `.cc-file` (nome do arquivo).
- **"Dia todo"** quando o evento não tem hora.
- **Transições CSS**: fundo `.12s` nas células/cards, `.15s` nos botões; dropdown de colaboradores com `box-shadow:0 16px 50px rgba(0,0,0,.55)`. Sem animação JS complexa.
- **Mobile**: grade de detalhes e filtros viram 1 coluna (<700px / <640px); `.home-container` colapsa para coluna única (welcome/a1/a3, A2 some) em 593.
- **Persistência**: eventos em `localStorage['ig_events']` (anexos base64, teto 3 MB); contracheques em `localStorage['ig_cc']` (só metadados).
- **Estados vazios (textos exatos)**:
  - Painel inicial: "Selecione um dia no calendário."
  - Dia sem eventos: "Nenhum evento neste dia.\nUse o botão acima para criar."
  - Dia com filtro ativo sem match: "Nenhum evento encontrado com os filtros selecionados."
  - Picker sem usuários: "Nenhum colaborador cadastrado" / "Crie usuários no Painel de Usuários...".
  - Picker sem match: "Nenhum colaborador encontrado" / "Tente pesquisar por outro nome, e-mail ou usuário."
  - Central de arquivos vazia: "Nenhum contra-cheque disponível."
- **Alertas (texto exato)**: "Preencha título e data.", "Data inválida. Use o formato DD/MM/AAAA.", "Hora inválida. Use o formato HH:MM.", "Os anexos somam mais de 3 MB. Remova arquivos grandes...", "Não foi possível salvar o evento. Os anexos podem estar muito grandes...", "Evento não encontrado.", "Acesso negado a este evento.", "Você não tem permissão para excluir este evento.", "Informe o nome do arquivo.", confirm "Remover este arquivo?".

---

## 14. Lacunas / pontos de atenção para a reconstrução

1. **9 tipos no mapa, 6 nos selects** , `interno/prazo/entrega` são legado (só CSS + rótulo). Decidir manter 6 ou reabilitar 9.
2. **Sem editar evento** , só criar, ver e excluir. Não existe fluxo de edição.
3. **Sem início/fim nem "dia inteiro" explícito** , um único campo de data + hora opcional.
4. **Anexos em base64 no localStorage** , inviável em produção (precisa upload real/storage). O teto de 3 MB é limitação do navegador.
5. **RBAC por hierarquia comercial + UF** , mapear para o modelo de usuários/permissões real do nexus-odoo.
6. **Persistência local** , vira API/banco; o contrato do objeto evento (`createdBy*`, `participants`, `attachments`, `uf`, `type`) é o que portar.
7. **Visão única (mês)** , sem semana/dia/lista/timeline; multi-mês é só empilhamento com scroll.
8. **Central de arquivos / contracheques não guarda o binário** , só nome/período/quem/quando. Redesign obrigatório com upload real.
9. **Avatar via iniciais ou foto base64** , portar para foto real do usuário (storage), mantendo o fallback de iniciais.
