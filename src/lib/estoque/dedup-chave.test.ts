import { dedupPorChave } from "./dedup-chave";

const item = (id: number, chave: string, ...valores: (string | null)[]) => ({
  id,
  linha: { chave, valores },
});

describe("dedupPorChave", () => {
  it("colapsa linhas identicas (mesma chave, mesmo valor) numa so, sem conflito", () => {
    // O par real 15049: odoo_id 22675 e 26299, ambos '21900.0000'.
    const r = dedupPorChave([
      item(22675, "1:15049:0", "21900.0000"),
      item(26299, "1:15049:0", "21900.0000"),
    ]);
    expect(r.linhas).toEqual([{ chave: "1:15049:0", valores: ["21900.0000"] }]);
    expect(r.conflitos).toEqual([]);
  });

  it("no conflito de valor mantem o menor id e registra a chave", () => {
    const r = dedupPorChave([
      item(26299, "1:15049:0", "22000.0000"),
      item(22675, "1:15049:0", "21900.0000"),
    ]);
    expect(r.linhas).toEqual([{ chave: "1:15049:0", valores: ["21900.0000"] }]);
    expect(r.conflitos).toEqual(["1:15049:0"]);
  });

  it("passa reto quando nao ha duplicata", () => {
    const r = dedupPorChave([
      item(1, "3:100:0", "500.0000"),
      item(2, "3:200:0", "800.0000"),
    ]);
    expect(r.linhas).toHaveLength(2);
    expect(r.conflitos).toEqual([]);
  });
});
