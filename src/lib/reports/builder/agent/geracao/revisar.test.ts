jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { parseRevisao, promptRevisao } from "./revisar";
import type { Blueprint } from "./blueprint-types";

const anterior: Blueprint = {
  titulo: "Estoque",
  objetivo: "repor",
  secoes: [{ template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: {} }],
};

describe("parseRevisao", () => {
  it("aplica blueprint corrigido valido", () => {
    const raw = {
      notas: ["narrativa: adicionei uma tabela de detalhe"],
      titulo: "Estoque por armazem",
      objetivo: "repor com base no saldo",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", config: {} },
        { template: "DataTable", fato: "fato_estoque_saldo", config: {} },
      ],
    };
    const r = parseRevisao(raw, anterior);
    expect(r.semReparos).toBe(false);
    expect(r.blueprint.secoes).toHaveLength(2);
  });

  it("'sem reparos' com notas justificadas mantem o anterior", () => {
    const raw = { semReparos: true, notas: ["completude ok", "visual ok", "narrativa ok", "insight ok"] };
    const r = parseRevisao(raw, anterior);
    expect(r.semReparos).toBe(true);
    expect(r.blueprint).toEqual(anterior);
  });

  it("'sem reparos' SEM notas mantem o anterior (nao confia cegamente)", () => {
    const r = parseRevisao({ semReparos: true, notas: [] }, anterior);
    expect(r.blueprint).toEqual(anterior);
  });
});

describe("promptRevisao", () => {
  it("nomeia as 4 dimensoes na instrucao", () => {
    const txt = promptRevisao(anterior).map((m) => m.content).join("\n").toLowerCase();
    expect(txt).toContain("completude");
    expect(txt).toContain("narrativa");
    expect(txt).toContain("insight");
    expect(txt).toContain("visual");
  });
});
