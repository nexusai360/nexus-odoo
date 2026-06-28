# SPEC , Diretoria v2 (reconstrução completa + construtor de relatórios)

> Status: **v3** (incorpora as reviews adversariais #1 completude e #2 arquitetura
> , `*-review-1-completude.md` e `*-review-2-arquitetura.md`).
> Base: perícia 100% do HTML (`pericia-html/MESTRE/`) + visão
> (`2026-06-28-diretoria-v2-VISAO.md`). Regra durável: só local; sem merge para
> `main` sem aprovação explícita.

## 1. Objetivo

Reconstruir o Menu Diretoria de modo que (a) reproduza 100% das funcionalidades do
HTML periciado, melhor organizadas e com **dado real do cache**, e (b) seja um
**construtor de relatórios**: telas montadas a partir de um **catálogo de
componentes** posicionáveis num grid com travas, gated por permissão.

Sucesso: nenhum componente vivo do HTML fica de fora; cada um é um bloco
catalogado, animado e interativo; usuário com permissão monta/edita suas telas;
todo número é dado real do cache (ou rotulado `estimado`/`sem fonte`).

## 2. Arquitetura de telas e navegação

Menu **Diretoria** (já existe). Submenus:
- **Visão Geral**, **Vendas**, **Pedidos & Demandas**, **Estoque & Compras** ,
  relatórios MONTÁVEIS (grid de componentes).
- **Agenda** , tela especial interativa (não é grid de componentes).
- **Permissões** , RBAC fino da Diretoria (§7), gated por `diretoria.permissoes.gerenciar`.

## 3. Modelo de grid (DECISÃO: fluxo + packing, sem x/y absoluto)

Resolve os CRÍTICOS de grid das reviews (x/y vs ordem; colisão; z-order):

- Um relatório é uma **lista ORDENADA de blocos**. Cada bloco tem
  `largura ∈ {1,2,3,4}` quartos e `altura ∈ {1,2,3,4,6} u` (u ≈ 132px). **Não há
  x/y absoluto.**
- O **motor de packing** (função pura, determinística, testável) percorre os blocos
  na ordem e os empacota da esquerda para a direita numa grade de 4 quartos por
  linha, quebrando linha quando não cabe. Posição é DERIVADA da ordem+largura.
  Sem sobreposição, sem z-order, sem colisão a resolver.
- **Reordenar** = mudar índice na lista (drag move o bloco na sequência).
  **Redimensionar** = mudar largura/altura (dentro das travas). O packing recalcula.
- **Responsivo**: < 768px todo bloco ocupa 4/4, empilhado na ordem. Sem scroll
  horizontal de página.
- Travas por tipo:
  | tipo | largura | altura |
  |---|---|---|
  | kpi | 1–2 | 1–2 |
  | tabela | 1–4 (scroll x/y quando estreita) | 2–6 |
  | grafico | 2–4 | 2–4 |
  | mapa | 2–4 | 3–6 |
  | widget | 2–4 | 2–6 |

## 4. Contexto do relatório (interações cross-component) , DECISÃO

Resolve o CRÍTICO de interações entre blocos. Cada relatório tem um **ReportContext**
(estado client compartilhado), com:
- `periodo` (ver §6) , um seletor de período no nível do relatório alimenta todos
  os blocos sensíveis a período.
- `ufSelecionada` , publicada por mapas (B-03/C-02) ao clicar/selecionar; blocos
  que escutam (B-02, B-06, C-04...) filtram por ela SE estiverem montados.
- `itemSelecionado` , para filtros tipo C-06 (item) → C-07 (pagamento).
Regras:
- Publicar é sempre seguro; **consumir é opcional** , se o bloco-alvo não está no
  layout, o evento é no-op (sem erro). Nenhuma interação depende de um bloco
  específico existir.
- **Master-detail** (drill-in B-02→pedido, K-01→detalhe da compra) é INTERNO ao
  componente (lista + painel no mesmo bloco, ou expansão inline), não cross-block.

## 5. Catálogo de componentes

