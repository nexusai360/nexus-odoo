import { stripLeakedToolCall } from "./suggestions-extractor";

describe("stripLeakedToolCall", () => {
  it("remove o tool-call cru vazado (caso real do print)", () => {
    const sujo =
      '{"tool":"fiscal_faturamento_periodo","arguments":{"periodoNome":"mes_corrente"}}\n' +
      "Não consegui obter essa informação agora.";
    expect(stripLeakedToolCall(sujo)).toBe("Não consegui obter essa informação agora.");
  });

  it("remove quando o JSON vem depois do texto", () => {
    const sujo = 'Deixa eu ver.\n{"tool":"estoque_saldo_produto","arguments":{}}';
    expect(stripLeakedToolCall(sujo)).toBe("Deixa eu ver.");
  });

  it("NAO toca em texto normal nem em valores com chaves", () => {
    const ok = "No mês corrente faturamos R$ 6.026.951,93 em 396 notas.";
    expect(stripLeakedToolCall(ok)).toBe(ok);
    const comChave = "O resultado {foi} bom e o total é R$ 10,00.";
    expect(stripLeakedToolCall(comChave)).toBe(comChave);
  });
});
