// src/worker/limpa/predicados.ts , T4a do plan Limpa 2026+.
//
// Funcoes PURAS que montam os SQLs do purge por classe de tabela. O script
// (T4b-d) so orquestra; toda a logica perigosa vive aqui, testada com fixtures
// do shape real. Regras duras (spec/plan v3):
//  - NULL nunca deleta (predicado exige campo nao-nulo);
//  - filho usa FK many2one array: (data->'fk'->>0)::int;
//  - titulo: somente quitado/baixado E pago antes do corte (divida viva fica);
//  - DELETE sempre em lotes (ctid LIMIT) , 923MB nao cabem numa transacao.

import { CORTE_DADOS_ISO } from "../sync/corte";

export const LOTE_PADRAO = 10_000;

/** WHERE de transacional com data propria no RAW (JSON). NULL preservado. */
export function wherePre2026Raw(chaveData: string, corte: string = CORTE_DADOS_ISO): string {
  // substr(1,10) tolera datetime ("2025-03-31 14:22:00") e date puro.
  return `(data->>'${chaveData}') IS NOT NULL AND substring(data->>'${chaveData}' from 1 for 10) < '${corte}'`;
}

/**
 * WHERE de filho por JOIN ao pai pre-2026 (FK many2one = [id,"label"]).
 * O guard e jsonb_typeof = 'array', nunca IS NOT NULL: FK vazia no Odoo vem
 * como `false`, e em jsonb o escalar age como array de 1 elemento no `-> 0`
 * (false->>0 = 'false' passa no IS NOT NULL e quebra o cast ::int).
 */
export function wherePre2026Filho(
  tabelaRawPai: string,
  fkRaw: string,
  chaveDataPai: string,
  corte: string = CORTE_DADOS_ISO,
): string {
  return (
    `jsonb_typeof(data->'${fkRaw}') = 'array' AND (data->'${fkRaw}'->>0)::int IN ` +
    `(SELECT odoo_id FROM ${tabelaRawPai} WHERE ${wherePre2026Raw(chaveDataPai, corte)})`
  );
}

/** WHERE de neto: encadeia ao avo via pai intermediario (ambos FK m2o array). */
export function wherePre2026Neto(
  tabelaRawPai: string,
  fkRawNoNeto: string,
  tabelaRawAvo: string,
  fkRawNoPai: string,
  chaveDataAvo: string,
  corte: string = CORTE_DADOS_ISO,
): string {
  return (
    `jsonb_typeof(data->'${fkRawNoNeto}') = 'array' AND (data->'${fkRawNoNeto}'->>0)::int IN ` +
    `(SELECT odoo_id FROM ${tabelaRawPai} WHERE ${wherePre2026Filho(tabelaRawAvo, fkRawNoPai, chaveDataAvo, corte)})`
  );
}

/** WHERE do titulo no RAW: somente quitado/baixado E pago antes do corte. */
export function whereTituloQuitadoPre2026Raw(corte: string = CORTE_DADOS_ISO): string {
  return (
    `(data->>'situacao_divida_simples') IN ('quitado','baixado') ` +
    `AND (data->>'data_pagamento') IS NOT NULL ` +
    `AND substring(data->>'data_pagamento' from 1 for 10) < '${corte}'`
  );
}

/** WHERE do titulo no FATO (colunas materializadas). */
export function whereTituloQuitadoPre2026Fato(corte: string = CORTE_DADOS_ISO): string {
  return (
    `situacao_simples IN ('quitado','baixado') ` +
    `AND data_pagamento IS NOT NULL AND data_pagamento < '${corte}'`
  );
}

/** DELETE em lote por ctid (commit por lote no orquestrador). */
export function deleteLote(tabela: string, where: string, lote: number = LOTE_PADRAO): string {
  return `DELETE FROM ${tabela} WHERE ctid IN (SELECT ctid FROM ${tabela} WHERE ${where} LIMIT ${lote})`;
}

/** SELECT de contagem do dry-run (linhas a deletar + NULLs preservados). */
export function contagemDryRun(tabela: string, where: string, chaveData?: string): string {
  const nulos = chaveData
    ? `, count(*) FILTER (WHERE (data->>'${chaveData}') IS NULL) AS nulos_preservados`
    : "";
  return `SELECT count(*) FILTER (WHERE ${where}) AS a_deletar${nulos}, count(*) AS total FROM ${tabela}`;
}
