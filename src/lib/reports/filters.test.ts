import { parseFilters } from "./filters";
import type { ReportSection } from "./types";

const sec = (filtros: ReportSection["filtros"]): ReportSection => ({
  id: "s", template: "DataTable", fato: "f", config: {}, filtros,
});

describe("parseFilters", () => {
  it("parseia armazemId de string para número", () => {
    const r = parseFilters(sec([{ tipo: "armazem" }]), { armazemId: "5" });
    expect(r.armazemId).toBe(5);
  });
  it("ignora armazemId não numérico", () => {
    const r = parseFilters(sec([{ tipo: "armazem" }]), { armazemId: "abc" });
    expect(r.armazemId).toBeUndefined();
  });
  it("parseia familiaId", () => {
    const r = parseFilters(sec([{ tipo: "familia" }]), { familiaId: "9" });
    expect(r.familiaId).toBe(9);
  });
  it("parseia sentido válido e ignora inválido", () => {
    expect(parseFilters(sec([{ tipo: "sentido" }]), { sentido: "entrada" }).sentido)
      .toBe("entrada");
    expect(parseFilters(sec([{ tipo: "sentido" }]), { sentido: "xpto" }).sentido)
      .toBeUndefined();
  });
  it("faixaDias inválida cai no default", () => {
    const r = parseFilters(sec([{ tipo: "faixaDias", default: "30" }]), {
      faixaDias: "999",
    });
    expect(r.faixaDias).toBe(30);
  });
});
