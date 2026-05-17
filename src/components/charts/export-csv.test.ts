import { gerarCsv } from "./export-csv";
import type { ColumnDef } from "./data-table";

interface Row extends Record<string, unknown> {
  nome: string;
  valor: number;
}

const cols: ColumnDef<Row>[] = [
  { key: "nome", header: "Produto", tipo: "texto" },
  { key: "valor", header: "Saldo", tipo: "numero" },
];

const rows: Row[] = [
  { nome: "Esteira", valor: 5 },
  { nome: "Anilha", valor: -2 },
];

describe("gerarCsv", () => {
  it("inicia com BOM UTF-8", () => {
    const csv = gerarCsv(cols, rows);
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("primeira linha é o cabeçalho com separador ponto-e-vírgula", () => {
    const csv = gerarCsv(cols, rows);
    const lines = csv.replace(/^﻿/, "").split("\n");
    expect(lines[0]).toBe("Produto;Saldo");
  });

  it("linhas de dados usam separador ponto-e-vírgula", () => {
    const csv = gerarCsv(cols, rows);
    const lines = csv.replace(/^﻿/, "").split("\n");
    expect(lines[1]).toBe("Esteira;5");
    expect(lines[2]).toBe("Anilha;-2");
  });

  it("total de linhas = 1 cabeçalho + N dados", () => {
    const csv = gerarCsv(cols, rows);
    const lines = csv.replace(/^﻿/, "").split("\n");
    expect(lines).toHaveLength(3);
  });

  it("valor com aspas duplas é escapado por duplicação", () => {
    const r: Row[] = [{ nome: 'Di"amond', valor: 1 }];
    const csv = gerarCsv(cols, r);
    expect(csv).toContain('"Di""amond"');
  });

  it("valor com ponto-e-vírgula é envolvido em aspas", () => {
    const r: Row[] = [{ nome: "Abc;Def", valor: 1 }];
    const csv = gerarCsv(cols, r);
    expect(csv).toContain('"Abc;Def"');
  });

  it("array vazio gera apenas o cabeçalho", () => {
    const csv = gerarCsv(cols, []);
    const lines = csv.replace(/^﻿/, "").split("\n");
    expect(lines).toHaveLength(2); // cabeçalho + linha vazia do join
    expect(lines[0]).toBe("Produto;Saldo");
  });

  it("valores nulos viram string vazia", () => {
    const r = [{ nome: null, valor: null }] as unknown as Row[];
    const csv = gerarCsv(cols, r);
    const lines = csv.replace(/^﻿/, "").split("\n");
    expect(lines[1]).toBe(";");
  });
});
