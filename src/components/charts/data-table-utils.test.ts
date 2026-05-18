import { sortRows, filterRows, toggleSortStack } from "./data-table-utils";
import type { ColumnDef } from "./data-table";

interface Row extends Record<string, unknown> {
  nome: string;
  valor: number;
}

const cols: ColumnDef<Row>[] = [
  { key: "nome", header: "Nome", tipo: "texto" },
  { key: "valor", header: "Valor", tipo: "numero" },
];

const rows: Row[] = [
  { nome: "Banana", valor: 30 },
  { nome: "Abacaxi", valor: 10 },
  { nome: "Caju", valor: 20 },
];

// ---------------------------------------------------------------------------
// sortRows
// ---------------------------------------------------------------------------
describe("sortRows", () => {
  it("retorna as mesmas linhas quando stack vazia", () => {
    expect(sortRows(rows, [], cols)).toEqual(rows);
  });

  it("ordena textual asc", () => {
    const r = sortRows(rows, [{ key: "nome", dir: "asc" }], cols);
    expect(r.map((x) => x.nome)).toEqual(["Abacaxi", "Banana", "Caju"]);
  });

  it("ordena textual desc", () => {
    const r = sortRows(rows, [{ key: "nome", dir: "desc" }], cols);
    expect(r.map((x) => x.nome)).toEqual(["Caju", "Banana", "Abacaxi"]);
  });

  it("ordena numérico asc", () => {
    const r = sortRows(rows, [{ key: "valor", dir: "asc" }], cols);
    expect(r.map((x) => x.valor)).toEqual([10, 20, 30]);
  });

  it("ordena numérico desc", () => {
    const r = sortRows(rows, [{ key: "valor", dir: "desc" }], cols);
    expect(r.map((x) => x.valor)).toEqual([30, 20, 10]);
  });

  it("multi-sort: nome asc + valor desc como desempate", () => {
    const rowsEmpate: Row[] = [
      { nome: "A", valor: 5 },
      { nome: "A", valor: 2 },
      { nome: "B", valor: 1 },
    ];
    const r = sortRows(
      rowsEmpate,
      [
        { key: "nome", dir: "asc" },
        { key: "valor", dir: "desc" },
      ],
      cols,
    );
    expect(r).toEqual([
      { nome: "A", valor: 5 },
      { nome: "A", valor: 2 },
      { nome: "B", valor: 1 },
    ]);
  });

  it("não muta o array original", () => {
    const original = [...rows];
    sortRows(rows, [{ key: "nome", dir: "asc" }], cols);
    expect(rows).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// filterRows
// ---------------------------------------------------------------------------
describe("filterRows", () => {
  it("query vazia retorna todas as linhas", () => {
    expect(filterRows(rows, "")).toHaveLength(3);
  });

  it("busca em coluna texto (case-insensitive)", () => {
    expect(filterRows(rows, "ban")).toEqual([{ nome: "Banana", valor: 30 }]);
  });

  it("busca em coluna número convertido para string", () => {
    expect(filterRows(rows, "10")).toEqual([{ nome: "Abacaxi", valor: 10 }]);
  });

  it("retorna vazio quando nada casa", () => {
    expect(filterRows(rows, "zzz")).toHaveLength(0);
  });

  it("trimeia whitespace ao redor da query", () => {
    expect(filterRows(rows, "  caj  ")).toEqual([{ nome: "Caju", valor: 20 }]);
  });
});

// ---------------------------------------------------------------------------
// toggleSortStack
// ---------------------------------------------------------------------------
describe("toggleSortStack", () => {
  it("adiciona nova coluna como asc (stack vazia, sem shift)", () => {
    expect(toggleSortStack([], "nome", false)).toEqual([
      { key: "nome", dir: "asc" },
    ]);
  });

  it("cicla asc → desc em clique simples", () => {
    const stack = [{ key: "nome", dir: "asc" as const }];
    expect(toggleSortStack(stack, "nome", false)).toEqual([
      { key: "nome", dir: "desc" },
    ]);
  });

  it("cicla desc → remove em clique simples", () => {
    const stack = [{ key: "nome", dir: "desc" as const }];
    expect(toggleSortStack(stack, "nome", false)).toEqual([]);
  });

  it("clique simples substitui a stack inteira quando há 2 critérios", () => {
    const stack = [
      { key: "nome", dir: "asc" as const },
      { key: "valor", dir: "desc" as const },
    ];
    expect(toggleSortStack(stack, "valor", false)).toEqual([
      { key: "valor", dir: "asc" },
    ]);
  });

  it("shift+clique acumula nova coluna", () => {
    const stack = [{ key: "nome", dir: "asc" as const }];
    expect(toggleSortStack(stack, "valor", true)).toEqual([
      { key: "nome", dir: "asc" },
      { key: "valor", dir: "asc" },
    ]);
  });

  it("shift+clique em coluna já existente cicla asc → desc", () => {
    const stack = [
      { key: "nome", dir: "asc" as const },
      { key: "valor", dir: "asc" as const },
    ];
    expect(toggleSortStack(stack, "valor", true)).toEqual([
      { key: "nome", dir: "asc" },
      { key: "valor", dir: "desc" },
    ]);
  });

  it("shift+clique em coluna desc remove-a da stack", () => {
    const stack = [
      { key: "nome", dir: "asc" as const },
      { key: "valor", dir: "desc" as const },
    ];
    expect(toggleSortStack(stack, "valor", true)).toEqual([
      { key: "nome", dir: "asc" },
    ]);
  });
});
