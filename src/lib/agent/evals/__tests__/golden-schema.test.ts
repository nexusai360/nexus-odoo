import { describe, it, expect } from "@jest/globals";
import { GoldenEntrySchema, GoldenSchema } from "../golden-schema";
import goldenData from "../golden/golden-nex.json";
import { readToolsOperacionais } from "../cobertura";

const base = {
  id: "x-1",
  pergunta: "p?",
  dominio: "estoque",
  classe: "prosseguir",
  toolEsperada: "estoque_saldo_produto",
};

describe("GoldenEntrySchema", () => {
  it("aceita prosseguir minimo", () => {
    expect(GoldenEntrySchema.safeParse(base).success).toBe(true);
  });
  it("aceita kpiOuro em prosseguir", () => {
    const e = { ...base, kpiOuro: [{ chave: "saldoTotal", valor: 789, match: "exato", fonteOuro: "SELECT ..." }] };
    expect(GoldenEntrySchema.safeParse(e).success).toBe(true);
  });
  it("rejeita kpiOuro fora de prosseguir", () => {
    const e = { id: "y", pergunta: "p?", dominio: null, classe: "falta_honesta", toolEsperada: "registrar_lacuna", kpiOuro: [{ chave: "x", valor: 1, match: "exato", fonteOuro: "s" }] };
    expect(GoldenEntrySchema.safeParse(e).success).toBe(false);
  });
  it("rejeita volatil com match exato", () => {
    const e = { ...base, volatil: true, kpiOuro: [{ chave: "totalVencido", valor: 1, match: "exato", fonteOuro: "s" }] };
    expect(GoldenEntrySchema.safeParse(e).success).toBe(false);
  });
});

describe("golden-nex.json", () => {
  const data = goldenData as Array<Record<string, unknown>>;
  it("valida no schema e tem ids unicos", () => {
    const r = GoldenSchema.safeParse(data);
    if (!r.success) console.error(JSON.stringify(r.error.issues.slice(0, 5), null, 2));
    expect(r.success).toBe(true);
    const ids = data.map((e) => e.id as string);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("migrou >=45 entradas", () => {
    expect(data.length).toBeGreaterThanOrEqual(45);
  });
  it("ha >=1 kpiOuro por dominio operacional", () => {
    for (const d of ["estoque", "financeiro", "fiscal", "comercial"]) {
      const tem = data.some((e) => e.dominio === d && Array.isArray(e.kpiOuro) && (e.kpiOuro as unknown[]).length > 0);
      expect({ d, tem }).toEqual({ d, tem: true });
    }
  });
  it("ha >=3 casos de desambiguacao com esperaAmbiguidade", () => {
    const ds = data.filter((e) => e.classe === "desambiguacao");
    expect(ds.length).toBeGreaterThanOrEqual(3);
    expect(ds.every((e) => e.esperaAmbiguidade)).toBe(true);
  });
  it("toda read-tool operacional tem >=1 entrada", () => {
    const comEntrada = new Set(data.map((e) => e.toolEsperada as string));
    const faltando = readToolsOperacionais().filter((id) => !comEntrada.has(id));
    expect(faltando).toEqual([]);
  });
});
