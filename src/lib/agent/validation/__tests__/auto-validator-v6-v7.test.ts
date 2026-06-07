import { validateV6, validateV7, runShadowChecks } from "../auto-validator";
import type { ValidationContext, ToolResultLike } from "../auto-validator";

function ctx(toolResults: ToolResultLike[]): ValidationContext {
  return { question: "q", llmResponse: "r", toolResults };
}

describe("validateV6 , total-declarado x linhas-do-envelope", () => {
  it("sinaliza quando a soma das linhas diverge do total declarado", () => {
    const r = validateV6(
      ctx([
        {
          toolName: "fiscal_x",
          dados: {
            _agregado: { total: 1000 },
            linhas: [{ valor: 400 }, { valor: 500 }], // soma 900 != 1000
          },
        },
      ]),
    );
    expect(r).not.toBeNull();
    expect(r?.reason).toBe("V6");
  });

  it("nao sinaliza quando soma das linhas bate com o total (tolerancia)", () => {
    const r = validateV6(
      ctx([
        {
          toolName: "fiscal_x",
          dados: { _agregado: { total: 900 }, linhas: [{ valor: 400 }, { valor: 500 }] },
        },
      ]),
    );
    expect(r).toBeNull();
  });

  it("nao verificavel (null) quando nao ha total declarado", () => {
    const r = validateV6(ctx([{ toolName: "x", dados: { linhas: [{ valor: 1 }] } }]));
    expect(r).toBeNull();
  });

  it("nao verificavel quando linhas nao tem campo de valor conhecido", () => {
    const r = validateV6(
      ctx([{ toolName: "x", dados: { _agregado: { total: 10 }, linhas: [{ nome: "a" }] } }]),
    );
    expect(r).toBeNull();
  });
});

describe("validateV7 , anti-JOIN-duplicado", () => {
  it("sinaliza quando ha muitas linhas identicas duplicadas", () => {
    const dup = { produtoId: 1, valor: 10 };
    const r = validateV7(
      ctx([{ toolName: "x", dados: { linhas: [dup, dup, dup, dup, { produtoId: 2, valor: 5 }] } }]),
    );
    expect(r).not.toBeNull();
    expect(r?.reason).toBe("V7");
  });

  it("nao sinaliza quando as linhas sao distintas", () => {
    const r = validateV7(
      ctx([
        {
          toolName: "x",
          dados: { linhas: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] },
        },
      ]),
    );
    expect(r).toBeNull();
  });

  it("nao verificavel com poucas linhas", () => {
    const r = validateV7(ctx([{ toolName: "x", dados: { linhas: [{ id: 1 }] } }]));
    expect(r).toBeNull();
  });
});

describe("runShadowChecks", () => {
  it("coleta V6 e V7 que dispararam (sem short-circuit)", () => {
    const dup = { valor: 10 };
    const outcomes = runShadowChecks(
      ctx([
        { toolName: "a", dados: { _agregado: { total: 1 }, linhas: [{ valor: 9 }] } }, // V6
        { toolName: "b", dados: { linhas: [dup, dup, dup, dup, { valor: 1 }] } }, // V7
      ]),
    );
    const reasons = outcomes.map((o) => o.reason).sort();
    expect(reasons).toEqual(["V6", "V7"]);
  });

  it("retorna vazio quando nada dispara", () => {
    const outcomes = runShadowChecks(ctx([{ toolName: "a", dados: { linhas: [{ id: 1 }] } }]));
    expect(outcomes).toEqual([]);
  });
});
