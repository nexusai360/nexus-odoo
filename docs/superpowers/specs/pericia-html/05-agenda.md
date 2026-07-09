# Perícia Forense , Módulo AGENDA / CALENDÁRIO

> Fonte: `/Users/joaovitorzanini/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`
> Protótipo HTML monolítico (18.971 linhas, JS/CSS vanilla, persistência em `localStorage`).
> Escopo: todas as funções da agenda/calendário, com números de linha reais. Nada inventado.

A agenda **não tem módulo próprio**: ela vive dentro da Home (`#mod-home`, a partir da
linha 6062), logo abaixo da barra de boas-vindas. É um layout de duas colunas:
**A1 = grade do calendário** (`.cal-a1`) à esquerda e **A2 = painel do dia** (`.cal-a2`)
à direita. Não há outras visões (sem semana/dia/lista/timeline). A "interatividade rica"
que o cliente elogiou está em: navegação de meses + seletor de período multi-mês, clique
em dia abrindo painel lateral, criação de evento com colaboradores tipo Outlook + anexos,
detalhes em modal, exclusão com confirmação, e filtros avançados (tipo/período/horário/
autor/participantes) combinados com busca textual. Persistência 100% local.

---

## 0. Estado global e constantes

Declarados em **linha 8339-8341**:

```
const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOWS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
let CAL_YEAR=<ano atual>, CAL_MONTH=<mês atual>, CAL_RANGE=1, SEL_DATE=null,
    EVT_FILTER='', EVT_SEARCH='',
    EVT_ADV_FILTERS={type:'',period:'',from:'',to:'',time:'',createdBy:'',participants:'',participantText:''};
```

- `CAL_RANGE` = quantos meses exibir de uma vez (1, 2, 3, 6 ou 12). Default 1.
- `SEL_DATE` = ISO `YYYY-MM-DD` do dia selecionado (null até clicar).
- `EVT_FILTER` = chip rápido de tipo ativo.
- `EVT_SEARCH` = busca textual do dia (lowercase, trim).
- `EVT_ADV_FILTERS` = objeto dos filtros avançados.
- `EVENT_COLLAB_SELECTED_IDS` = array de IDs de colaboradores selecionados no form (usado em 8851-8870).
- `MP_YEAR` / `MP_MONTH` (linha 8797) = estado do seletor de mês (month picker).
- `PENDING_DELETE_EVENT_ID` (linha 8756) = id em espera de confirmação de exclusão.
- Chave de persistência: `DB_EVENTS='ig_events'` (linha 7748), em `localStorage`.

`initCalendar()` é chamado uma vez no boot, junto com `renderCC()` (linha 8150).

### Tipos de evento (rótulos), linha 8342-8352

```
const EVENT_TYPE_LABELS={
  reuniao:'REUNIÃO',
  inventario:'INVENTÁRIO',
  prospeccao:'PROSPECÇÃO',
  carregamento:'CARREGAMENTO',
  organizacao_estoque:'ORGANIZAÇÃO DE ESTOQUE',
  assembleia:'ASSEMBLEIA',
  interno:'INTERNO',
  prazo:'PRAZO',
  entrega:'ENTREGA'
};
```

Funções auxiliares (8353-8355):
- `eventTypeKey(type)` , default `'reuniao'` se vazio.
- `eventTypeLabel(type)` , retorna o rótulo do mapa, ou `key.replace(/_/g,' ').toUpperCase()` como fallback.
- `eventTypeClass(type)` , normaliza o tipo p/ classe CSS (lowercase, remove acentos, troca não-alfanum por `_`).

**Observação importante:** o mapa tem **9 tipos**, mas os `<select>` de criação e de filtro
só oferecem **6** (reuniao, inventario, prospeccao, carregamento, organizacao_estoque,
assembleia). Os três restantes (`interno`, `prazo`, `entrega`) existem só no mapa de rótulos
e no CSS (cores) , provavelmente legado de uma versão anterior. Na reconstrução, decidir se
mantém os 6 ativos ou reabilita os 9.

