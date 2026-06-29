# Construtor modular da Diretoria , SPEC (Onda 1: Estoque & Compras)

> Pedido do cliente (2026-06-29, feedback sobre as 5 telas BI já entregues):
> modularizar os relatórios em **componentes identificados** (A1, A2, B1, C1…),
> com **grid em quadrantes 4×4 arrastável**, **modo de edição** e **filtros
> globais**. Decisões do cliente (AskUserQuestion): (1) **provar numa área
> primeiro** , Estoque & Compras; (2) layout salvo é **duplo: oficial (global) +
> personalização pessoal por usuário**.

## 0. Reaproveitar a infra existente (NÃO recriar)
A Wave 1 do builder anterior continua no código e cobre boa parte:
- **Schema** `DiretoriaRelatorio` (`tela`, `donoUserId`, `isPadrao`) +
  `DiretoriaRelatorioBloco` (`componenteId`, `ordem`, `larguraQuartos`,
  `alturaU`, `configJson`). Suporta layout duplo: `isPadrao=true & donoUserId=null`
  = oficial; `donoUserId=<user>` = pessoal.
- `src/lib/diretoria/builder/catalogo.ts` , catálogo com `id, nome, dominio
  (G/C/B/A/K), tipo (kpi/tabela/grafico/mapa/widget), fonteDado, capability,
  publica[], consome[]` + `travasDoTipo` (larguraMin/Max, alturaMin/Max) +
  `LARGURAS=[1..4]`, `ALTURAS=[1,2,3,4,6]`.
- `src/lib/diretoria/builder/{loaders,layout-repo,gating}.ts` e
  `src/components/diretoria/builder/{grid-relatorio,render-componente}.tsx`.
**Passo 1 da execução: auditar esses arquivos e o que já renderiza.**

## 1. Nomenclatura (catálogo de Estoque & Compras)
Cada bloco coeso das telas BI já feitas vira um componente do catálogo. Mapa
componenteId → render (reusar os blocos já construídos em `estoque-screen.tsx`,
extraindo-os para componentes reutilizáveis):
- **A-01** Indicadores de estoque (4 KPIs) , kpi
- **A-09** Indicadores avançados (idade/cobertura/giro/valor médio) , kpi
- **A-02** Estoque por local (top cards + DataTable %) , tabela
- **A-03** Distribuição por família (donut clicável) , grafico
- **A-04** Distribuição por marca (donut clicável) , grafico
- **A-05** Catálogo de modelos (DataTable + filtro família) , tabela
- **A-06** Seriais (lista + por modelo) , tabela
- **A-07** Compras ativas (KPIs + chips prazo + tabela) , widget
- **A-08** Matriz por fornecedor (KPIs-filtro + DataTable) , tabela
- **K/A** Compras por fornecedor (donut NF entrada) , grafico
Travas de tamanho mínimo por tipo já em `travasDoTipo` (kpi 1×1..2×2, tabela
1×2..4×6, grafico 2×2..4×4, mapa 2×3..4×6). Validar com o desenho real.

## 2. Grid 4×4 em quadrantes
- Lib: **react-grid-layout** (instalar). `cols=4` (quartos), `rowHeight` ≈ u
  (~132px), `margin` compacto. `draggableHandle` = "mãozinha" (ícone grip no
  canto sup. direito do bloco, aparece no modo edição). Resize pelas bordas.
- Cada bloco: `w=larguraQuartos (1..4)`, `h=alturaU`, `minW/minH/maxW/maxH` das
  travas do tipo. Snap nativo a quadrantes. Área = w×h.
- Modo **view**: estático (sem drag/resize), lê o layout resolvido.
- Modo **edição**: drag/resize ligados, paleta lateral de componentes
  disponíveis (catálogo filtrado por capability) para adicionar/remover, botão
  "Salvar layout" (oficial se admin / pessoal caso contrário) e "Restaurar".

## 3. Persistência (layout duplo)
- Resolução na leitura: **layout pessoal do usuário** (donoUserId=user, tela) →
  senão **oficial** (isPadrao, tela) → senão **default em código** (o arranjo
  atual das telas BI). `layout-repo.ts` evolui para essa cascata.
- Salvar: quem tem `diretoria.layout.edit.global` salva o **oficial**; qualquer
  um com `diretoria.layout.edit` salva o **pessoal**. "Restaurar para o oficial"
  apaga o pessoal.

## 4. Filtros globais vs por componente
- Pílulas no topo (período + novos: UF, local) publicam contexto; componentes
  com `consome:["periodo","uf",...]` re-renderizam. Catálogo já tem publica/
  consome , ligar ao estado global da tela (client) + re-query quando server.
- Cada componente pode ter filtro próprio interno (ex.: A-05 família, A-08
  status), independente do global.

## 5. RBAC / modo de edição
- Nova capability `diretoria.layout.edit` (pessoal) e
  `diretoria.layout.edit.global` (oficial). super_admin tem ambas.
- Toggle "Editar tela" só aparece com a capability. Fora do modo edição, tela
  normal (navegação por abas mantida).

## 6. Faseamento
- **Onda 1 (esta):** Estoque & Compras , catálogo A-*, grid editável (drag/
  resize/quadrantes/travas), modo edição com paleta, persistência dupla,
  filtros globais período+UF+local. Validar por screenshot (view + edição +
  salvar + recarregar).
- **Onda 2:** espalhar para Vendas/Pedidos/Visão/Agenda; novos submenus
  customizados (telas montadas do zero); RBAC fino; filtros globais por domínio.

## 7. Riscos / cuidados
- Reusar os blocos BI já validados como renders (não duplicar lógica).
- SQL cirúrgico; migration do schema já existe (DiretoriaRelatorio*) , conferir
  se aplicada no banco; se faltar, migration cirúrgica (nunca db push).
- Manter navegação por abas + sync auto + KPIs abreviados já entregues.
- react-grid-layout responsivo: definir breakpoints (desktop 4 cols; mobile 1).
