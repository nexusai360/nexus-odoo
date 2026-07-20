// T4c , montagem e ordenacao dos alvos do purge (Limpa 2026+).
import { describe, it, expect } from "@jest/globals";
import { montaAlvosPurge } from "./alvos";
import { MODEL_CATALOG } from "../catalog/model-catalog";

describe("alvos do purge", () => {
  const alvos = montaAlvosPurge(MODEL_CATALOG);

  it("cobre exatamente os 15 alvos do catalogo (corte + cortePai + especial)", () => {
    const esperado = MODEL_CATALOG.filter(
      (e) => e.corte || e.cortePai || e.corteEspecial,
    ).length;
    expect(alvos).toHaveLength(esperado);
    expect(alvos).toHaveLength(15);
  });

  it("ordem de delecao: neto antes do filho antes da raiz (FK do filho depende do pai vivo)", () => {
    const pos = (t: string) => alvos.findIndex((a) => a.tabela === t);
    // neto (via item) vem antes do item
    expect(pos("raw_sped_documento_item_rastreabilidade")).toBeLessThan(
      pos("raw_sped_documento_item"),
    );
    // todo filho vem antes do pai raiz
    for (const filho of [
      "raw_sped_documento_item",
      "raw_sped_documento_duplicata",
      "raw_sped_documento_pagamento",
      "raw_sped_documento_referenciado",
      "raw_sped_documento_volume",
    ]) {
      expect(pos(filho)).toBeLessThan(pos("raw_sped_documento"));
    }
  });

  it("neto encadeia ao avo com guard de array nos 2 niveis", () => {
    const neto = alvos.find((a) => a.tabela === "raw_sped_documento_item_rastreabilidade")!;
    expect(neto.where).toContain("jsonb_typeof(data->'item_id') = 'array'");
    expect(neto.where).toContain("jsonb_typeof(data->'documento_id') = 'array'");
  });

  it("titulo usa o predicado por situacao (divida viva JAMAIS entra)", () => {
    const titulo = alvos.find((a) => a.tabela === "raw_finan_lancamento")!;
    expect(titulo.where).toContain("situacao_divida_simples");
    expect(titulo.where).not.toMatch(/data->>'data'[^_p]/); // nunca corte por data generica
  });

  it("transacional carrega chaveNulos para o FILTER do dry-run", () => {
    const doc = alvos.find((a) => a.tabela === "raw_sped_documento")!;
    expect(doc.chaveNulos).toBe("data_emissao");
  });

  // Fase 1B: o purge le o MESMO override que a ingestao (corteIngestaoDe por modelo). Assim,
  // se rodado apos o back-fill, ele NAO re-apaga os pedidos/itens antigos trazidos (R2/PR#168).
  describe("Fase 1B , purge respeita o override de ingestao por modelo", () => {
    it("pedido.documento usa o override 2024-11-01 (nao apaga os pedidos antigos trazidos)", () => {
      const p = alvos.find((a) => a.tabela === "raw_pedido_documento")!;
      expect(p.where).toContain("< '2024-11-01'");
      expect(p.where).not.toContain("< '2026-01-01'");
    });
    it("sped.documento.item usa o override 2024-11-01 no limiar do pai (itens de pedido antigos ficam)", () => {
      const i = alvos.find((a) => a.tabela === "raw_sped_documento_item")!;
      expect(i.where).toContain("< '2024-11-01'");
      expect(i.where).not.toContain("< '2026-01-01'");
    });
    it("sped.documento (nota) permanece no corte global 2026 (historico de notas segue apagavel)", () => {
      const n = alvos.find((a) => a.tabela === "raw_sped_documento")!;
      expect(n.where).toContain("< '2026-01-01'");
      expect(n.where).not.toContain("< '2024-11-01'");
    });
  });
});
