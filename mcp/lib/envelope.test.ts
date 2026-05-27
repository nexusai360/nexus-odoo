import { describe, it, expect } from "@jest/globals";
import { buildEnvelope, type ToolEnvelope } from "./envelope";

describe("buildEnvelope", () => {
  it("retorna envelope minimo com todos os campos canonicos", () => {
    const env = buildEnvelope<{ id: number }>({
      _RESPOSTA: "Resultado teste",
      _listaTruncada: false,
      linhas: [{ id: 1 }, { id: 2 }],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
    });

    expect(env._RESPOSTA).toBe("Resultado teste");
    expect(env._listaTruncada).toBe(false);
    expect(env.linhas).toHaveLength(2);
    expect(env.atualizadoHa).toBe("1min");
    expect(env._DESTAQUE).toBeUndefined();
    expect(env._agregado).toBeUndefined();
    expect(env.topPorParticipante).toBeUndefined();
  });

  it("aceita campos opcionais (DESTAQUE, agregado, topPorParticipante)", () => {
    const env: ToolEnvelope = buildEnvelope({
      _RESPOSTA: "x",
      _listaTruncada: true,
      linhas: [],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      _DESTAQUE: { total: 1000 },
      _agregado: { soma: 1000, contagem: 5 },
      topPorParticipante: [{ nome: "X", soma: 500, n: 2 }],
    });

    expect(env._DESTAQUE).toEqual({ total: 1000 });
    expect(env._agregado?.soma).toBe(1000);
    expect(env.topPorParticipante).toHaveLength(1);
  });

  it("trunca _RESPOSTA a 500 chars com elipse", () => {
    const longa = "a".repeat(600);
    const env = buildEnvelope({
      _RESPOSTA: longa,
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
    });
    expect(env._RESPOSTA.length).toBe(500);
    expect(env._RESPOSTA.endsWith("...")).toBe(true);
  });

  it("aceita aviso e redirecionar opcionais", () => {
    const env = buildEnvelope({
      _RESPOSTA: "x",
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "0s",
      aviso: "tipoSugerido=a_receber",
      redirecionar: {
        tool: "financeiro_contas_a_receber",
        motivo: "metrica derivada",
        confianca: 0.9,
      },
    });
    expect(env.aviso).toBe("tipoSugerido=a_receber");
    expect(env.redirecionar?.confianca).toBe(0.9);
  });
});
