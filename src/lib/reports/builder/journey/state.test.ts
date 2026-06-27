import {
  journeyStateInicial,
  defaultParaConversa,
  entendimentoElegivel,
  irParaResumo,
  voltarParaEntrevista,
} from "./state";
import type { BuilderReportEntry } from "../types";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

/* eslint-disable @typescript-eslint/no-explicit-any */
function ficha(secoes: any[]): BuilderReportEntry {
  return {
    id: "r",
    titulo: "t",
    dominio: "estoque",
    schemaVersion: 1,
    tipo: "tela_cheia",
    parametros: [],
    secoes: secoes.map((s, i) => ({
      id: `s${i}`,
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: {},
      filtros: [],
      ...s,
    })),
  } as any;
}

describe("entendimentoElegivel", () => {
  it("vazio nao elegivel", () => {
    expect(entendimentoElegivel(journeyStateInicial()).ok).toBe(false);
  });
  it("completo + 2 turnos elegivel", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 2;
    s.fichaRascunho = ficha([
      { template: "KPIRow", shapeDerivado: "kpis" },
      { template: "BarChart", fato: "fato_estoque_marca", shapeDerivado: "agregacaoCategorica" },
    ]);
    expect(entendimentoElegivel(s).ok).toBe(true);
  });
  it("completo em 1 turno SEM entendimento NAO elegivel (floor binding)", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 1;
    s.fichaRascunho = ficha([
      { template: "KPIRow", shapeDerivado: "kpis" },
      { template: "BarChart", fato: "fato_estoque_marca", shapeDerivado: "agregacaoCategorica" },
    ]);
    expect(entendimentoElegivel(s).ok).toBe(false);
  });
  it("1 turno COM entendimento reflexivo -> elegivel (atalho)", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 1;
    s.entendimento = "voce quer o estoque parado por marca com valor imobilizado";
    s.fichaRascunho = ficha([
      { template: "KPIRow", shapeDerivado: "kpis" },
      { template: "DataTable", shapeDerivado: "tabela" },
    ]);
    expect(entendimentoElegivel(s).ok).toBe(true);
  });
  it("so KPIRow nao satisfaz visualizacao", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 3;
    s.fichaRascunho = ficha([{ template: "KPIRow", shapeDerivado: "kpis" }]);
    expect(entendimentoElegivel(s).ok).toBe(false);
  });
  it("semKpiDeclarado dispensa KPIRow", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 2;
    s.semKpiDeclarado = true;
    s.fichaRascunho = ficha([{ template: "DataTable", shapeDerivado: "tabela" }]);
    expect(entendimentoElegivel(s).ok).toBe(true);
  });
  it("fato inexistente nao conta como dados", () => {
    const s = journeyStateInicial();
    s.turnosUsuario = 3;
    s.fichaRascunho = ficha([{ fato: "fato_x", template: "DataTable", shapeDerivado: "tabela" }]);
    expect(entendimentoElegivel(s).ok).toBe(false);
  });
});

describe("defaultParaConversa", () => {
  it("legado com savedReport -> refino", () => {
    expect(defaultParaConversa({ temSavedReport: true }).fase).toBe("refino");
  });
  it("conversa nova -> entrevista", () => {
    expect(defaultParaConversa({ temSavedReport: false }).fase).toBe("entrevista");
  });
  it("journeyState existente e respeitado", () => {
    const s = journeyStateInicial();
    s.fase = "resumo";
    expect(defaultParaConversa({ temSavedReport: true, journeyState: s }).fase).toBe("resumo");
  });
});

describe("transicoes", () => {
  function fichaElegivel() {
    const s = journeyStateInicial();
    s.turnosUsuario = 2;
    s.entendimento = "x".repeat(20);
    s.fichaRascunho = ficha([
      { template: "KPIRow", shapeDerivado: "kpis" },
      { template: "DataTable", shapeDerivado: "tabela" },
    ]);
    return s;
  }
  it("irParaResumo recusa quando inelegivel", () => {
    const r = irParaResumo(journeyStateInicial());
    expect("erro" in r).toBe(true);
  });
  it("irParaResumo aceita elegivel; voltarParaEntrevista reverte", () => {
    const r = irParaResumo(fichaElegivel());
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) {
      expect(r.fase).toBe("resumo");
      expect(voltarParaEntrevista(r).fase).toBe("entrevista");
    }
  });
});
