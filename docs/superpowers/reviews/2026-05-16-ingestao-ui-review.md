# F2 — UI Review: tela `/configuracao`

**Auditado:** 2026-05-16
**Baseline:** Padrão `/usuarios` (F1 design system) — sem UI-SPEC.md formal
**Screenshots:** não capturados (dev server respondeu 302/redirect de auth; rota é super_admin-only, captura CLI sem sessão inviável). Auditoria por código.
**Branch:** feat/ingestao

---

## Pillar Scores

| Pillar | Score | Achado-chave |
|--------|-------|--------------|
| 1. Consistência visual | 3/4 | Estrutura fiel (PageShell/PageHeader/Tabs/motion), mas tabela do tab Estado não usa o componente `<Table>` da mesma forma e diverge da `audits-table` |
| 2. Layout / Spacing | 3/4 | Spacing dentro da escala; `gap-1.5` no campo de form é micro-divergência do padrão `gap-2`/`space-y` |
| 3. Tipografia / Cor | 3/4 | Badges de status reutilizam a paleta correta com override de light mode; falta cor para status desconhecido tratado igual a `sem_acesso` |
| 4. Acessibilidade | 2/4 | Inputs `type=number` sem validação visível de min; tabela de 79 linhas sem `<caption>`/resumo; badge de status é só cor+texto (ok), mas sem `aria-label` distinto |
| 5. Interação / Feedback | 2/4 | Sem estado de loading na tabela (render server-side, ok), porém **sem confirmação ao salvar intervalos** e **sem estado de erro de carga**; botão Salvar não desabilita quando o form está intocado |
| 6. Responsividade | 3/4 | `grid sm:grid-cols-3` + `overflow-x-auto` cobrem mobile; tabela de 5 colunas em 375px fica espremida sem priorização de colunas |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Botão "Salvar" sempre habilitado, sem proteção contra valores inválidos** (WARNING → quase BLOCKER) — `configuracao-content.tsx:159`. O input aceita `min={1}` no HTML mas `Number(e.target.value)` converte vazio/0/negativo sem bloqueio; um super_admin pode salvar `0` minutos e quebrar o cron. **Fix:** validar `form` antes de `salvar()` (todos `>= 1`), desabilitar o botão quando inválido ou quando `form` é igual a `config` (dirty check), e mostrar erro inline no `<Input>` via `aria-invalid`.

2. **Tab Estado sem estado de erro nem skeleton, divergindo da `audits-table`** (WARNING) — `configuracao-content.tsx:166-214`. A `audits-table` de referência tem três estados (loading skeleton / erro com "Tentar novamente" / vazio). O tab Estado só tem vazio. Como os dados vêm server-side via `getSyncState()`, uma falha de query derruba a página inteira sem fallback amigável. **Fix:** envolver em `error.tsx` de rota ou passar um flag de erro e renderizar o mesmo bloco `role="alert"` + botão usado na `audits-table`.

3. **Cabeçalhos de tabela inconsistentes com o padrão `/usuarios`** (WARNING) — `configuracao-content.tsx:179-183` usa `<TableHead className="text-xs">`, enquanto `users-content.tsx:284` usa `<TableHead className="text-muted-foreground">` e `audits-table.tsx:126` usa `text-xs`. Há duas convenções concorrentes no próprio design system e a tela nova herdou a da `audits-table`, não a da `users-content`. **Fix:** padronizar — recomendado `text-xs text-muted-foreground` em ambas as telas, ou alinhar à decisão canônica do F1 e replicar.

---

## Detailed Findings

### Pillar 1: Consistência visual (3/4)
- **Bom:** wrapper `motion.div` com `initial/animate/transition` idêntico ao de `users-tabs.tsx` e `users-content.tsx` (opacity 0→1, 0.2s). `Tabs`/`TabsList`/`TabsTrigger` com ícone `h-3.5 w-3.5` + `aria-hidden` — fiel ao padrão. `PageShell variant="narrow"` + `PageHeader` com `icon`/`title`/`subtitle` espelham `usuarios/page.tsx`.
- **WARNING:** o container do tab Estado (`configuracao-content.tsx:167`) replica `overflow-hidden overflow-x-auto rounded-xl border border-border bg-card/50` da `audits-table.tsx:98` — correto. Porém o tab Sincronização usa `<Card>` com `ring-1 ring-foreground/10`, enquanto a tabela usa `border` — dois tratamentos de superfície na mesma tela. Aceitável (form vs. tabela), mas não há precedente de `<Card>` em `/usuarios`; é um elemento novo no design system sem baseline de comparação.
- **Nota:** `Badge variant="outline"` com classes de cor sobrepostas segue exatamente o padrão de `audits-table.tsx:137-140`. Consistente.

