jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { seccaoViavel } from "./viabilidade";

describe("seccaoViavel", () => {
  it("aceita fato do catalogo com template compativel (shape derivado do template)", () => {
    // fato_estoque_saldo oferece tabela/kpis/agregacaoCategorica.
    const r = seccaoViavel({ fato: "fato_estoque_saldo", template: "KPIRow" });
    expect(r.ok).toBe(true);
  });

  it("aceita BarChart (agregacaoCategorica) sobre saldo", () => {
    expect(seccaoViavel({ fato: "fato_estoque_saldo", template: "BarChart" }).ok).toBe(true);
  });

  it("recusa template cujo shape a fonte nao oferece", () => {
    // saldo NAO oferece serieTemporal -> LineChart inviavel.
    const r = seccaoViavel({ fato: "fato_estoque_saldo", template: "LineChart" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("fonte_nao_oferece_shape");
  });

  it("recusa fato fora do catalogo", () => {
    const r = seccaoViavel({ fato: "fato_vendas", template: "BarChart" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("fonte_desconhecida");
  });

  it("recusa template desconhecido", () => {
    const r = seccaoViavel({ fato: "fato_estoque_saldo", template: "Inexistente" as never });
    expect(r.ok).toBe(false);
  });

  it("respeita shapeDerivado explicito quando informado", () => {
    // tabela e oferecido por saldo e exigido por DataTable.
    const r = seccaoViavel({ fato: "fato_estoque_saldo", template: "DataTable", shapeDerivado: "tabela" });
    expect(r.ok).toBe(true);
  });
});
