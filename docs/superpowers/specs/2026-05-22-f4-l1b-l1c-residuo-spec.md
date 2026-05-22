# SPEC — F4 L1: execução da L1b + onda L1c (resíduo operacional 4a)

> Versão: **v1** (2026-05-22). Continuação do sub-projeto L1 (Expansão da base
> de leitura). Pesquisa-base: `docs/superpowers/research/2026-05-21-censo-novo-acesso.md`.
> Spec-mãe da L1: `docs/superpowers/specs/2026-05-21-f4-leitura-expansao-spec.md`.

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

> **Sondagem de schema (2026-05-22).** Antes de planejar, os três modelos do
> censo §4a foram sondados por `fields_get`/`search_read` read-only contra a
> produção. O resultado corrigiu a lista: `pedido.faturamento` **saiu de
> escopo** (ver §2.4), e `sped.certificado` exige exclusão de campos sensíveis.

Modelos operacionais com dado real que o censo §4a listou e que não entraram
na L1a por volume mínimo:

| Modelo Odoo | Registros | Tratamento |
|---|---|---|
| `sped.certificado` | 11 | `raw` (campos selecionados) + `fato_certificado` + tool |
| `finan.baixa.lancamento` | 3 | `raw` apenas |

- Os dois recebem modelo Prisma `Raw*` e entrada no `MODEL_CATALOG`, numa
  migration própria (`f4l_residuo_4a`). Ambos expõem `write_date`, logo
  `mode: "incremental"`.
- **`sped.certificado` — exclusão obrigatória de campos.** A sondagem mostrou
  que o modelo tem `arquivo` (campo `binary`: o arquivo `.pfx` do certificado,
  base64, dezenas de KB por registro) e `senha` (campo `char`: a senha do
  certificado **em texto puro**). Nenhum dos dois pode ir para o cache: o
  blob binário incha a base sem valor analítico e a senha é segredo que não
  se replica. O sync de `sped.certificado` exclui `arquivo` e `senha` via
  uma lista de exclusão por modelo (ver §3). Os campos úteis ficam: `tipo`,
  `numero_serie`, `proprietario`, `cnpj_cpf`, `data_inicio_validade`,
  `data_fim_validade`, `data_vencimento_util`, `descricao`, `fora_validade`.
- `sped.certificado` ganha **uma** tool semântica (`fiscal_certificados`):
  lista os certificados digitais com identificação e validade, para responder
  perguntas como "quais certificados temos e quando vencem". A tool lê o
  `fato_certificado`, construído a partir de `raw_sped_certificado` (mesmo
  padrão de `fato_apuracao` e `fato_carta_correcao`, que têm fato apesar do
  volume baixo). O fato é **exigido** porque o helper `withFreshness` do MCP
  precisa de pelo menos um `FatoBuildState` para reportar frescor; uma tool
  sem fato quebraria esse contrato.
- `finan.baixa.lancamento` fica só em `raw`: 3 registros não justificam fato
  nem tool dedicada, e o catálogo enxuto reduz o ruído de seleção do modelo
  (lição da L3). Fica alcançável pelo Caminho 3c.
- `fato_certificado` e `raw_finan_baixa_lancamento` entram em
  `bi-schema-reference.ts`; todas as tabelas novas (`raw_*` e `fato_*`)
  recebem GRANT aos roles `nexus_mcp`/`nexus_mcp_bi`.

### 2.3 Onda I — ingestão real (executar o plano-mãe)

Após L1b e L1c, executar TI.1 a TI.7 do plano-mãe: subir o stack, aplicar as
migrations novas, reaplicar GRANT, rodar o worker para um ciclo completo que
popula as tabelas `raw` novas, conferir contagem contra o `search_count` do
Odoo, smoke test das tools novas.

### 2.4 Fora do escopo

- `sped.consulta.dfe` e `sped.consulta.dfe.item`: o plano-mãe os excluiu com
  motivo revisado (cursor de distribuição SEFAZ, redundante com `sped.documento`
  e `sped.dfe.importacao` já sincronizados). A decisão é mantida.