### Pillar 2: Layout / Spacing (3/4)
- **Bom:** `space-y-4` no wrapper e `mb-4` no `TabsList` batem com `users-tabs.tsx`. `space-y-6` no `CardContent` e `gap-4` no grid estão na escala Tailwind padrão.
- **WARNING:** `flex flex-col gap-1.5` (linha 144) para Label+Input+helper — `1.5` é válido na escala mas o padrão de formulário do projeto (ver `user-form-dialog`) não foi confrontado aqui; risco de divergência de ritmo vertical entre forms.
- Sem valores arbitrários (`[12px]` etc.). Limpo.

### Pillar 3: Tipografia / Cor (3/4)
- **Bom:** `font-mono text-xs` na coluna Modelo é apropriado para nomes técnicos de modelo Odoo. `tabular-nums` na coluna Registros — bom detalhe de alinhamento numérico.
- **Bom:** paleta de status (`emerald/red/violet/muted`) reaproveita as cores já cobertas pelo override de light mode em `globals.css:126-131`, então o contraste WCAG AA está garantido em ambos os temas sem trabalho extra.
- **WARNING:** `getStatusBadgeClasses` e `getStatusLabel` mandam status desconhecido para o estilo/label `default` (cinza) — silencioso. Se o worker gravar um status novo, a UI o exibe cru sem sinalização. Menor, mas é dívida.
- Sem cores hardcoded em hex/rgb nos arquivos de escopo. `text-xs` é o único tamanho dominante na tabela — coerente.

### Pillar 4: Acessibilidade (2/4)
- **Bom:** `Label htmlFor={key}` corretamente associado ao `Input id={key}`. Ícones com `aria-hidden`. Estado vazio com `role="status"`.
- **WARNING:** os `<Input type="number">` têm `min={1}` mas não há `aria-invalid` nem mensagem de erro quando o usuário digita valor inválido — o feedback de validação é puramente o comportamento nativo do browser, inconsistente entre navegadores.
- **WARNING:** tabela de 79 linhas sem `<caption>` nem texto de contagem ("79 modelos"). Usuário de leitor de tela não tem âncora de escala.
- **WARNING:** os badges de status comunicam por cor + texto (texto presente, então não é falha crítica), mas linhas iguais só se distinguem pela cor do badge; nenhum `aria-label` na linha para resumir o estado.
- **Nota:** botão Salvar tem texto que muda para "Salvando…" — bom para SR.

### Pillar 5: Interação / Feedback (2/4)
- **Bom:** `useTransition` + `toast.success`/`toast.error` no `salvar()` espelham o padrão de `users-content.tsx`. Botão desabilita durante `pending`.
- **BLOCKER (de fluxo):** botão Salvar **não tem dirty-check** — fica habilitado mesmo sem mudança, e **não valida** os valores antes de enviar. Combinado com `min` apenas no HTML, permite persistir intervalos inválidos.
- **WARNING:** tab Estado não tem estado de erro de carga. Diferente da `audits-table`, que tem `loadError` + botão "Tentar novamente". Aqui, falha de `getSyncState()` é responsabilidade de um `error.tsx` de rota que não está no escopo auditado — não confirmado existir.
- **WARNING:** alterar intervalo de sync é uma ação com efeito operacional (muda comportamento do cron) e não há `AlertDialog` de confirmação como o usado para exclusão de usuário. Avaliar se merece confirmação.

### Pillar 6: Responsividade (3/4)
- **Bom:** `grid gap-4 sm:grid-cols-3` empilha os 3 campos no mobile e alinha em 3 colunas a partir de `sm`. `overflow-x-auto` no container da tabela evita quebra de layout.
- **WARNING:** tabela de 5 colunas em viewport 375px depende de scroll horizontal sem priorização — colunas "Modo"/"Registros" poderiam recolher. Aceitável para tela super_admin-only (uso predominante desktop), mas não é o ideal.
- `PageShell variant="narrow"` limita a largura — coerente com `/usuarios`.

---

## Registry Safety
Não aplicável — sem `components.json` com registries de terceiros no escopo. Auditoria de registry pulada.

---

## Files Audited
- `src/app/(protected)/configuracao/page.tsx`
- `src/app/(protected)/configuracao/configuracao-content.tsx`
- `src/lib/constants/nav.ts`
- Referência: `src/app/(protected)/usuarios/page.tsx`, `src/components/users/users-tabs.tsx`, `src/components/users/audits-table.tsx`, `src/components/users/users-content.tsx`
- Design system: `src/components/ui/{badge,table,input,card}.tsx`, `src/app/globals.css`
