# SPEC — F4 L2: bateria de validação de leitura

> Versão: **v3** (2026-05-22). Sub-projeto L2 da F4 (Expansão da base de leitura).
> Vem depois da L1 (L1a + L1b + L1c, todas entregues). Não envolve OpenAI — é
> tudo leitura direta de tools + JSON-RPC ao Odoo.

## Histórico de revisão

- **v1→v3 (duas passadas adversariais):** (1) a contagem "1000+ leituras"
  deixou de ser meta e virou consequência da cobertura. (2) Resolvida a falha
  conceitual da v1: conferir uma tool de contagem contra um `count` Prisma do
  mesmo fato não testa nada (tool e conferência rodam a mesma query). A
  conferência **principal passou a ser contra o Odoo** (a fonte da verdade),
  via `search_count` e `read_group`. (3) Esclarecido que o harness chama os
  handlers das tools direto, sem subir servidor.

## 1. Contexto e objetivo

A L1 entregou 47 entradas visíveis no catálogo do MCP (45 tools de domínio +
`registrar_lacuna` + `bi_consulta_avancada`) sobre um cache de 114 modelos do
Odoo. As tools só passaram por smoke test (uma chamada cada). A L3 valida o
**agente** escolhendo tools (e custa OpenAI); a **L2 valida as tools em si**,
sem agente e sem custo.

**Objetivo:** exercer cada tool de domínio com entradas representativas e
conferir o resultado **contra o Odoo**, a fonte da verdade. Pega tanto erro de
lógica da tool/fato (grão errado, filtro furado, campo trocado — como os bugs
de financeiro da F4 onda 1, RADAR R2) quanto erro de fidelidade do cache.
Ao fim, um relatório de assertividade por tool e por domínio.

## 2. Escopo

### 2.1 Cobertura

As **45 tools de domínio** do catálogo (as 47 visíveis menos `registrar_lacuna`
e `bi_consulta_avancada`, que não leem domínio de negócio). Cada tool é
exercida com um conjunto de casos representativos cobrindo seus filtros
(períodos, termos, ids, tabelas de referência, sentidos). A cobertura dos
filtros é o critério; a contagem total de leituras (que passa de 1000 somando
as variações, sobretudo de `referencia_buscar` e das tools de busca) é
consequência, não meta.

### 2.2 Conferência contra o Odoo

Para cada caso, o harness:

1. invoca o **handler da tool** com um `UserContext` super_admin de teste
   (chamada direta ao handler, sem subir servidor HTTP);
2. computa o **valor esperado direto no Odoo** por JSON-RPC read-only
   (`search_count` para contagens, `read_group` para somas e agrupamentos,
   `search_read` para amostras pontuais);
3. compara, devolvendo `{ ok, esperado, obtido, nota }`.

O Odoo é a fonte da verdade: conferir contra ele pega erro de tool **e** de
cache de uma vez. O harness roda **logo após um ciclo de sync** para minimizar
a janela em que o cache e o Odoo divergem; divergência só pela janela (poucos
registros transacionais criados durante a corrida) é listada e justificada,
não conta como falha.

### 2.3 Conferência de fidelidade

Além dos casos por tool, uma rotina percorre os 114 modelos do `MODEL_CATALOG`
e compara `count(raw_*)` ao `search_count` do Odoo. Tabelas estáticas/de
referência batem exato; transacionais toleram a janela de sync. Reaproveita a
lógica dos smokes da L1b/L1c.

### 2.4 Fora do escopo

- Validação do **agente** (L3 — usa OpenAI, gate do usuário).
- `registrar_lacuna` e `bi_consulta_avancada` (não leem domínio; a primeira
  grava um gap, a segunda executa SQL).
- A L2 é a bateria; correções de bug que ela revelar são feitas na sequência
  (regra de raiz "investigar até a certeza") e o relatório é reexecutado.
- Escrita no Odoo.

## 3. Arquitetura

### 3.1 O harness