### Cores por tipo (CSS)

Cada tipo tem 3 expressões visuais: o **mini-evento na grade** (`.cal-evt-mini.type-X`),
a **borda esquerda do card no painel** (`.day-event.type-X`), o **pill do card/detalhe**
(`.pill-X` / `.day-evt-pill`) e o **chip de filtro ativo** (`.a2-fchip.fc-X.active`).

Paleta base (linhas 10-14): `--gold:#C8A96E`, `--green:#3ECF8E`, `--red:#E05555`,
`--blue:#5B8DEF`, `--purple:#9B72CF`, `--gold3:#E8D5A8` (claro).

| Tipo | Cor conceitual | mini-evento bg/texto (l.279-283/206-209) | borda card (l.264-293) | pill (l.273-298) |
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

Não há ícones por tipo (só cores e rótulo). O único ícone nos cards é um relógio SVG no horário (l.8683).

---

## 1. Layout do calendário (coluna A1)

HTML em **6073-6085**. Cabeçalho `.cal-a1-header` (6074-6082):

- `‹` `calNav(-1)` , mês anterior.
- Botão central `.cal-month-btn` com `<span id="cal-month-label">` + chevron-down SVG, `onclick="openMonthPicker()"`.
- `Hoje` `.cal-today-btn` , `calToday()`.
- `›` `calNav(1)` , próximo mês.
- Linha dos dias da semana `#cal-dow-row` (preenchida por JS).
- Grade `#cal-grid`.

### `initCalendar()` , linha 8606-8609
Preenche o cabeçalho dos dias da semana (`DOWS.map`) em `#cal-dow-row` e chama `renderCalendar()`.

### `renderCalendar()` , linha 8610-8631
- Atualiza o label do mês: se `CAL_RANGE===1` => `"Maio 2025"`; senão `"Maio 2025 · 3 meses"`.
- Carrega eventos visíveis: `getVisibleEvents(getEvents())` (aplica RBAC, ver §9).
- Limpa a grade. Se `CAL_RANGE===1`, renderiza um mês (`grid.className='cal-grid'`).
- Se `CAL_RANGE>1`, adiciona `class scroll` (rolagem vertical) e renderiza N meses
  sequenciais, cada um precedido de um label `.cal-mlabel` ("Junho 2025") , l.8625-8628.
  O wrap de mês/ano é tratado no laço (`while(m>11){m-=12;y++}`).

### `renderMonth(grid,y,m,events,today)` , linha 8632-8640
Monta a grade de 7 colunas:
- `first` = dia da semana do dia 1 (0=Dom).
- Preenche os dias do **mês anterior** (`other-month`) antes do dia 1.
- Preenche os dias do mês (`makeCell` com `other=false`).
- Completa a última semana com dias do **mês seguinte** (`other-month`) até fechar múltiplo de 7.

### `makeCell(y,m,d,other,events,today)` , linha 8641-8662
Cria cada célula `.cal-cell`:
- `.other-month` (opacity .28, l.202) p/ dias fora do mês.
- `.today` se for hoje (compara `toDateString`) , o número do dia ganha fundo dourado redondo (l.204).
- `.selected` se `SEL_DATE===iso` , fundo `--gold-bg` + sombra interna dourada (l.201).
- Número do dia `.cal-day-num`.
- Eventos do dia: filtra `events` por `e.date===iso && eventMatchesFilters(e)`.
  Mostra **no máximo 2** mini-eventos (`.cal-evt-mini type-X`) com `(hora+' ')+título`,
  `title` = título completo (tooltip nativo).
- Se houver mais de 2, mostra tag `+N` (`.cal-more-tag`, l.210).
- **Clique na célula** => `selectDay(iso,date)`.
- Hover na célula: fundo `--s3` (l.200).

