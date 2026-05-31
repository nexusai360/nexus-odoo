# PLAN , B2 Fiscal complementar (MDF-e + REINF): pré-build estrutural

> Sobre a SPEC v2 (`docs/superpowers/specs/2026-05-30-b2-fiscal-complementar-spec.md`).
> Estrutural (0 registros em MDF-e/REINF) , o gate é a ATIVAÇÃO, não E2E (igual ao lançamento
> contábil do B1). Padrão idêntico a B1. **Não iniciar a migration com contexto curto.**

## Invariantes
- Aditivo (P1); padrão único de output `withFreshness` (`preparando|ok|vazio`), sem `sem_dado`.
- Tools honestas data-driven: `count()===0` → `_RESPOSTA` "MDF-e/REINF não operado ainda".
- Migration via workaround de drift (`db execute --file` + `migrate resolve --applied`), AVISAR.
- Reconferir SEMPRE que cada `Edit` aplicou (lição do B1: edits silenciosos falham por âncora).

## Task 0 , Inspeção real (fixa os mappers) , SEM código de produção
- [ ] `fields_get` ao vivo de `sped.mdfe`, `reinf.evento`, `reinf.evento.item` (já capturado em
      `/tmp/b2.txt` nesta sessão; reconfirmar). Listar os campos que viram coluna do fato:
  - **MDF-e:** chave, numero, serie, modelo, emitente/empresa_id, data_emissao, data_inicio_viagem,
    uf_inicio, uf_fim, situacao/status, protocolo, vr_carga, peso_bruto, placa/veiculo,
    municipio_carregamento/descarregamento. (Confirmar nomes exatos no fields_get.)
  - **REINF evento:** tipo_evento, periodo_apuracao, situacao/status, protocolo, data, empresa_id.
  - **REINF item:** valores/base/retencao (confirmar se agrega além do cabeçalho).
- [ ] Decidir: `FatoReinfEventoItem` vale como fato separado? Se com 0 reg não há sinal de valor
      além do cabeçalho, ADIAR (como o rateio do B1) e cobrir na ativação. Default: só cabeçalho.
- **Saída:** lista de colunas fixada por fato. Sem commit.

## Task 1 , Schema (raws + fatos) + BI_SCHEMA_REFERENCE (no MESMO passo , trava de teste)
- [ ] `prisma/schema.prisma`: `RawSpedMdfe`, `RawReinfEvento` (+ `RawReinfEventoItem` se item virar
      fato); `FatoMdfe`, `FatoReinfEvento` (+ item). Padrão dos raws/fatos do B1.
- [ ] **OBRIGATÓRIO junto:** adicionar `TABLE fato_mdfe (...)`, `TABLE fato_reinf_evento (...)`
      em `src/lib/agent/bi-schema-reference.ts` (formato `TABLE fato_* (` + `TIMESTAMPTZ`; o teste
      `bi-schema-reference.test` exige cada `@@map("fato_*")` na constante).
- [ ] `npx prisma format` + `validate`; `npx jest bi-schema-reference`.
- **Commit:** `feat(b2): schema MDF-e + REINF (estruturais) + BI ref`.

## Task 2 , Migration aditiva (AVISAR; workaround de drift)
- [ ] AVISAR o usuário (Postgres dev compartilhado).
- [ ] `migrate dev --create-only` → revisar SQL (só CREATE TABLE/INDEX).
- [ ] `db execute --file <migration.sql>` + `migrate resolve --applied <nome>` + `prisma generate`.
- [ ] Confirmar as tabelas via `to_regclass` (script tsx) , NÃO confiar só no resolve.
- **Commit:** `feat(b2): migration b2_mdfe_reinf (aditiva, workaround drift)`.

## Task 3 , MODEL_CATALOG + teste
- [ ] `model-catalog.ts`: `sped.mdfe`, `reinf.evento` (+ item se fato), modo `incremental`.
- [ ] `model-catalog.test.ts`: bump `toHaveLength` para o valor REAL (medir com
      `import { MODEL_CATALOG }` , B1 mostrou que a base verdadeira diverge de palpites) +
      `MODELOS_B2` set (entram via fields_get, sem arquivo discovery).
- **Commit:** `feat(b2): raws MDF-e/REINF no MODEL_CATALOG`.

## Task 4 , Builders + testes (padrão B1)
- [ ] `src/worker/fatos/fato-mdfe.ts`, `fato-reinf-evento.ts` (+ item): mapper puro (relId/relNome,
      str/num/dt) + rebuild (delete+createMany+markFatoBuilt). Teste pareado com mock realista.
- **Commit:** `feat(b2): builders fato_mdfe + fato_reinf_evento`.

## Task 5 , Registry + FATO_FONTE
- [ ] `registry.ts`: imports + entradas em `FATO_BUILDERS` (verificar que ENTRARAM , B1 falhou aqui).
- [ ] `freshness.ts`: entradas em `FATO_FONTE`.
- **Commit:** `feat(b2): registra fatos MDF-e/REINF em FATO_BUILDERS/FATO_FONTE`.

## Task 6 , Query layer + testes
- [ ] `src/lib/reports/queries/fiscal-complementar.ts` (ou estende fiscal): `queryMdfeManifestos`,
      `queryReinfEventos` + `fatoMdfeCount`/`fatoReinfCount` (para o `_RESPOSTA` honesto). groupBy/
      findMany conforme o caso. Testes da aritmética/filtros com mocks.
- **Commit:** `feat(b2): query layer fiscal complementar`.

## Task 7 , Tools honestas (padrão B1 §2.3)
- [ ] `fiscal_mdfe_manifestos`, `fiscal_reinf_eventos` (domínio `fiscal`). `outputSchema` union
      `preparando|ok|vazio` com `_RESPOSTA` opcional; handler: se `count()===0` → `_RESPOSTA`
      "não operado". Registrar no índice `fiscal`.
- **Commit:** `feat(b2): tools fiscais MDF-e + REINF (honestas data-driven)`.

## Task 8 , Bumps + snapshot + vocab
- [ ] `integration.test.ts`: `FISCAL_IDS` += as 2 tools; bumpar os `toHaveLength` (medir o real
      via probe, como no B1) e o catálogo bruto.
- [ ] `gen:mcp-catalog`; vocab Router (domínio `fiscal` já existe , enriquecer com MDF-e/REINF).
- **Commit:** `test(b2): bumps + snapshot + vocab`.

## Task 9 , Verificação + PR
- [ ] `tsc` CLEAN, `eslint` 0 erros, `jest` cheio verde (medir contagens reais; reconferir edits).
- [ ] Sem E2E real (0 reg) , anexar checklist de ATIVAÇÃO (SPEC §5) ao PR.
- [ ] Rebuild pasta principal (worker/mcp). PR (gated; declarar que é estrutural, igual B1).

## Ordem
0→1→2→3→4→5→6→7→8→9. Task 0 e a medição real das contagens são os pontos onde o B1 tropeçou ,
fazer com o canal de saída estável.
