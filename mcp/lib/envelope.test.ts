import { describe, it, expect } from "@jest/globals";
import {
  buildEnvelope,
  type ToolEnvelope,
  EnvelopeBaseShape,
  dadosBaseShape,
  envelopePronto,
} from "./envelope";

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

describe("EnvelopeBaseShape (contrato base, F4 Onda 1.3)", () => {
  const fonteStatus = { status: "ok", ultimaSyncEm: "2026-05-27T00:00:00Z" };

  it("valida o estado preparando (sem dados)", () => {
    expect(EnvelopeBaseShape.safeParse({ estado: "preparando" }).success).toBe(true);
  });

  it("valida envelope ok com dados minimos (_RESPOSTA)", () => {
    const env = {
      estado: "ok",
      dados: { _RESPOSTA: "12 itens em estoque", linhas: [{ id: 1 }] },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus,
    };
    expect(EnvelopeBaseShape.safeParse(env).success).toBe(true);
  });

  it("dados e passthrough: aceita chave de array extra (titulos)", () => {
    const env = {
      estado: "vazio",
      dados: { _RESPOSTA: "nada", titulos: [], serie: [{ x: 1 }] },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus,
    };
    const r = EnvelopeBaseShape.safeParse(env);
    expect(r.success).toBe(true);
    if (r.success && r.data.estado !== "preparando") {
      // passthrough preserva a chave extra
      expect((r.data.dados as Record<string, unknown>).titulos).toEqual([]);
      expect((r.data.dados as Record<string, unknown>).serie).toEqual([{ x: 1 }]);
    }
  });

  it("rejeita dados sem _RESPOSTA", () => {
    const env = {
      estado: "ok",
      dados: { linhas: [] },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus,
    };
    expect(EnvelopeBaseShape.safeParse(env).success).toBe(false);
  });

  it("rejeita estado invalido", () => {
    expect(EnvelopeBaseShape.safeParse({ estado: "qualquer" }).success).toBe(false);
  });

  it("dadosBaseShape exige _RESPOSTA string e e passthrough", () => {
    expect(dadosBaseShape.safeParse({ _RESPOSTA: "x", linhas: [], qualquer: 1 }).success).toBe(true);
    expect(dadosBaseShape.safeParse({ linhas: [] }).success).toBe(false);
  });

  it("envelopePronto produz dados validos sob dadosBaseShape", () => {
    const d = envelopePronto({ _RESPOSTA: "ok", linhas: [{ id: 1 }] });
    expect(dadosBaseShape.safeParse(d).success).toBe(true);
    expect(d._RESPOSTA).toBe("ok");
  });

  it("o tipo ToolEnvelope continua exportado e casa com dadosBaseShape", () => {
    const env: ToolEnvelope = buildEnvelope({
      _RESPOSTA: "x",
      _listaTruncada: false,
      linhas: [],
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
    });
    expect(dadosBaseShape.safeParse(env).success).toBe(true);
  });
});