### `isoDate(d)` (8663) / `selectDay(iso,dateObj)` (8664)
`selectDay` seta `SEL_DATE`, re-renderiza o calendário (p/ mover o destaque `.selected`)
e chama `renderDayPanel(iso,dateObj)`.

### Navegação , `calNav(dir)` (8787-8792) e `calToday()` (8793-8796)
- `calNav` incrementa/decrementa `CAL_MONTH` com wrap de ano e re-renderiza.
- `calToday` reseta para hoje, força `CAL_RANGE=1` e **seleciona o dia de hoje** (abre o painel do dia).

### Seletor de mês / período , Month Picker
Modal `#modal-monthpick` (HTML 7398-7418). Título "Selecionar período".

- `openMonthPicker()` (8798-8803): copia `CAL_YEAR/MONTH` p/ `MP_YEAR/MONTH`, preenche o
  ano, seta o `<select> #mp-range` com o `CAL_RANGE` atual, renderiza os meses e abre o modal.
- Linha de ano `.mp-year-row` com `‹ 2025 ›` (`mpYearNav(dir)`, l.8804).
- `renderMPMonths()` (8805-8808): grade 4 colunas (`.mp-months`, l.527) com os 12 meses
  abreviados (`m.slice(0,3)` => "Jan","Fev"...). O mês corrente recebe `.selected`
  (fundo/borda dourados, l.530). Cada um `onclick="selectMPMonth(i)"`.
- `selectMPMonth(i)` (8809): seta `MP_MONTH` e re-renderiza (atualiza o destaque).
- `<select> #mp-range` (7410-7414): **1 mês / 2 meses / 3 meses / 6 meses / 1 ano**.
- `applyMonthPicker()` (8810-8814): aplica `CAL_YEAR/MONTH` e `CAL_RANGE`, fecha modal, re-renderiza.

### CSS notável da grade
- `.cal-grid` , grid 7 col, `grid-auto-rows:1fr` (linha igual). Versão `.scroll`:
  `grid-auto-rows:minmax(58px,auto)` + overflow-y com scrollbar de 4px dourada/borda.
- `.cal-cell` , borda direita+inferior, padding 5/6px, `overflow:hidden`, transição de fundo .12s.
  `:nth-child(7n)` remove borda direita (última coluna).
- `.cal-mlabel` , label de mês ocupa toda a largura (`grid-column:1/-1`), texto dourado.

---

## 2. Painel do dia (coluna A2) , `renderDayPanel`

HTML em **6087-6121**. Estrutura:
- Header `.a2-header`: número grande do dia `#a2-daynum` (default "—"), texto
  `#a2-monthyear` ("Selecione um dia") + `#a2-weekday` ("no calendário").
- Botão `.a2-add-btn` (ícone + "Adicionar evento") => `openAddEventForSelected()` (6095-6098).
  Estilo: borda tracejada dourada, vira sólida no hover (l.220-221).
- Busca `.a2-search-box` com input `#a2-event-search` (placeholder "Buscar evento do dia…",
  `oninput="setEventSearch(this.value)"`) + botão `⋯` `.a2-more-btn`
  (`onclick="openEventAdvancedFilters()"`, title "Filtros avançados") , 6099-6105.
- Contador `.a2-count` "Eventos do dia" + badge `#a2-count` (6106).
- Chips de filtro rápido `.a2-filters` (6107-6115): **Todos / Reunião / Inventário /
  Prospecção / Carregamento / Organização de Estoque / Assembleia**, cada um
  `onclick="setEvtFilter('<key>')"`, "Todos" começa `.active`.
- Corpo `.a2-body` `#a2-body`. Estado inicial (6116-6120): empty state com ícone de
  calendário SVG + "Selecione um dia no calendário."

### `renderDayPanel(iso,dateObj)` , linha 8665-8706
1. Resolve a data (cria `new Date(iso+'T12:00:00')` se não veio o objeto).
2. Preenche `#a2-daynum`, `#a2-monthyear` ("Maio 2025"), `#a2-weekday`
   (`toLocaleDateString('pt-BR',{weekday:'long'})` capitalizado, ex. "Segunda-feira").
