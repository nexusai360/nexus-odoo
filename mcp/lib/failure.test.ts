// mcp/lib/failure.test.ts
import { ZodError, z } from "zod";
import { DomainDeniedError, SqlGuardError, toOutcome, safeErrorMessage } from "./failure.js";

describe("DomainDeniedError", () => {
  it("é instância de Error", () => {
    expect(new DomainDeniedError("msg")).toBeInstanceOf(Error);
    expect(new DomainDeniedError("msg")).toBeInstanceOf(DomainDeniedError);
  });
});

describe("toOutcome", () => {
  it("ZodError → invalid_input", () => {
    let zodError: ZodError;
    try {
      z.string().parse(123);
    } catch (e) {
      zodError = e as ZodError;
    }
    expect(toOutcome(zodError!)).toBe("invalid_input");
  });

  it("DomainDeniedError → denied", () => {
    expect(toOutcome(new DomainDeniedError("sem acesso"))).toBe("denied");
  });

  it("qualquer outra exceção → error", () => {
    expect(toOutcome(new Error("genérico"))).toBe("error");
    expect(toOutcome("string qualquer")).toBe("error");
    expect(toOutcome(null)).toBe("error");
  });
});

describe("SqlGuardError", () => {
  it("é instância de Error", () => {
    expect(new SqlGuardError("multi-statement")).toBeInstanceOf(Error);
    expect(new SqlGuardError("multi-statement")).toBeInstanceOf(SqlGuardError);
  });
});

describe("toOutcome — SqlGuardError", () => {
  it("SqlGuardError → invalid_input", () => {
    expect(toOutcome(new SqlGuardError("multi-statement"))).toBe("invalid_input");
  });

  it("regressão: ZodError ainda → invalid_input", () => {
    let zodError: ZodError;
    try {
      z.string().parse(123);
    } catch (e) {
      zodError = e as ZodError;
    }
    expect(toOutcome(zodError!)).toBe("invalid_input");
  });

  it("regressão: DomainDeniedError ainda → denied", () => {
    expect(toOutcome(new DomainDeniedError("x"))).toBe("denied");
  });

  it("regressão: Error genérico ainda → error", () => {
    expect(toOutcome(new Error("x"))).toBe("error");
  });
});

describe("safeErrorMessage", () => {
  it("retorna mensagem genérica para 'error'", () => {
    const msg = safeErrorMessage("error");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    // Não deve conter stack trace ou detalhes internos
    expect(msg).not.toContain("Error:");
  });

  it("retorna mensagem específica para 'denied'", () => {
    const msg = safeErrorMessage("denied");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });

  it("retorna mensagem específica para 'invalid_input'", () => {
    const msg = safeErrorMessage("invalid_input");
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});
