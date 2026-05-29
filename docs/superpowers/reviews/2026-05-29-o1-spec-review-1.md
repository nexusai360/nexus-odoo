# Review adversarial #1 da SPEC O1 (SPED Fiscal piloto)

> Alvo: `docs/superpowers/specs/2026-05-29-o1-sped-fiscal-spec.md` v1.
> Auditoria das 13 tools fiscais existentes + premissas de dado. Aplicar gera v2.
> (Produzida com auditoria direta de `mcp/tools/fiscal/*`, `src/worker/fatos/*`,
> `prisma/schema.prisma`.)

## Mapa das 13 tools fiscais existentes (anti-duplicação)

Todas leem de `FatoNotaFiscal` (raw_sped_documento) ou `FatoNotaFiscalItem`
(raw_sped_documento_item):
faturamento-periodo/mensal-serie/por-marca/por-uf/por-cliente, impostos-periodo,
notas-emitidas (entrada_saida saída), notas-emitidas-por-cliente, notas-emitidas-por-produto,
notas-recebidas (entrada_saida entrada), notas-recebidas-por-fornecedor, contar-notas,
produtos-faturados.

**Conclusão central:** `notas-recebidas` cobre **documentos próprios de entrada**
(`fato_nota_fiscal` com entrada_saida=entrada), NÃO os DF-e de terceiros
(`sped.dfe.importacao` / `sped.consulta.dfe.item`). Logo as tools de DF-e do O1
são dados distintos, não duplicam, MAS o nome confunde.

## Achados para a SPEC v2

### O1-A1 (BLOQUEADOR de dado), `raw_sped_consulta_dfe_item` não existe
A §3.1 propõe `FatoDfeItem` a partir de `sped.consulta.dfe.item` (4.780, Balde A),
mas não há `RawSpedConsultaDfeItem` no schema (só `raw_sped_dfe_importacao` existe).
**v2:** decidir entre (a) adicionar o modelo ao `model-catalog.ts` do worker +
migration de raw + sync, ou (b) extrair os itens do JSONB aninhado de
`raw_sped_dfe_importacao`. Investigar o shape real do raw antes de decidir.

### O1-A2 (CORTAR), `lookup_ncm`/`lookup_cfop` já existem
`src/worker/fatos/fato-referencia.ts` (GRUPO_A) + tool `fiscal_referencia_buscar`
(`mcp/tools/fiscal/referencia-buscar.ts`) já cobrem NCM/CFOP/CEST. **v2:** remover
§3.3 e as candidatas `lookup_ncm/cfop` da §7; reusar `fiscal_referencia_buscar`.

### O1-A3 (MAIOR), nomes `dfe_*` vs `notas-*` confundem
DF-e de terceiros vs documentos próprios. **v2:** renomear `dfe_recebidos_periodo`
-> `dfe_importados_periodo`; descrições das tools discriminam o conceito; vocabulário
do Router separa "DF-e/notas de fornecedores importadas" de "notas recebidas próprias".

### O1-A4 (MAIOR), modelos Prisma novos a especificar
`FatoDfe`, `FatoDfeItem`, `FatoDuplicata` não existem. **v2:** especificar campos de
cada um (no padrão `FatoNotaFiscal`): ex. FatoDfe(odooId, chaveNfe, fornecedorId,
fornecedorNome, dataEmissao, valorTotal, situacaoManifestacao, ...);
FatoDuplicata(odooId, documentoId, numero, dataVencimento, valor, codigoBarras,
clienteId, ...). Migration aditiva + builder em src/worker/fatos/ + registro no
pipeline + FatoBuildState + testes.

### O1-A5 (MAIOR), campo de status de manifestação do DF-e é incerto
`dfe_pendentes_manifestacao` depende de um campo de status que pode estar aninhado
no JSONB de `raw_sped_dfe_importacao` com nome não óbvio. **v2:** investigar o shape
real (ler amostra do raw) e confirmar o campo antes de prometer a tool; se não
existir, cortar a tool.

### O1-A6 (MÉDIO), ciclo do builder não definido
**v2:** definir por fato: FatoDfe/FatoDuplicata incremental se o raw tem
`rawWriteDate` (delta), senão snapshot. Seguir `fato-nota-fiscal.ts`.

### O1-A7 (MÉDIO), sequência de integração/rebuild explícita
**v2:** detalhar §6 na ordem: migration -> prisma generate -> rebuild worker ->
rodar builders -> rebuild mcp -> E2E fiscal -> bateria R-X. (CLAUDE.md §2.1.)

### O1-A8 (VERIFICAR), filtro entrada_saida em notas-recebidas
Confirmar que `notas-recebidas` realmente filtra entrada (ler a query em
`src/lib/reports/queries/fiscal.ts`); se não filtrar, é bug pré-existente (RADAR),
fora do escopo do O1 mas registrar.

## Padrões canônicos confirmados (para o PLAN)

- **Builder:** `src/worker/fatos/fato-nota-fiscal.ts` (lê raw, mapeia, upsert no
  fato), registrado no pipeline de fatos + `FatoBuildState`.
- **Tool:** `mcp/tools/fiscal/notas-recebidas.ts` (input Zod, query no fato,
  envelope `_RESPOSTA`/`_DESTAQUE`/`withFreshness`, sanitizer), registrada no
  catálogo do MCP com domínio `fiscal`.
- **3 registros** ao adicionar tool: builder registry, MCP tool registry, model
  catalog do worker (quando há raw novo).

## Veredito
SPEC v1 viável. 1 bloqueador de dado (A1), 1 corte (A2), e refinamentos. Escopo
real do piloto após v2: **DF-e importados** (período + por fornecedor + itens +
pendentes-de-manifestação, este condicional à A5) + **duplicatas** (a vencer +
por cliente, condicional à validação vs financeiro). Referência (NCM/CFOP) sai
(já existe).