3. `allDayEvents` = eventos visíveis do dia **sem** filtros (p/ decidir a mensagem vazia).
4. `events` = `getFilteredDayEvents(iso)` (visíveis + todos os filtros + ordenados por hora).
5. Atualiza o badge `#a2-count` com a contagem.
6. **Estado vazio** (8675-8680): se 0 eventos:
   - Se há eventos no dia mas filtros escondem tudo => "Nenhum evento encontrado com os filtros selecionados."
   - Senão => "Nenhum evento neste dia.<br>Use o botão acima para criar."
   - Renderiza ícone de calendário SVG dentro de `.a2-empty`.
7. **Lista de eventos** (8681-8693): cada evento vira um card `.day-event type-X`
   (borda esquerda colorida por tipo, l.250/264-293), `data-event-id`, `title="Clique para ver detalhes"`:
   - `.day-evt-time` , ícone relógio SVG + `ev.time` ou **"Dia todo"** se sem hora.
   - `.day-evt-title` , título.
   - `.day-evt-desc` , descrição (se houver).
   - `.day-evt-extra` "**Colaboradores:** ..." (se houver, via `eventParticipantNames`).
   - `.day-evt-extra` "**UF/Estado:** ..." (se `ev.uf`).
   - `.day-evt-extra` "**Anexos:** ..." , links de download (via `eventAttachmentsHtml`).
   - `.day-evt-foot`: pill do tipo (`.day-evt-pill pill-X`) + botão `×` de exclusão
     (`.day-evt-del`, só se `canDeleteEvent(ev)` , RBAC).
8. **Delegação de clique** (8694-8705) em `body.onclick`:
   - Clique no `×` (`.day-evt-del`) => `openEventDeleteConfirm` (stopPropagation).
   - Clique num link `<a>` (anexo) => ignora (deixa baixar).
   - Clique em qualquer outro ponto do card => `openEventDetails(id)`.

### Filtro rápido e busca
- `setEvtFilter(f)` (8357-8364): seta `EVT_FILTER` (e `EVT_ADV_FILTERS.type`), marca o chip
  ativo (`.a2-fchip.active`), sincroniza o `<select> #af-type`, re-renderiza calendário+painel.
- `setEventSearch(v)` (8365-8368): seta `EVT_SEARCH` (lowercase/trim) e re-renderiza só o painel do dia.

---

## 3. Criar evento , `openAddEvent` / `openAddEventForSelected` / `saveEvent`

`openAddEventForSelected()` (8982) é só um alias de `openAddEvent()`.

### `openAddEvent()` , linha 8972-8981
- Preenche `#ef-date` com `SEL_DATE` (ou hoje) em formato BR (DD/MM/AAAA).
- `populateEventCollaborators()` => reseta a seleção de colaboradores.
- Limpa o input de arquivos.
- Pré-seleciona a UF do evento: se o usuário não tem "TODOS", usa a 1ª UF dele (`userRegionalUfs(CU)`).
- `refreshEventFileList()` e abre `modal-event` ("Novo evento").

### Formulário (modal `#modal-event`, HTML 7420-7481)
Campos, na ordem:

1. **Título** , `#ef-title`, input texto, placeholder "Nome do evento". **Obrigatório.**
2. **Data** , `#ef-date`, texto com máscara `DD/MM/AAAA` (`maxlength=10`, inputmode numeric).
   Chips rápidos (`.quick-chips`): **Hoje** (`setQuickDate(0)`), **Amanhã** (`setQuickDate(1)`),
   **+7 dias** (`setQuickDate(7)`). **Obrigatório.**
3. **Hora (opcional)** , `#ef-time`, texto com máscara `HH:MM` (maxlength 5). Chips:
   **09:00 / 14:00 / 18:00** (`setQuickTime(...)`).
