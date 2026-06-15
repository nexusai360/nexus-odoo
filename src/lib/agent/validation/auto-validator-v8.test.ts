// TDD , V8 "enquadramento de lista" (Fase B.6 do Nex Especialista).
//
// Caso forense #1 do laudo 2026-06-11: o agente rotulou de "10 maiores" uma
// lista em ordem arbitraria. O V8 e a defesa pos-resposta: se a resposta
// alega "maiores/top", o tool result precisa SUSTENTAR o enquadramento
// (topMaiores presente, OU ordenadoPor de valor desc). Sem sustentacao, retry.

import { describe, it, expect } from "@jest/globals";
import { validateV8, validateResponse } from "./auto-validator";
import type { ValidationContext } from "./auto-validator";

function ctxCom(
  resposta: string,
  dados: Record<string, unknown>,
): ValidationContext {
  return {
    question: "quais os 10 maiores titulos vencidos?",
    llmResponse: resposta,
    toolResults: [{ toolName: "financeiro_titulos_vencidos", dados } as never],
  };
}

describe("V8 , enquadramento de lista (maiores/top)", () => {
  it("dispara quando a resposta alega 'maiores' sem topMaiores nem ordenadoPor de valor", () => {
    const r = validateV8(
      ctxCom("Os 10 maiores vencidos sao: A (R$ 5.701), B (R$ 3.999)...", {
        titulos: [{ vrSaldo: 5701 }, { vrSaldo: 3999 }],
        // sem ordenadoPor, sem topMaiores , lista arbitraria
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.reason).toBe("V8");
    expect(r!.hint).toMatch(/topMaiores|ordenad/i);
  });

  it("NAO dispara quando o envelope tem topMaiores", () => {
    const r = validateV8(
      ctxCom("Os 10 maiores vencidos sao: Johnson (R$ 1.150.926)...", {
        titulos: [{ vrSaldo: 1150926 }],
        topMaiores: [{ nome: "Johnson", valor: 1150926 }],
      }),
    );
    expect(r).toBeNull();
  });

  it("NAO dispara quando ordenadoPor declara valor desc", () => {
    const r = validateV8(
      ctxCom("Os maiores titulos: Johnson (R$ 1.150.926)...", {
        titulos: [{ vrSaldo: 1150926 }],
        ordenadoPor: "valor desc",
      }),
    );
    expect(r).toBeNull();
  });

  it("NAO dispara quando a resposta nao alega maiores/top", () => {
    const r = validateV8(
      ctxCom("Total vencido: R$ 187 mi em 2.678 titulos.", {
        titulos: [{ vrSaldo: 1 }],
      }),
    );
    expect(r).toBeNull();
  });

  it("NAO dispara sem tool results com lista", () => {
    const r = validateV8({
      question: "oi",
      llmResponse: "Os 10 maiores sao...",
      toolResults: [],
    });
    expect(r).toBeNull();
  });

  it("integra no validateResponse (flag default ligada)", () => {
    const out = validateResponse(
      ctxCom("Os 10 maiores: A (R$ 100)...", { titulos: [{ vrSaldo: 100 }] }),
    );
    expect(out.ok).toBe(false);
    expect(out.reason).toBe("V8");
  });

  it("flag v8Enabled=false desliga", () => {
    const out = validateResponse(
      ctxCom("Os 10 maiores: A (R$ 100)...", { titulos: [{ vrSaldo: 100 }] }),
      { v8Enabled: false },
    );
    // pode falhar por outro validador? Este caso nao tem _RESPOSTA, V5 nao
    // dispara; V2 pode disparar por numero. Garantimos apenas que nao e V8.
    expect(out.reason).not.toBe("V8");
  });
});
