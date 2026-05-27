import { describe, it, expect } from "@jest/globals";
import { calcularExtras, enriquecerEnvelope } from "./with-responder";
import type { FreshnessEnvelope } from "./freshness";

// Normaliza qualquer whitespace (incluindo NBSP/NNBSP usados pelo Intl).
const normSpaces = (s: string) => s.replace(/\s+/g, " ");

describe("calcularExtras", () => {
  it("calcula _RESPOSTA + topPorParticipante para contas_a_pagar", () => {
    const extras = calcularExtras("financeiro_contas_a_pagar", {
      destaque: { totalAPagar: 1000, contagem: 5 },
      titulos: [
        { participanteNome: "Jds", vrSaldo: 600 },
        { participanteNome: "Jds", vrSaldo: 200 },
        { participanteNome: "Casa Ferolla", vrSaldo: 200 },
      ],
    });
    expect(normSpaces(extras._RESPOSTA)).toContain("R$ 1.000,00");
    expect(extras.topPorParticipante?.[0]?.nome).toBe("Jds");
    expect(extras.topPorParticipante?.[0]?.soma).toBe(800);
    expect(extras._listaTruncada).toBe(false);
  });

  it("listaTruncada=true reflete no envelope", () => {
    const extras = calcularExtras("financeiro_contas_a_receber", {
      destaque: { totalAReceber: 500, contagem: 2 },
      titulos: [{ participanteNome: "X", vrSaldo: 500 }],
      listaTruncada: true,
    });
    expect(extras._listaTruncada).toBe(true);
  });

  it("sem destaque nem titulos, cai no formatador generico", () => {
    const extras = calcularExtras("tool_desconhecida_xyz");
    expect(extras._RESPOSTA).toContain("Resultado obtido");
    expect(extras.topPorParticipante).toBeUndefined();
  });
});

describe("enriquecerEnvelope", () => {
  it("passa estado=preparando sem alteracao", () => {
    const env: FreshnessEnvelope<{ titulos: []; totalAPagar: number }> = {
      estado: "preparando",
    };
    const r = enriquecerEnvelope(env, "financeiro_contas_a_pagar");
    expect(r).toEqual({ estado: "preparando" });
  });

  it("merge extras no dados quando estado=ok", () => {
    const env: FreshnessEnvelope<{ titulos: unknown[]; totalAPagar: number }> = {
      estado: "ok",
      dados: { titulos: [], totalAPagar: 100 },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus: { status: "ok", ultimaSyncEm: null },
    };
    const r = enriquecerEnvelope(env, "financeiro_contas_a_pagar", {
      destaque: { totalAPagar: 100, contagem: 1 },
      titulos: [{ participanteNome: "X", vrSaldo: 100 }],
    });
    if (r.estado === "ok" || r.estado === "vazio") {
      expect(r.dados.totalAPagar).toBe(100);
      expect(normSpaces(r.dados._RESPOSTA)).toContain("R$ 100,00");
      expect(r.dados.topPorParticipante?.[0]?.nome).toBe("X");
    }
  });
});