4. **Tipo** , `<select> #ef-type`: REUNIÃO / INVENTÁRIO / PROSPECÇÃO / CARREGAMENTO /
   ORGANIZAÇÃO DE ESTOQUE / ASSEMBLEIA (6 opções).
5. **UF/Estado do evento** , `<select> #ef-uf`: opção vazia "Selecione a UF/Estado" + 27 UFs
   (formato "SP — São Paulo"). Usado pela RBAC regional.
6. **Adicionar colaboradores** , picker "tipo Outlook" (ver §4). Ajuda:
   "Digite o nome, e-mail ou usuário do colaborador e selecione na lista, como no campo de cópia do Outlook."
7. **Anexar arquivos** , `<input type="file" multiple> #ef-files` (ver §5). Ajuda:
   "Arquivos anexados serão salvos junto ao evento neste navegador."
8. **Descrição** , `#ef-desc`, input texto, placeholder "Detalhes (opcional)".
9. Botão **Salvar evento** (`.ef-btn`) => `saveEvent()`.

> Não há campo "dia inteiro" como checkbox: a ausência de hora é tratada como "Dia todo"
> na exibição. Não há campo de início/fim separados , só uma data e uma hora única.

### Helpers de data/hora
- `setQuickDate(offset)` (8824-8827): hoje+offset em BR no `#ef-date`.
- `setQuickTime(t)` (8828): seta texto no `#ef-time`.
- `maskDate(e)` (8829-8834) / `maskTime(e)` (8835-8839): máscaras de digitação.
- `isoToBR` / `brToISO` (8815-8823): conversões com validação de data real (rejeita 31/02 etc).

### `saveEvent()` (async) , linha 8983-9016 (validações)
1. Título e data obrigatórios => `alert('Preencha título e data.')`.
2. Data via `brToISO`; se inválida => `alert('Data inválida. Use o formato DD/MM/AAAA.')`.
3. Hora, se preenchida, precisa casar `^([01]\d|2[0-3]):[0-5]\d$` => senão `alert('Hora inválida. Use o formato HH:MM.')`.
4. Lê anexos via `readEventAttachments()` (pode rejeitar por tamanho, aborta silencioso).
5. Monta o objeto e dá push em `getEvents()`:
   ```
   {id:'evt_'+Date.now(), title, date, time,
    type, uf, desc,
    participants:selectedEventCollaborators(),
    attachments,
    createdBy, createdByName, createdById, createdByUser, createdByEmail,
    createdByHierarchy, createdAt:ISOString}
   ```
6. `saveEvents()` (8597-8605) persiste no localStorage; em erro de quota =>
   `alert('Não foi possível salvar o evento. Os anexos podem estar muito grandes...')`.
7. Limpa título/hora/descrição, reseta colaboradores e arquivos, fecha modal, re-renderiza.

`getEvents()` (8582-8596) lê do localStorage e **auto-gera IDs faltantes** (`evt_<ts>_<i>_<rand>`).

---

## 4. Colaboradores , picker estilo Outlook

HTML do picker `#ef-collab-picker` (7464-7468): container com `.event-people-chips` (chips
selecionados), input `#ef-collab-search` (placeholder "Pesquisar colaborador pelo nome…")
e dropdown `#ef-collab-suggestions`. Clique no container foca o input (`focusEventCollabInput`).

### Lógica
- `eventCollaboratorUsers()` (8843-8845): todos os usuários **menos o usuário atual**.
- `EVENT_COLLAB_SELECTED_IDS` guarda os IDs selecionados.
- `addEventCollaborator(id)` (8859-8867): adiciona (sem duplicar), limpa input, re-renderiza, refoca.
- `removeEventCollaborator(id)` (8868-8873): remove e re-renderiza.
- `resetEventCollaborators()` (8850-8855) / `populateEventCollaborators()` (8856-8858): zera tudo.

