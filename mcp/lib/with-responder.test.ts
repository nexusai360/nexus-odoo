import { describe, it, expect } from "@jest/globals";
import { calcularExtras, enriquecerEnvelope } from "./with-responder";
import type { FreshnessEnvelope } from "./freshness";

// Normaliza qualquer whitespace (incluindo NBSP/NNBSP usados pelo Intl).
const normSpaces = (s: string) => s.replace(/\s+/g, " ");

describe("calcularExtras", () => {
  it("calcula _RESPOSTA + topPorParticipante para contas_a_pagar", () => {
    const extras = calcularExtras("financeiro_contas_a_pagar", {
      destaque: { totalAPagar: 1000, contagem: 3 },
      titulos: [
        { participanteNome: "Jds", vrSaldo: 600 },
        { participanteNome: "Jds", vrSaldo: 200 },
        { participanteNome: "Casa Ferolla", vrSaldo: 200 },
      ],
    });
    expect(normSpaces(extras._RESPOSTA)).toContain("R$ 1.000,00");
    expect(extras.topPorParticipante?.[0]?.nome).toBe("Jds");
    expect(extras.topPorParticipante?.[0]?.soma).toBe(800);
    // T-22: linhas.length == contagem -> nao truncado.
    expect(extras._listaTruncada).toBe(false);
  });

  it("T-22: _AVISO_TRUNCAMENTO automatico quando contagem > linhas exibidas", () => {
    const extras = calcularExtras("financeiro_contas_a_pagar", {
      destaque: { totalAPagar: 1000, contagem: 50 },
      titulos: [{ participanteNome: "A", vrSaldo: 500 }],
    });
    expect(extras._listaTruncada).toBe(true);
    expect(extras._AVISO_TRUNCAMENTO).toContain("Encontrei 50");
    expect(extras._AVISO_TRUNCAMENTO).toContain("listando 1");
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

  it("paginacao injeta _PAGINACAO e deriva _listaTruncada=temMais", () => {
    const extras = calcularExtras("cadastro_parceiros_novos", {
      paginacao: { total: 100, mostrando: "1-10 de 100", temMais: true, proximoOffset: 10 },
    });
    expect(extras._PAGINACAO?.temMais).toBe(true);
    expect(extras._PAGINACAO?.proximoOffset).toBe(10);
    expect(extras._listaTruncada).toBe(true);
    expect(extras._AVISO_TRUNCAMENTO).toContain("os proximos");
  });

  it("paginacao na ultima pagina nao trunca", () => {
    const extras = calcularExtras("cadastro_parceiros_novos", {
      paginacao: { total: 8, mostrando: "1-8 de 8", temMais: false, proximoOffset: null },
    });
    expect(extras._listaTruncada).toBe(false);
    expect(extras._AVISO_TRUNCAMENTO).toBeUndefined();
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

// Limpa 2026+ T7a: honestidade pre-corte no gancho central.
describe("calcularExtras , periodo pre-corte (Limpa 2026+)", () => {
  it("preCorte=true curto-circuita a resposta com o texto honesto", () => {
    const r = calcularExtras("fiscal_faturamento_periodo", {
      destaque: { headlineValor: 0 },
      periodo: { preCorte: true, label: "2025-01-01 a 2025-12-31" },
    });
    expect(r._RESPOSTA).toContain("16/03/2026");
    expect(r._RESPOSTA).toContain("2025-01-01 a 2025-12-31");
    expect(r._DESTAQUE?.periodoPreCorte).toBe(1);
  });

  it("preCorte=false segue o fluxo normal do formatador", () => {
    const r = calcularExtras("fiscal_faturamento_periodo", {
      destaque: { headlineValor: 10 },
      periodo: { preCorte: false, label: "2026" },
    });
    expect(r._RESPOSTA).not.toContain("16/03/2026");
    expect(r._DESTAQUE?.periodoPreCorte).toBeUndefined();
  });
});