`‹D›-NN` com `{ id, nome, dominio, tipo, fonteDado, larguraMin/Max, alturaMin/Max,
publica[], consome[], capability, htmlRef }`. Detalhe milimétrico de cada um na
perícia (htmlRef → `pericia-html/MESTRE/`); a SPEC não repete.

### G , Visão Geral
| id | nome | tipo | fonte | publica/consome | htmlRef |
|---|---|---|---|---|---|
| G-01 | KPIs executivos (faturamento, a receber, a pagar, estoque, demandas) | kpi | real | , | home |
| G-02 | Próximos eventos (resumo agenda) | widget | real | , | agenda |
| G-03 | Mapa-resumo de demandas por estado | mapa | real | publica uf | B4 |

### C , Vendas (cap 06)
| id | nome | tipo | fonte | publica/consome | htmlRef |
|---|---|---|---|---|---|
| C-01 | KPIs do período (faturamento, ticket, nº pedidos, margem) | kpi | real (margem **estimada**) | consome período | C2 |
| C-02 | Vendas por estado (pizza top-10; mapa opcional) | grafico | real | publica uf | C3 |
| C-03 | Vendas por marca | grafico | real | consome uf | C4 |
| C-04 | Pedidos fechados | tabela | real (margem estimada; vendedor real de `vendedorNome`) | consome uf | C5 |
| C-05 | Modalidades + maior pedido | kpi/grafico | modalidade **real** (`operacaoNome`); split digital/presencial **sem fonte** | , | C6 |
| C-06 | Itens vendidos | grafico | real | publica item | C7 |
| C-07 | Formas de pagamento | grafico | **real** (`formaPagamentoNome`) | consome item | C10 |
| C-08 | Comparativo de 2 estados (com delta) | widget | **real** (reusa vendas por UF; NÃO o mock do HTML) | , | C8/C9 |

### B , Demandas/Pedidos (cap 05)
| id | nome | tipo | fonte | publica/consome | htmlRef |
|---|---|---|---|---|---|
| B-01 | KPIs de demandas (a entregar, valor, atrasadas, a receber) | kpi | real | consome período/uf | B3/B6 |
| B-02 | Lista de pendentes + drill-in do pedido (interno) | tabela | real | consome uf | B2/B5 |
| B-03 | Mapa de demandas por estado | mapa | real | publica uf | B4 |
| B-04 | Máquinas em estoque (disponível) | tabela | disponível **real**; **reservado/% = sem fonte** (ver §8.1) | , | B7 |
| B-05 | Itens em pedidos ativos por período | grafico | real | consome período | B8 |
| B-06 | Visão geral das demandas (+donut) | kpi/grafico | real | consome uf | B6 |
| B-07 | Destaque de valor pendente (hero) | kpi | real | , | B1 |

### A , Estoque (cap 03)
| id | nome | tipo | fonte | htmlRef |
|---|---|---|---|---|
| A-01 | KPIs de estoque (valor, itens, produtos, locais) | kpi | real | A4 |
| A-02 | Estoque por local | tabela | real | A2 |
| A-03 | Distribuição por família | grafico | real | A5 |
| A-04 | Distribuição por marca | grafico | real | A5 |
| A-05 | Modelos do catálogo | tabela | real | A3 |
| A-06 | Estoque ideal (config + alertas de cobertura) | widget | real + **config própria** (§9) | A3 modal |
| A-07 | Idade média / giro / cobertura | kpi | **estimado** | A4 |
| A-08 | Seriais em estoque (busca) | tabela | real | A6 |

### K , Compras (cap 04)
| id | nome | tipo | fonte | htmlRef |
|---|---|---|---|---|
| K-01 | Compras ativas + detalhe (contagem regressiva; master-detail interno) | tabela/widget | real | A7 |
| K-02 | KPIs de compras (total/pago/a pagar/atrasado/a chegar/ativas) | kpi | real | A8 |
| K-03 | Ranking de fornecedores | grafico | real | A8 |
| K-04 | Matriz de fornecedores | tabela | real (lead time/% = **estimado**) | A8 |
| K-05 | Alertas por fornecedor (config) | widget | **config própria** (§9) | A8 modal |
| K-06 | Compras por fornecedor | grafico | real | A8 |