### `renderEventCollaboratorPicker(forceOpen)` , linha 8874-8914
- **Chips** (8881): cada selecionado vira `.event-person-chip` com nome + botão `×` (remove).
- **Busca** (8889-8897): normaliza o texto (lowercase, sem acento) e filtra os não-selecionados
  por nome/email/username/cargo/hierarquia/UF. Mostra **até 8** sugestões (`slice(0,8)`).
- **Estados vazios** (8899-8902):
  - Sem usuários cadastrados => "Nenhum colaborador cadastrado" + "Crie usuários no Painel de Usuários...".
  - Sem match => "Nenhum colaborador encontrado" + "Tente pesquisar por outro nome, e-mail ou usuário."
- **Sugestões** (8904): cada uma mostra nome + meta (email · username · UF) +
  tag de hierarquia (`.event-collab-suggestion-tag`). Seleciona via `mousedown` (evita perder foco).
- **Abertura** (8912-8913): dropdown abre se input focado ou `forceOpen`, e há usuários/query.

### `initEventCollaboratorPicker()` , linha 8919-8940
Liga eventos uma vez (`dataset.bound`):
- `input` em foco/digitação => re-renderiza com dropdown aberto.
- `keydown`:
  - **Enter** => adiciona a 1ª sugestão.
  - **Backspace** com input vazio => remove o último chip.
  - **Escape** => fecha sugestões.
- `mousedown` fora do picker => fecha sugestões.

`selectedEventCollaborators()` (8941-8947): converte os IDs em `{id,name,username,email,uf}`
para salvar no evento.

---

## 5. Anexos , `initEventAttachmentInput` / `readEventAttachments`

- Input `<input type="file" multiple> #ef-files` (7473). **Aceita qualquer tipo** (sem `accept`).
- `initEventAttachmentInput()` (9018-9024): liga `change` => `refreshEventFileList` (uma vez, `dataset.bound`).
- `refreshEventFileList()` (8948-8955): lista os arquivos como `.event-file-chip` com nome +
  tamanho arredondado em KB (`Math.ceil(size/1024) KB`). Vazio => limpa a lista.
- `readEventAttachments()` (8956-8971):
  - Soma os tamanhos; se **> 3 MB** => `alert('Os anexos somam mais de 3 MB. Remova arquivos grandes...')` e rejeita.
  - Lê cada arquivo como **DataURL** (base64) via `FileReader`, gerando `{name,size,type,dataUrl}`.
  - Os anexos vão **embutidos no localStorage** (por isso o limite de 3 MB e o alerta de quota).
- Exibição nos cards/detalhes: `eventAttachmentsHtml(ev)` (8394-8402) gera `<a href=dataUrl download=name>`
  para baixar; sem URL, mostra só o nome.

---

## 6. Detalhes do evento , `openEventDetails`

Modal `#modal-event-details` (HTML 7483-7490, max-width 620px, título "Detalhes do evento",
botão "Fechar").

### `openEventDetails(id)` , linha 8707-8754
- Busca o evento; se não achar => `alert('Evento não encontrado.')`.
- **RBAC**: se `!canViewEvent(ev)` => `alert('Acesso negado a este evento.')`.
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
- **Não há botão de editar nem de excluir dentro do modal de detalhes** , só "Fechar".
  A exclusão acontece pelo `×` no card do painel do dia.

---

## 7. Excluir evento , `openEventDeleteConfirm` / `confirmDeleteEvent`

Modal `#modal-event-delete` (HTML 7492-7505, max-width 420px). Título "Excluir evento".
Bloco de aviso vermelho `.event-delete-warning`: "DESEJA EXCLUIR O EVENTO?" +
`#event-delete-name`. Botões **Excluir** (`.danger-btn` vermelho) e **Cancelar** (`.cancel-btn`).

### Fluxo
- `openEventDeleteConfirm(evt,id)` (8757-8768): para propagação, valida id/evento, checa
  `canDeleteEvent(ev)` (senão `alert('Você não tem permissão para excluir este evento.')`),
  guarda `PENDING_DELETE_EVENT_ID`, mostra `Evento: <título>` (ou "Esta ação não poderá ser desfeita.")
  e abre o modal.
