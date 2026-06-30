# Diretoria v2 , Visão consolidada (base da SPEC)

> Documento de visão/requisitos. Nasce da insatisfação com a entrega v1 (que
> reproduziu uma fração do HTML, com mapa gigante em telas erradas, tabelas
> pobres e bug na tela de compras). Aqui ficam registrados os requisitos reais,
> a perícia do HTML e as decisões de arquitetura para a reconstrução completa.
>
> Perícia forense completa do HTML (18.971 linhas) em
> `docs/superpowers/specs/pericia-html/` (7 arquivos, um por módulo).
> HTML-fonte: `~/Downloads/index_vendas_c6_c10_trocados_c7_filtra_pagamentos.html`.

## 1. Princípios inegociáveis

1. **Nada do HTML pode faltar.** Todo componente (A*, B*, C*, agenda,
   permissões) precisa existir na reconstrução. Pode ser reagrupado e melhor
   organizado; não pode ser omitido.
2. **Melhor organizado que o HTML.** O HTML é poluído, com texto demais e
   versões empilhadas (código morto). Reorganizar, agrupar e enxugar texto, sem
   perder função.
3. **Dado real, honesto.** Onde o cache tem o dado, usar o real. Onde só dá pra
   aproximar (margem via preço de custo), rotular "estimado/aproximado". Onde não
   há fonte (ex.: % reservado), marcar "sem fonte" ou ocultar. Nunca inventar.
   (Decisão canônica do projeto: verdade-vs-dado.)
4. **Tudo animado e interativo.** Hover traz legenda; clique em barra/fatia/UF
   traz informação ou filtra; transições suaves; respeitar `prefers-reduced-motion`.
5. **Qualidade visual de produto.** Padrão de acabamento igual ao print do mapa
   que o cliente aprovou (choropleth, glow no hover, tooltip confinado e tracking).

## 2. A grande mudança: de "telas fixas" para "construtor de relatórios"

O cliente quer um **construtor de dashboards** sobre um **catálogo de componentes**:

- Cada gráfico/tabela/KPI/mapa/widget é um **componente catalogado** (id estável,
  tipo, domínio, fonte de dado, tamanhos permitidos, interações).
- Usuários com permissão entram no **modo edição** de um relatório/tela: veem a
  **paleta de componentes disponíveis**, **ativam/desativam**, **posicionam** e
  **redimensionam** num grid com travas, e **salvam** o layout.
- O resultado é uma ou mais **telas/relatórios montáveis**, não telas hardcoded.

Isto se relaciona com a F6 (Construtor de relatórios) do roadmap, mas aqui é o
**construtor de LAYOUT da Diretoria** (posicionar componentes prontos), não o
wizard de geração por IA. Vale a REGRA DURÁVEL: **só local até aprovação
explícita; não mergear para `main` sem o "sim" do usuário.**

## 3. Catálogo de componentes , regra de índice (proposta)

Prefixo de uma letra por **domínio** + número sequencial de dois dígitos. A letra
herda a convenção do HTML onde fizer sentido (A=estoque, B=demandas, C=vendas) e
separa Compras (que no HTML estava enfiada no estoque como A7/A8).

| Letra | Domínio | Exemplos |
|---|---|---|
| **G** | Geral / Visão executiva | `G-01` KPIs globais, `G-02` atalhos |
| **C** | Vendas (Comercial) | `C-01` KPIs, `C-02` por estado, `C-03` por marca... |
| **B** | Demandas / Pedidos | `B-01` pendentes, `B-04` mapa, `B-05` drill-in... |
| **A** | Estoque (Armazém) | `A-01` valor/local, `A-03` catálogo+ideal... |
| **K** | Compras | `K-01` detalhe da compra, `K-02` resumo/fornecedores |

Cada componente no catálogo tem metadados:
`{ id, nome, dominio, tipo, fonteDado, larguraMin..Max (quartos), alturaMin..Max (u), interacoes[], capability }`.
- **tipo**: `kpi` | `tabela` | `grafico` | `mapa` | `widget`.
- **fonteDado**: `real` | `estimado` | `sem_fonte`.
- **capability**: RBAC necessário para ver o componente.

O índice completo (cada A*/B*/C* do HTML mapeado para o novo id) é construído na
SPEC, a partir da perícia. Componentes ambíguos/duplicados do HTML são fundidos.

## 4. Sistema de grid e travas (proposta, ajustável)

- **Horizontal**: grid de **12 colunas** por baixo, exposto ao usuário como
  **quartos**: 1/4 (3 col), 2/4 (6 col), 3/4 (9 col), 4/4 (12 col, largura cheia).
- **Vertical**: unidade de altura `u` ≈ 140px. **5 alturas**: 1u, 2u, 3u, 4u, 6u.
- **Travas por tipo**:
  | Tipo | Largura | Altura |
  |---|---|---|
  | `kpi` | 1/4–2/4 | 1u |
  | `tabela` | 1/4–4/4 (scroll x/y quando estreita) | 2u–6u |
  | `grafico` | 2/4–4/4 | 2u–4u |
  | `mapa` | 2/4–4/4 | 3u–6u |
  | `widget` | 2/4–4/4 | 2u–6u |
