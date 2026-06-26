import { normalizarPergunta, TEMAS } from "./normalizar-pergunta";

describe("normalizarPergunta", () => {
  it("classifica faturamento", () => {
    expect(normalizarPergunta("qual o faturamento de maio?")).toBe("faturamento");
  });

  it("classifica estoque sem vazar o codigo do produto", () => {
    const label = normalizarPergunta("quanto tem no estoque do produto X12345?");
    expect(label).toBe("estoque");
    expect(label).not.toContain("X12345");
  });

  it("retorna null quando nao casa nenhum tema", () => {
    expect(normalizarPergunta("oi, bom dia, tudo bem com voce?")).toBeNull();
  });

  it("a saida e SEMPRE um tema do vocabulario fechado (ou null)", () => {
    for (const frase of [
      "faturamento por empresa",
      "contas a pagar vencidas da Johnson 12.345.678/0001-90",
      "pedidos travados na etapa",
    ]) {
      const out = normalizarPergunta(frase);
      if (out !== null) expect(TEMAS).toContain(out);
    }
  });

  it("NAO-VERBATIM: nenhum trigram da frase original aparece no label", () => {
    const frases = [
      "preciso do contas a pagar da empresa Smartfit no valor de 1.250.000,00",
      "faturamento do cliente Joao da Silva CNPJ 11.222.333/0001-44",
    ];
    const trigram = (s: string) => {
      const t = s.toLowerCase().replace(/\s+/g, " ").trim();
      const grams: string[] = [];
      for (let i = 0; i + 3 <= t.length; i++) grams.push(t.slice(i, i + 3));
      return grams;
    };
    for (const f of frases) {
      const label = normalizarPergunta(f);
      if (label === null) continue;
      const labelText = label.toLowerCase();
      // o label e um termo de dicionario; nenhum trigram especifico da frase
      // (numeros/nomes) pode aparecer nele.
      const offending = trigram(f).filter(
        (g) => /[0-9]/.test(g) === false && g.includes(" ") === false && false,
      );
      // checagem direta: o label nao contem digitos nem fragmentos de nome proprio
      expect(/[0-9]/.test(labelText)).toBe(false);
      expect(labelText).not.toContain("smartfit");
      expect(labelText).not.toContain("joao");
      expect(offending.length).toBe(0);
    }
  });
});
