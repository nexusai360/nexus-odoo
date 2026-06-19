import { buildDistillInstrucoes, montarDumpUsuario } from "./distill-prompt";

describe("buildDistillInstrucoes", () => {
  it("traz as regras-chave de seguranca", () => {
    const i = buildDistillInstrucoes();
    expect(i).toMatch(/sem nomes próprios|CNPJ/i);
    expect(i.toLowerCase()).toContain("ocultar");
    expect(i).toContain("JSON");
    expect(i).toContain("breakdownPreferido");
  });
});

describe("montarDumpUsuario", () => {
  it("monta o shape e limita o tamanho", () => {
    const conversas = Array.from({ length: 80 }, (_, i) => ({ pergunta: `p${i}`, resposta: `r${i}` }));
    const d = montarDumpUsuario({ userId: "u1", conversas, avaliacoes: [] });
    expect(d.userId).toBe("u1");
    expect(d.conversas.length).toBe(50); // cap
    expect(d.avaliacoes).toEqual([]);
  });
});
