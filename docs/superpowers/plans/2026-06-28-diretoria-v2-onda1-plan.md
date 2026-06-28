# PLAN , Diretoria v2 / Onda 1 (fundação do construtor)

> Status: **v3** (incorpora reviews #1 granularidade e #2 técnica). Base: SPEC v3.
> Objetivo: infra do construtor ponta a ponta com blocos reais, SEM editor.
> Render do layout salvo, posicionamento sem sobreposição, gating no server,
> registry de loaders com dedupe e tolerância a falha.
> Regras: TDD; SQL cirúrgico (NUNCA db push); commits atômicos; sem merge sem ok.

## Decisões que vêm das reviews (cravadas)
1. **Posicionamento via CSS Grid nativo**, não packing manual. Grade
   `grid-template-columns: repeat(12,1fr); grid-auto-rows: 132px; grid-auto-flow:
   row dense`. Cada bloco: `grid-column: span (largura*3); grid-row: span altura`.
   O browser posiciona sem sobreposição; `dense` preenche buracos. A função pura é
   só **normalização** (clamp às travas + ordenação), não cálculo de x/y.
2. **Alvo da onda = Visão Geral** (`/diretoria/visao-geral`, hoje simples). NÃO
   reescrever Estoque/Vendas/Demandas (evita regressão dos blocos atuais). Telas
   ricas migram nas ondas seguintes.
3. **Sem `Map` cross-RSC**: o server resolve dados (allSettled) e passa a cada
   bloco o seu pedaço PLANO/serializável; gráficos client recebem arrays simples.
4. **Travas de altura discretas** {1,2,3,4,6}; **capability obrigatória** no tipo.
5. **allSettled** no registry: loader que falha não derruba o relatório (bloco
   mostra erro). Suspense por bloco fica para refino posterior (não nesta onda).

## Resultado verificável
`/diretoria/visao-geral` (logado) renderiza um relatório montado de um layout
PADRÃO (seed) com >=3 blocos reais posicionados por CSS grid, dado real do cache,
gating server (bloco sem permissão não renderiza nem consulta). tsc 0; testes verdes.

## Tasks (bite-sized, TDD)

### T1 , Tipos + catálogo
- `src/lib/diretoria/builder/catalogo.ts`.
- Tipos: `TipoComponente`, `FonteDado`, `ComponenteCatalogo { id; nome; dominio;
  tipo; fonteDado; larguraMin; larguraMax; alturaMin; alturaMax; capability: string;
  publica?: string[]; consome?: string[] }` (capability OBRIGATÓRIA).
- `LARGURAS=[1,2,3,4]`, `ALTURAS=[1,2,3,4,6]`, `travasDoTipo(tipo)`.
- Catálogo com os componentes da SPEC §5 (todos declarados; loaders em T5).
- Teste: ids únicos; cada largura/altura ∈ conjunto e dentro das travas do tipo;
  capability não vazia.

### T2 , Normalização de layout (função pura)
- `src/lib/diretoria/builder/layout.ts`.
- `BlocoLayout { componenteId; ordem; largura; altura }`;
  `normalizar(blocos, catalogo): BlocoLayout[]` , clampa largura/altura às travas
  do tipo do componente, descarta componenteId inexistente, ordena por `ordem`.
- `spanColunas(largura)=largura*3`, `spanLinhas(altura)=altura`.
- Teste: clamp acima/abaixo; altura 5 → vira válida mais próxima (4); id
  desconhecido removido; ordenação; vazio.

### T3 , Schema (SQL cirúrgico)
- `prisma/schema.prisma`:
  - `DiretoriaRelatorio { id @db.Uuid; tela; donoUserId @db.Uuid?; isPadrao;
    createdAt; updatedAt; blocos DiretoriaRelatorioBloco[] }`
  - `DiretoriaRelatorioBloco { id @db.Uuid; relatorioId @db.Uuid; componenteId;
    ordem; larguraQuartos; alturaU; configJson Json?; relatorio @relation(...,
    onDelete: Cascade); @@index([relatorioId]) }`
  - índice único parcial p/ padrão: garantir 1 padrão por tela (unique
    (tela) where isPadrao) e 1 por (tela, donoUserId).
- Aplicar com `prisma db execute` (CREATE TABLE + índices idempotentes) + `prisma
  generate`. Verificar via information_schema; `tsc` 0.

### T4 , Repositório de layout
- `src/lib/diretoria/builder/layout-repo.ts`.
- `carregarLayout(prisma, tela, userId): Promise<BlocoLayout[]>` , layout do
  usuário se existir; senão o padrão; ordena. (salvarLayout = Onda 4, só assinatura
  stub documentada.)
- Teste (mock prisma): usuário > padrão; padrão quando sem usuário; vazio; ordem.

### T5 , Adapters + registry de loaders + dedupe (allSettled)
- `src/lib/diretoria/builder/loaders.ts`.
- `LoaderCtx { periodoDe?; periodoAte?; uf?; escopoUfs?: string[] }`.
- **Adapters** que casam a assinatura real das queries existentes (algumas só
  recebem `prisma`, e `queryEstoquePorLocal` retorna Promise , conferir): cada
  loader é `(prisma, ctx) => Promise<dadoPlano>`.
- Registrar 3+ componentes reais com query pronta: `G-01` (KPIs executivos , montar
  de queries existentes de faturamento/a receber/a pagar/estoque/demandas), e 2
  outros já disponíveis.
- `resolverBlocos(prisma, ids, ctx)` , dedupe por id, `Promise.allSettled`,
  retorna `Array<{ id, ok, dado?, erro? }>` (sem Map; serializável).
- Teste (mock prisma): dedupe (1 chamada p/ id repetido); allSettled (1 falha não
  derruba os demais); id sem loader → `{ok:false}`.

### T6 , Grid de render (server)
- `src/components/diretoria/builder/grid-relatorio.tsx` (server) + `bloco-card.tsx`.
- `<GridRelatorio>`: CSS grid (12 col, auto-rows 132px, row dense); cada bloco
  `style={{ gridColumn: span L*3, gridRow: span A }}`; < 768px → span 12.
- `<BlocoCard titulo fonteDado>`: casca rounded-2xl border bg-card/60 + selo quando
  fonteDado ≠ real; children = componente concreto. UI inline ui-ux-pro-max.

### T7 , Renderizadores dos blocos (mapa id → componente)
- `src/components/diretoria/builder/render-componente.tsx`: `componenteId` →
  componente que recebe o dado plano do loader. Implementar os 3+ da onda (G-01 +
  2). Gráfico = client component recebendo array simples; KPI/tabela = server.

### T8a , Gating (função pura + teste)
- `src/lib/diretoria/builder/gating.ts`: `filtrarPermitidos(blocos, catalogo,
  pode: (cap)=>boolean): BlocoLayout[]` , remove bloco cujo `capability` o usuário
  não tem. Teste isolado.

### T8b , Seed do layout padrão (script idempotente)
- `scripts/seed-diretoria-relatorio.ts` (ou função em layout-repo): cria o
  relatório padrão de 'visao-geral' com os blocos da onda se não existir
  (idempotente; fora do GET da página, evita race). Rodar manualmente.

### T8c , Página da Visão Geral montada
- Reescrever `src/app/(protected)/diretoria/visao-geral/page.tsx`: resolve user;
  `carregarLayout('visao-geral', user)`; `normalizar`; `filtrarPermitidos`
  (gating server via `canDiretoria`); `resolverBlocos` (só permitidos, com escopo
  `userUfs`); render `<GridRelatorio>` mapeando cada bloco via render-componente.
- Preservar atalhos/KPIs atuais como blocos do layout padrão (não perder o que há).
- E2E browser: layout padrão com dado real; bloco sem permissão ausente (e sem
  query disparada , conferir log).

## Verificação da onda
- `npx tsc --noEmit` 0; `jest` nos novos testes (catalogo, layout, layout-repo,
  loaders, gating) verdes.
- E2E: `/diretoria/visao-geral` monta o layout padrão com dado real; gating ok.
- Commits atômicos por task; push; SEM merge.

## Notas
- Reusa queries existentes (vendas/estoque/pedidos/financeiro); adapters casam
  assinaturas. Não recria mapa (Onda 2/3).
- Sem lib de drag nesta onda (editor = Onda 4).
- SQL cirúrgico só (drift da worktree nex-reconstrucao). Tocar src/worker não
  ocorre nesta onda; sem rebuild de container.