- Componente que encolhe se adapta: tabela ganha rolagem; gráfico re-renderiza no
  novo tamanho; KPI mantém legibilidade.
- Layout responsivo: em telas estreitas, os blocos colapsam para largura cheia
  empilhada (mobile-first; sem scroll horizontal da página).

## 5. Editor de layout (modo edição)

- Botão "Editar relatório" (gated por capability `diretoria.relatorio.editar`).
- Ao entrar: aparece a **paleta lateral** de componentes disponíveis (filtrável
  por domínio), grade com guias dos quadrantes, e cada bloco ganha alças de
  mover/redimensionar (dentro das travas).
- Ativar componente = arrasta da paleta para a grade (ou clica "adicionar").
  Desativar = remove da grade (volta para a paleta).
- **Salvar** persiste o layout; **descartar** reverte. Pré-visualização (sair do
  modo edição) mostra o relatório final.
- Acessibilidade: além de drag, oferecer controles por teclado/menu (mover,
  redimensionar, remover) , não depender só de arrastar.

## 6. Persistência de layouts (proposta)

- **Layout padrão por relatório/tela**, definido pelo super_admin (template).
- **Layouts por usuário** (quem tem permissão salva o seu); fallback para o
  padrão quando o usuário não tem layout próprio.
- Schema novo (SQL cirúrgico, nunca `db push`): `diretoria_relatorio` (tela,
  dono opcional, é_padrão) + `diretoria_relatorio_bloco` (componenteId, x, y,
  largura, altura, ordem, config_json). Detalhar na SPEC.

## 7. Interatividade e animação , padrão de qualidade

- **Tooltip do mapa (referência aprovada pelo cliente):** confinado ao quadro do
  componente; aparece só quando o cursor está sobre uma UF (some em área vazia do
  quadro); segue o mouse; troca de conteúdo ao mudar de estado; UF em hover ganha
  contorno branco com glow. Conteúdo: `UF — Nome / valor da métrica / detalhes`.
- **Gráficos de barra/pizza:** hover destaca + tooltip; clique filtra/expande
  (ex.: clicar barra de item filtra formas de pagamento; clicar fatia foca).
- **Tabelas:** linha clicável faz drill-in (ex.: pedido → KPIs do pedido); ordenar
  por coluna; busca; rolagem quando estreita.
- **Transições:** 150–300ms, ease-out ao entrar; respeitar reduced-motion.
- **Ranking "bonito"** (pedido explícito): barras proporcionais com valor, posição
  e destaque do topo.

## 8. Tratamento de dado real (mapa métrica → fonte)

A perícia mostrou que muitos números do HTML são fictícios/heurísticos. A SPEC vai
trazer a matriz completa métrica→fonte. Conhecido até aqui:
- **real**: faturamento, nº pedidos, ticket, vendas por UF (FatoParceiro.uf),
  por marca, formas de pagamento (`formaPagamentoNome`), modalidade
  (`operacaoNome`), estoque (valor/itens/produtos/locais), seriais, compras
  ativas (FatoCompra), notas de entrada (FatoDfe), a receber/a pagar (FatoFinanceiroTitulo).
- **estimado**: margem (via preço de custo do produto), lead time (via datas de
  compra/recebimento), idade/giro/cobertura do estoque.
- **sem_fonte**: % reservado (B7), alguns campos de A8 (lead time por fornecedor
  se não houver datas), split venda digital/presencial confiável.
  → confirmar cada um com SELECT no cache antes de cravar (na SPEC).

## 9. Decisões já tomadas / propostas

- Períodos: **enxutos** (Hoje, Esta semana, Este mês, Este ano + Personalizado +
  Comparação), em vez dos 7/30/90 dias redundantes do HTML. (Ajustável.)
- Mapa do Brasil: **compacto**, só onde faz sentido (Demandas por estado; opcional
  Vendas por estado). Estoque/Vendas usam pizza como no HTML. (Ajustável.)
- Vazios em tabela: usar travessão simples "-" (NUNCA "—"; o projeto proíbe em
  dash), nunca vírgula solta. (Corrige o bug visual da v1.)
- Coluna "UF" e "Etapa" separadas visualmente (a v1 colou as duas).
- Bug da v1 (tela de compras quebrada) era Prisma client desatualizado no dev;
  corrigido com restart. A reconstrução substitui essas telas.

## 10. Fora de escopo

- Login, config Odoo, contracheques (CC) , decisão prévia mantida.
- Wizard de geração de relatório por IA (F6) , este construtor é de LAYOUT.
- Upload real de anexos da agenda só entra se houver infra de storage (gap atual).

## 11. Processo a seguir (pedido do cliente)

1. [x] Perícia forense do HTML (7 documentos).
2. [x] Visão consolidada (este doc).
3. [ ] SPEC v1 → review adversarial #1 → v2 → review #2 → v3.
4. [ ] PLAN(s) v1 → review #1 → v2 → review #2 → v3.
5. [ ] Implementação (TDD; UI inline com ui-ux-pro-max; commits atômicos).
6. Sem merge para `main` sem autorização explícita.
