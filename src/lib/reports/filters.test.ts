import { parseFilters } from "./filters";
import type { ReportSection } from "./types";

const sec = (filtros: ReportSection["filtros"]): ReportSection => ({
  id: "s", template: "DataTable", fato: "f", config: {}, filtros,
});

describe("parseFilters", () => {
  it("converte produtoId de string para número", () => {
    const r = parseFilters(sec([{ tipo: "produto" }]), { produtoId: "12" });
    expect(r.produtoId).toBe(12);
  });
  it("ignora produtoId não numérico", () => {
    const r = parseFilters(sec([{ tipo: "produto" }]), { produtoId: "abc" });
    expect(r.produtoId).toBeUndefined();
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
  it("passa a busca como texto", () => {
    expect(parseFilters(sec([{ tipo: "busca" }]), { busca: "esteira" }).busca)
      .toBe("esteira");
  });
});