- **`pedido.faturamento` — fora de escopo (decisão da sondagem).** O censo o
  classificou como "faturamento de pedido/contrato" com 1 registro. A sondagem
  `fields_get` revelou **198 campos de configuração de sistema** (`nome_sistema`,
  `servidores_dns`, `sistema_emite_nfe`, `tauga_formato_celular`, etc.): é um
  modelo de **configuração** (singleton de settings), não um modelo de dado
  operacional. Sincronizá-lo como tabela de negócio não agrega nada e seria
  enganoso. Fica fora; o censo será anotado como tendo-o classificado errado.
- `fato_*` para `finan.baixa.lancamento` (só `raw`). `sped.certificado` tem
  `fato_certificado` por exigência do `withFreshness`.
- Registros gerados de SPED, views de árvore, modelos vazios e abstratos
  (spec-mãe §2.4).
- A bateria L2 de validação de leitura (sub-projeto seguinte, spec própria).
- Qualquer escrita no Odoo.

## 3. Arquitetura

Reusa integralmente os padrões da spec-mãe §4 (camada `raw`, `MODEL_CATALOG`,
query layer, `ToolEntry` + `withFreshness`, RBAC por domínio, GRANT por
migration). Nada de camada nova.

Pontos específicos da L1c:

- **Domínio RBAC:** `fiscal` para `sped.certificado`; `finan.baixa.lancamento`
  não gera tool, logo não declara domínio (só `raw`).
- **Exclusão de campos por modelo (mudança no sync engine).** Hoje
  `getModelFields` (`src/worker/odoo/field-selection.ts`) seleciona todos os
  campos `store=true` exceto `one2many`/`many2many`. A L1c acrescenta uma
  lista de exclusão por modelo: a entrada de `MODEL_CATALOG` ganha um campo
  opcional `excludeFields?: string[]`, e `getModelFields` o subtrai da lista.
  `sped.certificado` declara `excludeFields: ["arquivo", "senha"]`. A mudança
  é retrocompatível (modelos sem `excludeFields` não mudam de comportamento)
  e tem teste unitário próprio em `field-selection.test.ts`.
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
2. L1c: os dois modelos têm `Raw*`, entrada em `MODEL_CATALOG` e migration
   `f4l_residuo_4a` aplicada; `FatoCertificado` e seu builder existem com
   teste unitário verde; `fato_certificado` e `raw_finan_baixa_lancamento`
   constam em `bi-schema-reference.ts` e nos GRANT. `raw_sped_certificado`
   **não contém** as colunas/JSON de `arquivo` nem `senha`.
3. `fiscal_certificados` aparece em `tools/list` para usuário com domínio
   `fiscal`, some para quem não tem, e responde com dado real do cache.
4. Onda I: worker completa um ciclo de sync sem falha por modelo; para cada
   modelo novo, `count(raw_*)` é conferido contra o `search_count` do Odoo
   medido após o sync. Tabelas de referência (L1b, estáticas) batem
   exatamente; as duas tabelas da L1c batem ou divergem apenas pelos
   registros criados na janela de sync, com a divergência justificada.
5. Verde: `npx tsc --noEmit` (raiz), typecheck do container `mcp`,
   `npx eslint`, `npx jest`, `npx next build` e `docker compose build mcp`.
6. Snapshot do catálogo (`gen:mcp-catalog`) e documentação do MCP refletem
   `referencia_buscar` e `fiscal_certificados`.

## 5. Riscos

- **Segredo no cache (`sped.certificado`).** O modelo carrega a senha do
  certificado em texto puro e o arquivo `.pfx`. Mitigação: exclusão de
  `arquivo` e `senha` no sync (§2.2 e §3), com critério de aceite 2
  verificando que `raw_sped_certificado` não os contém.
- **Schema dos modelos Odoo.** Sondado por `fields_get` read-only durante o
  planejamento; campos e exclusões fixados na spec antes de codar.
- **Censo com classificação imprecisa.** `pedido.faturamento` provou ser
  modelo de configuração, não de dado. Mitigação: sondar antes de planejar
  qualquer modelo novo (já aplicada nesta onda).
- **GRANT esquecido pós-migration.** Reaplicar `db:provision` após cada
  migration (RADAR R4), coberto pelo critério 2 e pela Onda I.

## 6. Downstream

- **Onda I** popula o cache com as tabelas novas; o instante da carga é
  registrado para a L2.
- **L2** (bateria de 1000+ leituras conferidas contra o Odoo) é o próximo
  sub-projeto, com spec própria, exercendo o catálogo já completo.
