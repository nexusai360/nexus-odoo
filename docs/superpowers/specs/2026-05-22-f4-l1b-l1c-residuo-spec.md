# SPEC — F4 L1: execução da L1b + onda L1c (resíduo operacional 4a)

> Versão: **v3** (2026-05-22). Continuação do sub-projeto L1 (Expansão da base
> de leitura). Pesquisa-base: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`.
> Spec-mãe da L1: `docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`.

## Histórico de revisão

- **v1 → v2:** sondagem `fields_get`/`search_read` read-only dos três modelos
  da L1c. Dois ajustes: (1) o sync ganha exclusão de campos por modelo, para
  não copiar `senha` (texto puro) e `arquivo` (binário) de `sped.certificado`
  para o cache; (2) `pedido.faturamento` foi confirmado **dentro** do escopo
  como modelo de faturamento real (a v1 chegou a tirá-lo por leitura apressada
  da contagem de campos; ver §2.2).
- **v2 → v3:** revisão contra o `provision-mcp.sql`. O script concede `SELECT`
  em `fato_*` por loop dinâmico e **revoga `raw_*`** dos roles do MCP por
  desenho. Logo `fato_certificado` é coberto sozinho e entra no `bi-schema`;
  as duas tabelas `raw` puras saem do `bi-schema` e dos GRANT (ver §2.2).

## 1. Contexto e objetivo

A L1a (ondas 1 a 5: preços, serviços, DF-e de entrada, apuração, cartas de
correção) foi entregue. Faltaram, por decisão de priorizar a L3:

- **Onda L1b** (camada de referência) — já especificada na spec-mãe §2.2 e
  decomposta no plano-mãe T6.1 a T6.10.
- **Onda I** (ingestão real) — já decomposta no plano-mãe TI.1 a TI.7.

Esta spec **não redesenha** L1b nem Onda I: elas executam o plano-mãe sem
retoque. O único escopo novo aqui é a **onda L1c**: o resíduo operacional da
categoria 4a do censo, que nunca entrou em spec nem plano.

**Objetivo:** completar o mapeamento da base de produção. Ao fim, todo modelo
de negócio com dado real do novo acesso `joaozanini` está no cache (`raw`),
a camada de referência alimenta o Caminho 3c, e o catálogo de tools cresce de
forma enxuta (+1 da L1b, +1 da L1c).

## 2. Escopo

### 2.1 Onda L1b — executar o plano-mãe (sem mudança)

Executar T6.1 a T6.10 do plano-mãe. Resumo do que entregam:

- ~25 modelos de referência fiscal/cadastral/geográfica (`sped.ncm`,
  `sped.cfop`, `sped.cest`, `sped.cnae`, `sped.nbs`, `sped.natureza.operacao`,
  `sped.unidade`, `sped.condicao.pagamento`, `sped.municipio`, `sped.pais`,
  `sped.estado`, `sped.aliquota.*`, `sped.cst.*`, `sped.feriado`) como `Raw*`,
  `mode: "estatico"` no `MODEL_CATALOG`, migration `f4l_referencia`.
- Uma única tool `referencia_buscar` (busca genérica por código/termo numa
  tabela de referência nomeada). Não cinco tools de lookup.
- Tabelas de referência registradas em `bi-schema-reference.ts` (Caminho 3c
  resolve código para descrição via JOIN) e GRANT aos roles `nexus_mcp`/
  `nexus_mcp_bi`.

### 2.2 Onda L1c — resíduo operacional 4a (escopo novo)

> **Sondagem de schema (2026-05-22).** Os três modelos do censo §4a foram
> sondados por `fields_get`/`search_read` read-only contra a produção.
> Resultado: os três são dado operacional real e entram como `raw`;
> `sped.certificado` exige exclusão de dois campos sensíveis na cópia.

| Modelo Odoo | Registros | Tratamento |
|---|---|---|
| `sped.certificado` | 11 | `raw` (sem `senha`/`arquivo`) + `fato_certificado` + tool |
| `finan.baixa.lancamento` | 3 | `raw` apenas |
| `pedido.faturamento` | 1 (cresce) | `raw` apenas |

Conteúdo de cada modelo (confirmado na sondagem):

- **`sped.certificado`** — certificados digitais (e-CNPJ A1) das empresas do
  grupo: tipo, número de série, proprietário, CNPJ, validades (início, fim,
  vencimento útil), nome do arquivo.
- **`finan.baixa.lancamento`** — baixas de lançamentos financeiros em lote:
  empresa, tipo (a receber / a pagar), período, participante, conta gerencial,
  flag de executado.
- **`pedido.faturamento`** — faturamento de pedidos/contratos: tipo, número
  (ex.: `FCV-0002/26`), datas de faturamento, valores (total, já faturado,
  a faturar, confirmado), empresa, cliente, contrato, operação. O `fields_get`
  retorna 198 campos, mas **145 são de configuração herdada e não-gravados**
  (`store=false`): o `getModelFields` do worker já os ignora porque copia só
  campos `store=true`. Sobram os ~30 campos reais de faturamento. Sem
  tratamento especial.

Regras da onda:

- Os três recebem modelo Prisma `Raw*` e entrada no `MODEL_CATALOG`, numa
  migration própria (`f4l_residuo_4a`). Os três expõem `write_date`, logo
  `mode: "incremental"`.
- **`sped.certificado` — exclusão de campos sensíveis na cópia.** A sondagem
  mostrou que o modelo tem `arquivo` (`binary`, `store=true`: o `.pfx` do
  certificado, base64) e `senha` (`char`, `store=true`: a senha do certificado
  **em texto puro**). Decisão do usuário (2026-05-22): nenhum dos dois é
  copiado para o cache. A cópia ao Odoo é só leitura e o `excludeFields` (ver
  §3) controla quais colunas o sync grava no **nosso** banco; o dado original
  no Odoo não é alterado. `sped.certificado` declara
  `excludeFields: ["senha", "arquivo"]`.
- `sped.certificado` ganha **uma** tool semântica (`fiscal_certificados`):
  lista os certificados com identificação e validade, para responder perguntas
  como "quais certificados temos e quando vencem". A tool lê o
  `fato_certificado`, construído a partir de `raw_sped_certificado` (mesmo
  padrão de `fato_apuracao` e `fato_carta_correcao`, que têm fato apesar do
  volume baixo). O fato é **exigido** porque o helper `withFreshness` do MCP
  precisa de pelo menos um `FatoBuildState` para reportar frescor; uma tool
  sem fato quebraria esse contrato.
- `finan.baixa.lancamento` e `pedido.faturamento` ficam só em `raw`: 1 a 3
  registros não justificam fato nem tool dedicada, e o catálogo enxuto reduz o
  ruído de seleção do modelo (lição da L3). Ficam alcançáveis pelo Caminho 3c.
- **GRANT e Caminho 3c.** O `provision-mcp.sql` concede `SELECT` em todo
  `fato_*` por um loop dinâmico e **revoga `raw_*`** dos dois roles do MCP por
  desenho (RBAC camada 4: o MCP nunca lê `raw`). Consequência: `fato_certificado`
  é coberto automaticamente pelo GRANT dinâmico e entra em `bi-schema-reference.ts`.
  `raw_finan_baixa_lancamento` e `raw_pedido_faturamento` **não** entram em
  `bi-schema-reference.ts` nem recebem GRANT aos roles do MCP: ficam só no
  cache (sincronizados, portanto mapeados), acessíveis pelo app/dashboard, que
  usa o role completo. Pôr uma tabela `raw` no `bi-schema` sem GRANT só faria
  o Caminho 3c gerar SQL que falha por permissão; manter o limite da camada 4
  intacto vale mais que expor 1 a 3 linhas.

### 2.3 Onda I — ingestão real (executar o plano-mãe)

Após L1b e L1c, executar TI.1 a TI.7 do plano-mãe: subir o stack, aplicar as
migrations novas, reaplicar GRANT, rodar o worker para um ciclo completo que
popula as tabelas `raw` novas, conferir contagem contra o `search_count` do
Odoo, smoke test das tools novas.

### 2.4 Fora do escopo

- `sped.consulta.dfe` e `sped.consulta.dfe.item`: o plano-mãe os excluiu com
  motivo revisado (cursor de distribuição SEFAZ, redundante com `sped.documento`
  e `sped.dfe.importacao` já sincronizados). A decisão é mantida.
- `fato_*` para `finan.baixa.lancamento` e `pedido.faturamento` (só `raw`).
  `sped.certificado` tem `fato_certificado` por exigência do `withFreshness`.
- Cópia dos campos `senha` e `arquivo` de `sped.certificado` para o cache.
- `raw_finan_baixa_lancamento` e `raw_pedido_faturamento` no `bi-schema` /
  Caminho 3c — o `provision-mcp.sql` nega `raw_*` aos roles do MCP por desenho.
- Registros gerados de SPED, views de árvore, modelos vazios e abstratos
  (spec-mãe §2.4).
- A bateria L2 de validação de leitura (sub-projeto seguinte, spec própria).
- Qualquer escrita no Odoo.

## 3. Arquitetura

Reusa integralmente os padrões da spec-mãe §4 (camada `raw`, `MODEL_CATALOG`,
query layer, `ToolEntry` + `withFreshness`, RBAC por domínio, GRANT por
migration). Nada de camada nova.

Pontos específicos da L1c:

- **Domínio RBAC:** `fiscal` para `sped.certificado`. `finan.baixa.lancamento`
  e `pedido.faturamento` não geram tool, logo não declaram domínio (só `raw`).
- **Exclusão de campos por modelo (mudança no sync engine).** Hoje
  `getModelFields` (`src/worker/odoo/field-selection.ts`) seleciona todos os
  campos `store=true` exceto `one2many`/`many2many`. A L1c acrescenta uma
  lista de exclusão por modelo: a entrada de `MODEL_CATALOG` ganha um campo
  opcional `excludeFields?: string[]`, e `getModelFields` o subtrai da lista.
  `sped.certificado` declara `excludeFields: ["senha", "arquivo"]`. A mudança
  é retrocompatível (modelos sem `excludeFields` não mudam de comportamento) e
  tem teste unitário próprio em `field-selection.test.ts`. `excludeFields`
  controla apenas o que o sync **copia para o nosso cache**; é leitura do
  Odoo, não altera nada na origem.
- **`fato_certificado`:** builder em `src/worker/fatos/fato-certificado.ts`,
  registrado em `FATO_BUILDERS` (`registry.ts`) com `cycle: "incremental"`,
  modelo `FatoCertificado` no Prisma, mapeando o JSONB de `raw_sped_certificado`
  para colunas tipadas. Espelha `fato-carta-correcao.ts`. Registrado em
  `FATO_FONTE` (`mcp/lib/freshness.ts`) apontando para o modelo Odoo
  `sped.certificado`.
- **Tool `fiscal_certificados`:** `mcp/tools/fiscal/certificados.ts`, lê via
  `queryCertificados` em `queries/fiscal-complementar.ts`, retorna a lista de
  certificados com `withFreshness(ctx.prisma, ["fato_certificado"], ...)`. Sem
  `inputSchema` obrigatório (lista completa, volume de 11 registros).
- **Migration única da onda** (`f4l_residuo_4a`), separada da `f4l_referencia`,
  para subir e verificar isolada (spec-mãe §4.1).

## 4. Critérios de aceite

1. L1b: T6.1 a T6.10 do plano-mãe concluídas; `referencia_buscar` visível para
   o domínio e some para quem não tem; tabelas de referência em
   `bi-schema-reference.ts`.
2. L1c: os três modelos têm `Raw*`, entrada em `MODEL_CATALOG` e migration
   `f4l_residuo_4a` aplicada; `FatoCertificado` e seu builder existem com
   teste unitário verde; `fato_certificado` consta em `bi-schema-reference.ts`
   (GRANT coberto pelo loop dinâmico de `fato_*` do `provision-mcp.sql`).
   `raw_sped_certificado` **não contém** os campos `senha` nem `arquivo`.
3. `fiscal_certificados` aparece em `tools/list` para usuário com domínio
   `fiscal`, some para quem não tem, e responde com dado real do cache.
4. Onda I: worker completa um ciclo de sync sem falha por modelo; para cada
   modelo novo, `count(raw_*)` é conferido contra o `search_count` do Odoo
   medido após o sync. Tabelas de referência (L1b, estáticas) batem
   exatamente; as três tabelas da L1c batem ou divergem apenas pelos
   registros criados na janela de sync, com a divergência justificada.
5. Verde: `npx tsc --noEmit` (raiz), typecheck do container `mcp`,
   `npx eslint`, `npx jest`, `npx next build` e `docker compose build mcp`.
6. Snapshot do catálogo (`gen:mcp-catalog`) e documentação do MCP refletem
   `referencia_buscar` e `fiscal_certificados`.

## 5. Riscos

- **Segredo no cache (`sped.certificado`).** O modelo carrega a senha do
  certificado em texto puro e o arquivo `.pfx`. Mitigação: `excludeFields`
  exclui `senha` e `arquivo` da cópia (§2.2 e §3); o critério de aceite 2
  verifica que `raw_sped_certificado` não os contém.
- **Schema dos modelos Odoo.** Sondado por `fields_get`/`search_read`
  read-only durante o planejamento; campos, `store` e exclusões fixados na
  spec antes de codar.
- **Leitura apressada de schema.** A v1 tirou `pedido.faturamento` do escopo
  por contar 198 campos sem checar `store`. Lição: classificar modelo pelos
  campos `store=true` e por uma amostra real, não pela contagem bruta de
  `fields_get`.
- **GRANT esquecido pós-migration.** Reaplicar `db:provision` após cada
  migration (RADAR R4), coberto pelo critério 2 e pela Onda I.

## 6. Downstream

- **Onda I** popula o cache com as tabelas novas; o instante da carga é
  registrado para a L2.
- **L2** (bateria de 1000+ leituras conferidas contra o Odoo) é o próximo
  sub-projeto, com spec própria, exercendo o catálogo já completo.