`scripts/f4l-l2-harness.ts` (no espírito do `f4l-l3-harness.ts`, mas **sem**
agente/OpenAI):

- **Catálogo de casos:** lista de casos, cada um com a tool, o input, e um
  `conferir(resultadoDaTool, odoo)` assíncrono que computa o esperado no Odoo
  e devolve o veredito. Ids e termos reais são descobertos do cache no setup
  (ex.: pegar um `tabelaId` real para `preco_tabela`).
- **Execução:** monta o `ctx` (prisma + `UserContext` super_admin de teste),
  invoca `tool.handler(input, ctx)`, roda `conferir`.
- **Relatório:** agrega por tool e domínio, calcula assertividade, grava
  `docs/superpowers/research/2026-05-22-l2-relatorio.md`.

### 3.2 Estratégia de conferência por tipo de tool

| Tipo de tool | Esperado computado no Odoo |
|---|---|
| Contagem (`*_contar`, `cadastro_contar_parceiros`) | `search_count` do modelo Odoo com o domínio equivalente |
| Listagem (`servico_listar`, `referencia_buscar`...) | `search_count` do filtro; confere o campo `total` (não `linhas.length`) |
| Agregação por período (`fiscal_faturamento_periodo`...) | `read_group` no período, somando o mesmo campo |
| Ranking/agrupamento (`*_por_*`) | `read_group` por chave; compara o topo do ranking |
| Busca por termo/id (`*_buscar`, `estoque_saldo_produto`) | `search_read` com o mesmo filtro |
| Snapshot (`estoque_*`, `financeiro_saldo_*`) | `search_count`/`read_group` do modelo snapshot |
| Domínios vazios (`*_status_dominio`) | confirma que o modelo Odoo está vazio e a tool reporta isso |

Quando o número da tool é uma decisão de negócio (ex.: `vrProdutos` vs `vrNf`
em pedidos), o `conferir` usa o **mesmo campo de origem** no `read_group` — a
decisão de grão é da L1, a L2 confere que a tool soma certo o que decidiu.

### 3.3 Pré-condição

O cache precisa estar populado e recente. O harness roda depois de um ciclo de
ingestão e registra o instante. Se um fato não tem build, o caso é marcado
`preparando`, não `falha`.

## 4. Critérios de aceite

1. O harness exercita as 45 tools de domínio, cobrindo os filtros de cada uma.
2. Cada caso tem conferência efetiva contra o Odoo (não é só "a tool não
   lançou erro"): compara um número/conjunto computado por JSON-RPC.
3. A conferência de fidelidade cobre os 114 modelos do `MODEL_CATALOG`.
4. O relatório `2026-05-22-l2-relatorio.md` traz assertividade por tool e por
   domínio e lista cada divergência com esperado/obtido/nota.
5. Todo achado de bug real de tool é corrigido com teste de regressão e o
   harness reexecutado; a L2 só fecha com as tools corretas.
6. Verde: `tsc` raiz+mcp, `eslint`, `jest`, `next build`.

## 5. Riscos

- **Janela de sync.** Cache e Odoo divergem pelos registros criados entre o
  sync e a corrida. Mitigação: rodar o harness logo após o sync; tolerar e
  justificar divergência pequena em tools transacionais; exigir exato em
  contagens estruturais e de referência.
- **`conferir` errar igual à tool.** Mitigação: o esperado vem do Odoo por um
  caminho diferente (`read_group`/`search_count` server-side), não recopiando
  a query Prisma da tool.
- **Bateria que "passa" sem testar.** Critério 2 + uma revisão do catálogo de
  casos confirmando que cada caso compara um valor real.
- **Tools de período sem dado no período escolhido.** Escolher períodos com
  dado real (descobertos do cache no setup), senão o caso compara 0 com 0 e
  não testa nada.

## 6. Downstream

A L2 fecha a F4 base de leitura. A L3 (validação do agente, OpenAI) e a Onda I
formal de produção são as etapas seguintes, fora desta spec.