- `cancelDeleteEvent()` (8769-8772): zera o pendente e fecha.
- `confirmDeleteEvent()` (8773-8785): filtra o evento da lista, salva, fecha ambos os modais
  (delete + details) e re-renderiza calendário + painel. Se já não existir =>
  `alert('Evento não encontrado. Atualize a página...')`.
- `deleteEvent(id)` (8786): atalho que chama `openEventDeleteConfirm(null,id)`.

---

## 8. Filtros avançados , `openEventAdvancedFilters`

Modal `#modal-event-filters` (HTML 7522-7596, max-width 520px). Título "Filtros avançados".
Grade 2 colunas (`.adv-filter-grid`, vira 1 col em <640px).

### Campos
- **Tipo de evento** , `#af-type`: Todos + os 6 tipos.
- **Período** , `#af-period`: Todos / Hoje / Esta semana / Este mês / Intervalo personalizado
  (`onchange="toggleEventCustomPeriod()"`).
- **Intervalo personalizado** , `#af-custom-period` (escondido até escolher "custom"):
  Data inicial `#af-date-from` (`type=date`) + Data final `#af-date-to`.
- **Horário** , `#af-time`: Todos / Manhã / Tarde / Noite.
- **Criado por** , `#af-created-by`: Todos / Apenas meus eventos / Eventos de outros usuários.
- **Participantes** , `#af-participants`: Todos / Eventos em que participo / Eventos com funcionários específicos.
- **Funcionário específico** , `#af-participant-text` (texto livre: nome, usuário ou e-mail).
- Dica: "A busca combina o texto digitado na barra com os filtros selecionados aqui."
- Ações: **Aplicar filtros** / **Limpar filtros** / **Fechar**.

### Lógica
- `openEventAdvancedFilters()` (8538-8549): popula os campos com `EVT_ADV_FILTERS`, ajusta o
  bloco custom, abre o modal.
- `toggleEventCustomPeriod()` (8550-8554): mostra/esconde o bloco de datas (classe `.show`).
- `applyEventAdvancedFilters()` (8555-8571): lê todos os campos => `EVT_ADV_FILTERS`,
  sincroniza `EVT_FILTER` e os chips, re-renderiza, fecha.
- `clearEventAdvancedFilters()` (8572-8581): zera tudo (filtros, busca, chips, inputs) e re-renderiza.

### Avaliação dos filtros , `eventMatchesFilters(ev)` (8522-8536)
Combina (AND):
- **Tipo**: `getEffectiveEventTypeFilter()` (adv.type || EVT_FILTER) , compara `eventTypeKey`.
- **Busca textual** (`EVT_SEARCH`): casa contra `eventText(ev)` (8370-8377) , que concatena
  título, descrição, rótulo+chave do tipo, hora, UF/estado, criador, participantes e nomes de anexos.
- **Período** (`eventMatchesPeriod`, 8491-8511): today / week (domingo a sábado da semana atual) /
  month / custom (entre `from` e `to`).
- **Horário** (`eventMatchesTime`, 8512-8521): morning 05-11h / afternoon 12-17h / night 18-23h
  (lê a hora de `ev.time`).
- **Criado por**: `mine` (eventCreatedByMe) / `others`.
- **Participantes**: `me` (sou colaborador) / `specific` (texto casa em `eventParticipantsText`).

`getFilteredDayEvents(iso)` (8537): visíveis + do dia + `eventMatchesFilters` + ordenados por hora.
A grade (`makeCell`) e o contador também respeitam `eventMatchesFilters`.

---

## 9. RBAC de eventos (visibilidade e exclusão)

Camada de hierarquia comercial (linha 7813-7818):
`VENDEDOR REGIONAL`(1) < `GERENTE COMERCIAL REGIONAL`(2) < `SUB GERENTE COMERCIAL GLOBAL`(3) < `DIRETOR COMERCIAL GLOBAL`(4).

