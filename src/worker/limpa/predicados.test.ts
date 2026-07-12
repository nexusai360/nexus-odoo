// T4a , predicados do purge (Limpa 2026+).
import { describe, it, expect } from "@jest/globals";
import {
  wherePre2026Raw,
  wherePre2026Filho,
  wherePre2026Neto,
  whereTituloQuitadoPre2026Raw,
  whereTituloQuitadoPre2026Fato,
  deleteLote,
  contagemDryRun,
} from "./predicados";

describe("predicados do purge", () => {
  it("transacional: NULL preservado + corte por substring(1,10) tolera datetime", () => {
    const w = wherePre2026Raw("data_emissao");
    expect(w).toContain("IS NOT NULL");
    expect(w).toContain("from 1 for 10) < '2026-03-16'");
  });

  it("filho: FK many2one extraida com ->'fk'->>0 (array [id,label])", () => {
    const w = wherePre2026Filho("raw_sped_documento", "documento_id", "data_emissao");
    expect(w).toContain("(data->'documento_id'->>0)::int IN");
    expect(w).toContain("FROM raw_sped_documento WHERE");
    expect(w).not.toContain("data->>'documento_id'"); // o erro que a review pegou
  });

  it("filho: FK vazia do Odoo (false) NAO pode chegar ao cast ::int", () => {
    // Bug real do dry-run: em jsonb, escalar e tratado como array de 1 elemento
    // pelo -> 0, entao false->>0 = 'false' passa no IS NOT NULL e quebra o cast.
    // O guard correto e jsonb_typeof = 'array' (false/null/number ficam fora).
    const w = wherePre2026Filho("raw_sped_documento", "documento_id", "data_emissao");
    expect(w).toContain("jsonb_typeof(data->'documento_id') = 'array'");
    expect(w).not.toContain("(data->'documento_id'->>0) IS NOT NULL");
  });

  it("neto: encadeia ao avo via pai intermediario com o mesmo guard de array", () => {
    const w = wherePre2026Neto(
      "raw_sped_documento_item", "item_id",
      "raw_sped_documento", "documento_id", "data_emissao",
    );
    expect(w).toContain("jsonb_typeof(data->'item_id') = 'array'");
    expect(w).toContain("(data->'item_id'->>0)::int IN");
    expect(w).toContain("SELECT odoo_id FROM raw_sped_documento_item WHERE");
    expect(w).toContain("jsonb_typeof(data->'documento_id') = 'array'");
    expect(w).toContain("FROM raw_sped_documento WHERE");
  });

  it("titulo RAW: so quitado/baixado pagos antes do corte (divida viva fica)", () => {
    const w = whereTituloQuitadoPre2026Raw();
    expect(w).toContain("situacao_divida_simples"); // chave certa do raw
    expect(w).toContain("('quitado','baixado')");
    expect(w).toContain("data_pagamento");
    expect(w).not.toMatch(/aberto|provisorio|efetivo/);
  });

  it("titulo FATO: colunas materializadas", () => {
    const w = whereTituloQuitadoPre2026Fato();
    expect(w).toContain("situacao_simples IN ('quitado','baixado')");
    expect(w).toContain("data_pagamento < '2026-03-16'");
  });

  it("delete em lote por ctid", () => {
    const sql = deleteLote("raw_x", "1=1", 5000);
    expect(sql).toContain("ctid IN (SELECT ctid FROM raw_x WHERE 1=1 LIMIT 5000)");
  });

  it("dry-run conta a_deletar + nulos preservados", () => {
    const sql = contagemDryRun("raw_x", "cond", "data_emissao");
    expect(sql).toContain("FILTER (WHERE cond) AS a_deletar");
    expect(sql).toContain("nulos_preservados");
  });
});