## 6. Período (DECISÃO: 1 seletor por relatório + exceções)

Reconcilia os 4 seletores do HTML. **Um seletor de período no ReportContext** do
relatório, enxuto: **Hoje, Esta semana, Este mês, Este ano, Personalizado (de/até)**,
+ **Comparação** (período B para deltas). Componentes consomem `periodo` do contexto.
Exceções com sub-período próprio, documentadas: C-08 (cada card seu período/UF),
B-05/B-08 (janela própria de "itens em pedidos ativos"). Sem os 7/30/90 redundantes.

## 7. RBAC em 2 níveis (DECISÃO: efetivo = interseção)

- **Nível 1 , global (tela de Usuários):** acesso ao menu Diretoria e às áreas
  amplas + capacidades `diretoria.relatorio.editar`, `diretoria.permissoes.gerenciar`.
  Hoje existe `UserDiretoriaAccess` por usuário; **estender** para suportar grant por
  papel e as novas capabilities (onda 5).
- **Nível 2 , submenu Permissões:** override fino por **tela/seção/componente**,
  por usuário e/ou papel.
- **Algoritmo do efetivo (função pura, testável):**
  `permitido(componente) = global.permite(area_do_componente) AND override_efetivo`,
  onde `override_efetivo` resolve por precedência **deny > allow** e **user > papel**;
  e **nunca amplia** o nível 1 (interseção: se o global nega, o fino não concede).
- **Gating no SERVER:** o render do relatório (server component) filtra os blocos
  permitidos ANTES de disparar qualquer query; o escopo por UF (`userUfs`) é
  injetado nas queries. A paleta do editor também filtra, mas o server é a barreira.

## 8. Tratamento de dado real (fonte = NOSSO cache, não o HTML)

Importante: o HTML usa muitos mocks, mas a fonte aqui é o **nosso cache**. Cada
componente declara `fonteDado`; a UI mostra selo quando ≠ real.
- **real**: faturamento, nº pedidos, ticket, vendas por UF/marca, **formas de
  pagamento** (`formaPagamentoNome`), **modalidade** (`operacaoNome`), estoque
  (valor/itens/produtos/locais), seriais, compras ativas (FatoCompra), notas de
  entrada (FatoDfe), a receber/a pagar (FatoFinanceiroTitulo), vendedor
  (`vendedorNome`).
- **estimado** (selo): margem (preço de custo do produto), idade/giro/cobertura,
  lead time e parte da matriz de fornecedor.
- **sem fonte** (marcar/ocultar): % reservado (§8.1), split digital/presencial,
  qualquer métrica sem base no cache.
- Antes de cravar cada `estimado/sem_fonte`, confirmar por SELECT no cache (regra
  verdade-vs-dado).

### 8.1 Reserva (B-04) , DECISÃO
"% reservado" não existe no Odoo nem no cache, e reserva seria uma ESCRITA (o
projeto só permite escrita via tools `write:*` do MCP). Para a v2: B-04 mostra
**Disponível (real)** e marca Reservado/% como **sem fonte** (selo). Reserva como
feature de escrita fica **fora de escopo** (gap documentado), sem inventar dado.

### 8.2 Valor pendente (B-01/B-02/B-07) , DECISÃO
O HTML explode 1 linha por unidade e usa `pendingValue = total*pendingQty/qty`
sobre preços fictícios. Aqui usamos o **valor real por pedido do cache**
(`fato_pedido.vrProdutos` dos pendentes), exibido por pedido com qtd pendente.
Divergência consciente do HTML, registrada (números reais > fidelidade ao mock).

## 9. Persistência (schema novo, SQL cirúrgico, NUNCA db push)

- `diretoria_relatorio` (id uuid, tela, dono_user_id uuid?, is_padrao bool,
  created_at, updated_at). Layout padrão (dono null + is_padrao) + por usuário.
- `diretoria_relatorio_bloco` (id, relatorio_id, componente_id, ordem int,
  largura_quartos int, altura_u int, config_json jsonb). **Sem x/y** (§3).
