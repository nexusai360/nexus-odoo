// mcp/lib/recusa.test.ts
import { MENSAGEM_RECUSA_3B, montarRecusa } from "./recusa.js";

describe("recusa 3b", () => {
  it("MENSAGEM_RECUSA_3B é uma string não-vazia", () => {
    expect(typeof MENSAGEM_RECUSA_3B).toBe("string");
    expect(MENSAGEM_RECUSA_3B.length).toBeGreaterThan(0);
  });

  it("montarRecusa() sem assunto retorna a mensagem-padrão", () => {
    const resultado = montarRecusa();
    expect(resultado).toBe(MENSAGEM_RECUSA_3B);
  });

  it("montarRecusa(assunto) interpola o assunto na resposta", () => {
    const resultado = montarRecusa("receita de bolo");
    expect(resultado).toContain("receita de bolo");
    // Deve conter parte do texto padrão também
    expect(resultado.length).toBeGreaterThan(MENSAGEM_RECUSA_3B.length);
  });

  it("montarRecusa(assunto) preserva cordialidade (não nega bruscamente)", () => {
    const resultado = montarRecusa("análise de concorrência");
    // Deve conter alguma forma de esclarecimento
    expect(resultado.toLowerCase()).toMatch(/fora|escopo|especializado|negócio|operação/);
  });
});
