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
  it("aplica o default do filtro de período (em meses) quando ausente", () => {
    const r = parseFilters(sec([{ tipo: "periodo", default: "3" }]), {});
    // periodoDe = mês de 3 meses atrás; periodoAte = mês corrente.
    expect(r.periodoDe).toMatch(/^\d{4}-\d{2}$/);
    expect(r.periodoAte).toMatch(/^\d{4}-\d{2}$/);
  });
  it("respeita periodoDe/periodoAte explícitos", () => {
    const r = parseFilters(sec([{ tipo: "periodo", default: "3" }]), {
      periodoDe: "2026-01", periodoAte: "2026-03",
    });
    expect(r.periodoDe).toBe("2026-01");
    expect(r.periodoAte).toBe("2026-03");
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
