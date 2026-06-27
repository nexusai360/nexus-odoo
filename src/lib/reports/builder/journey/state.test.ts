jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  journeyStateInicial,
  defaultParaConversa,
  entendimentoElegivel,
  marcarDimensaoRelevante,
  irParaResumo,
  voltarParaEntrevista,
  type JourneyState,
} from "./state";
import type { SeccaoPretendida } from "./intencao";

/** Estado com evidencia objetiva (intencao estruturada) coberto no nucleo. */
function elegivel(over: Partial<JourneyState> = {}): JourneyState {
  const s = journeyStateInicial();
  s.turnosUsuario = 2;
  s.entendimento = "quero ver o saldo por armazem para repor o estoque";
  s.intencao = {
    secoes: [
      { fato: "fato_estoque_saldo", template: "KPIRow" },
      { fato: "fato_estoque_saldo", template: "BarChart" },
    ] as SeccaoPretendida[],
  };
  return { ...s, ...over };
}

describe("entendimentoElegivel", () => {
  it("vazio nao elegivel", () => {
    expect(entendimentoElegivel(journeyStateInicial()).ok).toBe(false);
  });

  it("nucleo coberto + 2 turnos = elegivel", () => {
    expect(entendimentoElegivel(elegivel()).ok).toBe(true);
  });

  it("1 turno NAO elegivel (objetivo exige >=2 turnos)", () => {
    expect(entendimentoElegivel(elegivel({ turnosUsuario: 1 })).ok).toBe(false);
  });

  it("so KPIRow nao satisfaz visualizacao", () => {
    const s = elegivel({
      intencao: { secoes: [{ fato: "fato_estoque_saldo", template: "KPIRow" }] as SeccaoPretendida[] },
    });
    expect(entendimentoElegivel(s).ok).toBe(false);
  });

  it("semKpiDeclarado dispensa KPIRow", () => {
    const s = elegivel({
      intencao: {
        secoes: [{ fato: "fato_estoque_saldo", template: "DataTable" }] as SeccaoPretendida[],
        semKpiDeclarado: true,
      },
    });
    expect(entendimentoElegivel(s).ok).toBe(true);
  });

  it("sem secao registrada nao conta como dados", () => {
    const s = elegivel({ intencao: { secoes: [] } });
    expect(entendimentoElegivel(s).ok).toBe(false);
  });

  it("dimensao opcional relevante mas nao coberta segura o gate (roteiro nao cumprido)", () => {
    const s = elegivel({ dimensoesRelevantes: ["objetivo", "dados", "visualizacao", "indicadores", "filtros"] });
    // filtros relevante mas nao tocada -> respondidas(4) < total(5) -> nao elegivel
    expect(entendimentoElegivel(s).ok).toBe(false);
  });
});

describe("marcarDimensaoRelevante", () => {
  it("adiciona opcional e cresce o roteiro", () => {
    const s = marcarDimensaoRelevante(journeyStateInicial(), "filtros");
    expect(s.dimensoesRelevantes).toContain("filtros");
  });
  it("congela apos elegivel (nao retrai o Gerar)", () => {
    const s = marcarDimensaoRelevante(elegivel(), "filtros");
    expect(s.dimensoesRelevantes).not.toContain("filtros");
  });
  it("idempotente", () => {
    const s1 = marcarDimensaoRelevante(journeyStateInicial(), "filtros");
    const s2 = marcarDimensaoRelevante(s1, "filtros");
    expect(s2.dimensoesRelevantes.filter((d) => d === "filtros")).toHaveLength(1);
  });
});

describe("defaultParaConversa", () => {
  it("legado com savedReport -> refino", () => {
    expect(defaultParaConversa({ temSavedReport: true }).fase).toBe("refino");
  });
  it("conversa nova -> entrevista", () => {
    expect(defaultParaConversa({ temSavedReport: false }).fase).toBe("entrevista");
  });
  it("journeyState legado SEM intencao recebe backfill", () => {
    const legado = { fase: "entrevista", turnosUsuario: 3, dimensoesTocadas: {} } as unknown as JourneyState;
    const r = defaultParaConversa({ temSavedReport: false, journeyState: legado });
    expect(r.intencao).toEqual({ secoes: [] });
    expect(r.dimensoesRelevantes).toEqual(["objetivo", "dados", "visualizacao", "indicadores"]);
  });
});

describe("transicoes (resumo , removidas na Task 17)", () => {
  it("irParaResumo recusa quando inelegivel", () => {
    const r = irParaResumo(journeyStateInicial());
    expect("erro" in r).toBe(true);
  });
  it("irParaResumo aceita elegivel; voltarParaEntrevista reverte", () => {
    const r = irParaResumo(elegivel());
    expect("erro" in r).toBe(false);
    if (!("erro" in r)) {
      expect(r.fase).toBe("resumo");
      expect(voltarParaEntrevista(r).fase).toBe("entrevista");
    }
  });
});