- `diretoria_permissao` (id, sujeito_tipo [user|papel], sujeito_id, recurso_tipo
  [tela|secao|componente], recurso_id, efeito [allow|deny]). Override do nível 2.
- `diretoria_config_estoque_ideal` (id, produto_id/modelo, over_pct, ...). Config
  do A-06 (não cabe em config_json do bloco , é dado de negócio compartilhado).
- `diretoria_alerta_fornecedor` (id, fornecedor_id?, limite_saudavel, limite_critico,
  is_padrao). Config do K-05.
- Estender RBAC nível 1: grant por papel + capabilities novas (onda 5).

## 10. Reuso (NÃO recriar) , confirmado pela review #2

Já existem e serão reusados/estendidos:
`src/lib/diretoria/queries/{vendas,estoque,pedidos}.ts`,
`src/components/diretoria/brazil-map/`, charts, `diretoria-period-bar`,
`freshness`, `agenda-calendar`, `FatoCompra`/`fato-serial`. O mapa entra na onda 2
(não recriar). Queries existentes viram loaders de componente.

## 11. Performance , DECISÃO

- **Registry de loaders por componente** (id → async loader(periodo, uf, escopo)).
- Render do relatório resolve os loaders dos blocos permitidos com **Promise.all +
  dedupe** (mesma query usada por 2 blocos roda 1x), **Suspense por bloco**,
  reusando o `freshness`/cache de sync. Definido já na onda 1.

## 12. Faseamento (ondas) , reordenado pela review #2

1. **Spike + infra**: decisão de lib de drag (**@dnd-kit** + compactador próprio;
   evitar react-grid-layout por atrito React 19/Next 16), motor de packing (TDD),
   schema cirúrgico (relatorio/bloco), registry de loaders, render do layout salvo
   (sem editor), gating server. Protótipo de 1 relatório com 2-3 blocos reais.
2. **Componentes de dado + mapa**: A*, K*, B*, C*, G* , cada um TDD na query
   (reusando/estendendo as existentes) + componente client animado; BrazilMap
   reusado aqui. ReportContext (período/uf/item).
3. **Mapa definitivo**: tooltip confinado/tracking/glow como componente reutilizável
   (refinar o BrazilMap atual ao padrão aprovado).
4. **Editor de layout**: paleta, drag + alternativa por teclado, resize com travas,
   salvar/descartar, layout padrão vs usuário.
5. **RBAC nível 2**: estender nível 1 (papel + capabilities), submenu Permissões,
   `diretoria_permissao`, função de efetivo (TDD), gating server.
6. **Agenda interativa** (cap 02): calendário 2 colunas, month picker multi-mês,
   painel do dia, criar/detalhe/excluir, colaboradores, filtros avançados; anexos só
   com infra de storage (gap).
7. **Configs de negócio**: A-06 estoque ideal + K-05 alertas (tabelas próprias, UI).
8. **Polimento**: selos de fonte, estados vazios, responsivo, reduced-motion,
   saneamento de textos (typo, travessões).

Cada onda: TDD em query/lógica, UI inline com `ui-ux-pro-max`, commits atômicos,
E2E contra dado real, sem merge sem autorização.

## 13. Mapeamento hierarquia comercial / UF (review #1)
O HTML tem 4 níveis comerciais (Vendedor→Diretor Global) governando visibilidade.
Aqui NÃO criamos papéis novos: usamos o RBAC existente (`platformRole` +
`UserDiretoriaAccess` + escopo `userUfs`). A agenda filtra por criador + UF; os
relatórios podem ser escopados por UF do usuário. Documentado; sem replicar os 4
níveis literais.

## 14. Fora de escopo
- Login, config Odoo, contracheques; integração Odoo ao vivo (lemos do cache);
  wizard por IA (F6); reserva como escrita (§8.1); upload real de anexos sem storage.

## 15. Riscos
- Grid/drag responsivo + packing é o ponto mais complexo , spike na onda 1, validar
  no browser cedo.
- Não portar mocks do HTML como verdade.
- RBAC nível 2 nunca ampliar nível 1 (testes da função de efetivo).
- Performance de múltiplas queries por relatório (registry + dedupe + Suspense).