- `canViewEvent(ev,user)` (8458-8485):
  - Master (admin / `owner-icaro` / `isMaster`) vê tudo.
  - Criador ou colaborador manual sempre vê.
  - Senão, só vê eventos de **níveis inferiores** (`viewerLevel<=creatorLevel` => bloqueia).
  - **Gerente Comercial Regional** só vê eventos de **Vendedor Regional da mesma UF**
    (`regionalUfsCanSeeEvent`, 7980-7988; ex.: gerente do CE não vê vendedor da BA).
  - Sub Gerente Global e Diretor Global veem todos abaixo, sem restrição de UF.
- `canDeleteEvent(ev,user)` (8486-8489): master, admin, ou o próprio criador.
- `getVisibleEvents()` (8490): filtra a lista por `canViewEvent`.

A UF do evento (`#ef-uf`) e a UF do usuário (`userRegionalUfs`, 7866-7868) alimentam essa regra.

---

## 10. Interações, animações, estados e textos exatos , resumo

- **Clicar num dia** da grade => seleciona (destaque dourado) + abre o painel do dia. Sem drag-and-drop.
- **Hover**: célula do dia (fundo `--s3`), card de evento (fundo `--s3`), chips/botões (borda dourada).
- **Tooltips nativos** (`title`): mini-eventos (título completo), card ("Clique para ver detalhes"),
  botão `×` ("Excluir evento"), botão `⋯` ("Filtros avançados").
- **"Dia todo"** quando o evento não tem hora.
- **Transições CSS**: fundo .12s nas células/cards, .15s nos botões; dropdown de colaboradores
  com `box-shadow:0 16px 50px rgba(0,0,0,.55)`. Sem animações JS complexas.
- **Mobile**: grade de detalhes e filtros viram 1 coluna (<700px / <640px); ações empilham.
- **Persistência**: tudo em `localStorage['ig_events']`; anexos em base64 (limite 3 MB).
- **Estados vazios** (textos exatos):
  - Painel inicial: "Selecione um dia no calendário."
  - Dia sem eventos: "Nenhum evento neste dia.\nUse o botão acima para criar."
  - Dia com filtro ativo sem match: "Nenhum evento encontrado com os filtros selecionados."
  - Picker sem usuários: "Nenhum colaborador cadastrado" / "Crie usuários no Painel de Usuários para adicioná-los ao evento."
  - Picker sem match: "Nenhum colaborador encontrado" / "Tente pesquisar por outro nome, e-mail ou usuário."
- **Alerts (validação)**: "Preencha título e data.", "Data inválida. Use o formato DD/MM/AAAA.",
  "Hora inválida. Use o formato HH:MM.", "Os anexos somam mais de 3 MB...",
  "Não foi possível salvar o evento. Os anexos podem estar muito grandes...",
  "Acesso negado a este evento.", "Você não tem permissão para excluir este evento.",
  "Evento não encontrado."

---

## 11. Lacunas / pontos de atenção para a reconstrução

1. **9 tipos no mapa, 6 nos selects** , `interno/prazo/entrega` são legado (só CSS+rótulo). Decidir.
2. **Sem editar evento** , só criar, ver e excluir. Não há fluxo de edição.
3. **Sem início/fim nem "dia inteiro" explícito** , um único campo de data + hora opcional.
4. **Anexos em base64 no localStorage** , inviável em produção (Postgres/upload real). Limite 3 MB é do navegador.
5. **RBAC por hierarquia comercial + UF** , precisa mapear para o modelo de usuários/permissões real do nexus-odoo.
6. **Persistência local** , na reconstrução vira API/banco; a estrutura do objeto evento (campos `createdBy*`, `participants`, `attachments`, `uf`, `type`) é o contrato a portar.
7. **Visão única (mês)** , sem semana/dia/agenda; multi-mês é só empilhamento com scroll.
