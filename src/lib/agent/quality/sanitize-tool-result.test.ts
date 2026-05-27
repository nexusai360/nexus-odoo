import {
  sanitizeToolResult,
  type SanitizationMode,
} from "./sanitize-tool-result";

describe("sanitizeToolResult", () => {
  it("returns raw unchanged when mode=off", () => {
    const raw = '{"estado":"ok","dados":{"linhas":[{"valor":100}]}}';
    expect(sanitizeToolResult(raw, "off")).toBe(raw);
  });

  it("returns raw when input is not valid JSON", () => {
    const raw = "not json";
    expect(sanitizeToolResult(raw, "aggregates_only")).toBe(raw);
  });

  it("returns raw when there's no dados.linhas", () => {
    const raw = '{"estado":"ok","dados":{"total":42}}';
    expect(sanitizeToolResult(raw, "aggregates_only")).toBe(raw);
  });

  it("returns raw when linhas is empty", () => {
    const raw = '{"estado":"ok","dados":{"linhas":[]}}';
    expect(sanitizeToolResult(raw, "aggregates_only")).toBe(raw);
  });

  it("returns raw when linhas is array of strings (not objects)", () => {
    const raw = '{"estado":"ok","dados":{"linhas":["a","b","c"]}}';
    expect(sanitizeToolResult(raw, "aggregates_only")).toBe(raw);
  });

  it("appends _agregado with soma/media/min/max for valor field", () => {
    const raw = JSON.stringify({
      estado: "ok",
      dados: {
        linhas: [
          { nome: "A", valor: 100 },
          { nome: "B", valor: 200 },
          { nome: "C", valor: 300 },
        ],
      },
    });
    const out = JSON.parse(sanitizeToolResult(raw, "aggregates_only"));
    expect(out.dados._agregado).toEqual({
      contagem: 3,
      agregado_valor: {
        soma: 600,
        media: 200,
        min: 100,
        max: 300,
        contagemValidos: 3,
      },
    });
  });

  it("computes multiple fields when present", () => {
    const raw = JSON.stringify({
      estado: "ok",
      dados: {
        linhas: [
          { nome: "A", valor: 100, qtd: 5 },
          { nome: "B", valor: 200, qtd: 10 },
        ],
      },
    });
    const out = JSON.parse(sanitizeToolResult(raw, "aggregates_only"));
    expect(out.dados._agregado.agregado_valor.soma).toBe(300);
    expect(out.dados._agregado.agregado_qtd.soma).toBe(15);
    expect(out.dados._agregado.contagem).toBe(2);
  });

  it("ignores non-numeric values for the field", () => {
    const raw = JSON.stringify({
      estado: "ok",
      dados: {
        linhas: [
          { valor: 100 },
          { valor: null },
          { valor: "abc" },
          { valor: 200 },
        ],
      },
    });
    const out = JSON.parse(sanitizeToolResult(raw, "aggregates_only"));
    expect(out.dados._agregado.agregado_valor.soma).toBe(300);
    expect(out.dados._agregado.agregado_valor.contagemValidos).toBe(2);
    // contagem total continua refletindo todas as linhas
    expect(out.dados._agregado.contagem).toBe(4);
  });

  it("handles floats with precision (rounds to 2 decimals)", () => {
    const raw = JSON.stringify({
      estado: "ok",
      dados: {
        linhas: [
          { valor: 38064323.839999996 },
          { valor: 1234.5678 },
        ],
      },
    });
    const out = JSON.parse(sanitizeToolResult(raw, "aggregates_only"));
    expect(out.dados._agregado.agregado_valor.soma).toBe(38065558.41);
  });

  it("preserves original linhas untouched", () => {
    const raw = JSON.stringify({
      estado: "ok",
      dados: {
        linhas: [{ nome: "A", valor: 100 }],
        outroCampo: "preservado",
      },
    });
    const out = JSON.parse(sanitizeToolResult(raw, "aggregates_only"));
    expect(out.dados.linhas).toEqual([{ nome: "A", valor: 100 }]);
    expect(out.dados.outroCampo).toBe("preservado");
    expect(out.estado).toBe("ok");
  });

  it("does not produce agregado field if no numeric fields match", () => {
    const raw = JSON.stringify({
      estado: "ok",
      dados: {
        linhas: [
          { nome: "A", descricao: "x" },
          { nome: "B", descricao: "y" },
        ],
      },
    });
    // Sem campos numéricos reconhecidos, retorna raw (sem mutação).
    expect(sanitizeToolResult(raw, "aggregates_only")).toBe(raw);
  });
});
