# Reviews adversariais do PLAN O1 (DF-e)

> Alvo: `docs/superpowers/plans/2026-05-30-o1-sped-fiscal-dfe.md` v1.
> Duas passadas genuínas (CLAUDE.md §6 [6] lacunas/ordem/premissas; [7]
> granularidade/integração/testabilidade). Achados aplicados geram o PLAN v3.

## Review #1 (lacunas, ordem, premissas)

### PR1-1 (MAIOR), `empresaId` mapeado é o id do LOTE, não da empresa
Em Task 3, `empresaId: relId(raw.consulta_id)` pega o id de `sped.consulta.dfe`
(o lote NSU), NÃO o `empresa_id`. O nome do campo engana. **v3:** renomear o campo
do fato para `consultaId` (id do lote, honesto) OU, se quiser empresa real, o
builder lê `raw_sped_consulta_dfe` e mapeia lote->empresa (exige Task 0c=sim +
sincronizar o lote). Decisão default: **`consultaId` (lote)**; empresa real fica
para enriquecimento futuro (a tool do piloto não depende de empresa). Ajustar
schema (Task 1) e mapper (Task 3) para `consultaId`.

### PR1-2 (MAIOR), migration pode bater em drift pré-existente
`prisma migrate dev` já exigiu workaround nesta base (R2-ctx: drift -> aplicar via
`$executeRawUnsafe` + marcar resolvido). **v3:** Task 1 Step 3 deve prever: se
`migrate dev` pedir reset por drift, NÃO resetar; aplicar o SQL da migration
manualmente (`prisma migrate diff` -> `$executeRawUnsafe`/psql) e `migrate resolve
--applied`. Igual ao que o R2-ctx fez. AVISAR o usuário continua valendo.

### PR1-3 (MÉDIO), bateria R-X sem como-rodar
Task 11 Step 6 cita "bateria R-X (R24)" sem o comando. **v3:** referenciar
`scripts/quality-audit/03-run-test-questions.ts` (padrão R8-R23) e dizer que as
perguntas DF-e novas entram no banco de perguntas da bateria; rodar e comparar com
baseline 95,5%. Se o harness exigir formato específico, segue o padrão das rodadas
anteriores (docs/agent-quality-review/).

### PR1-4 (MENOR), contagens do catálogo podem mudar até a execução
Task 9 fixa 68->71 / 77->80. Se outra mudança mexer no catálogo antes, os números
deslocam. **v3:** instruir "rodar o teste, ler o número atual, somar +3", não
confiar no literal. O delta (+3 tools, +3 ids) é o invariante.

## Review #2 (granularidade, integração, testabilidade)

### PR2-1 (MAIOR), Tasks 6-8 escondem 3 unidades sem código concreto
"Cada tool segue o skeleton" + bullets é borderline-placeholder (método proíbe).
**v3:** mostrar o handler COMPLETO de UMA tool (dfe_importados_periodo) como
template literal, e para as outras duas listar exatamente input Zod + a query
chamada + os campos de `_DESTAQUE`/`_agregado`. Como a lógica de verdade está nas
queries testadas (Task 5), a tool é glue fino, mas o template completo elimina
ambiguidade.

### PR2-2 (OK, confirmar), seam de teste é a query layer, não a tool
O dossiê confirmou que tools fiscais não têm teste unitário próprio (cobertas pela
integração). Testar `src/lib/reports/queries/dfe.ts` (Task 5) é o seam TDD correto.
**v3:** manter; explicitar que a cobertura por-tool é a integração (Task 9) + E2E
real (Task 11), e o TDD fino é na query.

### PR2-3 (MÉDIO), ordem: vocabulário do Router antes do E2E
Task 10 (vocab) vem antes de Task 11 (E2E/bateria). Como a bateria R-X exercita o
Router, o vocab deve estar pronto antes. **v3:** confirmar a ordem 10 -> 11 (já
está); só registrar a dependência explícita.

### PR2-4 (MENOR), `dt()` e formato de data do raw
Task 3 `dt()` faz `v.replace(" ", "T")` para datetime ("2026-01-15 10:00:00").
Mas `fato-nota-fiscal` usa datas DATE (`${v}T00:00:00`). DF-e tem `data_hora_*`
(datetime). **v3:** confirmar na Task 0 o formato real (date vs datetime) e ajustar
`dt()`; o teste da Task 3 já cobre o formato datetime, manter consistente com o dado.

## Síntese -> PLAN v3
Aplicar PR1-1 (consultaId), PR1-2 (workaround de drift), PR1-3 (comando da bateria),
PR1-4 (delta +3), PR2-1 (handler template completo), PR2-2/PR2-3/PR2-4 (registros).
Plano fica executável sem ambiguidade.
