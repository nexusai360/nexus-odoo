// src/components/agent/__tests__/gfm-table.test.ts
import { tryParseTable } from "../gfm-table";

describe("tryParseTable , parser de tabela GFM", () => {
  it("parseia tabela simples e infere alinhamento numerico a direita", () => {
    const lines = [
      "| Etapa | Pedidos | Valor |",
      "|-------|---------|-------|",
      "| GERA BOLETO | 135 | R$ 19.9M |",
      "| Fracionar | 69 | R$ 17.2M |",
    ];
    const r = tryParseTable(lines, 0);
    expect(r).not.toBeNull();
    expect(r!.block.type).toBe("table");
    expect(r!.block.header).toEqual(["Etapa", "Pedidos", "Valor"]);
    expect(r!.block.rows).toHaveLength(2);
    expect(r!.block.rows[0]).toEqual(["GERA BOLETO", "135", "R$ 19.9M"]);
    // col 0 texto = left; col 1 e 2 numericas = right
    expect(r!.block.align).toEqual(["left", "right", "right"]);
    expect(r!.next).toBe(4);
  });

  it("respeita alinhamento explicito do separador (:--- ---: :---:)", () => {
    const lines = [
      "| A | B | C |",
      "|:---|---:|:---:|",
      "| x | y | z |",
    ];
    const r = tryParseTable(lines, 0);
    expect(r!.block.align).toEqual(["left", "right", "center"]);
  });

  it("tolera ausencia de pipes de borda", () => {
    const lines = ["A | B", "---|---", "1 | 2"];
    const r = tryParseTable(lines, 0);
    expect(r!.block.header).toEqual(["A", "B"]);
    expect(r!.block.rows[0]).toEqual(["1", "2"]);
  });

  it("para de consumir na primeira linha nao-tabela", () => {
    const lines = ["| A | B |", "|---|---|", "| 1 | 2 |", "", "texto depois"];
    const r = tryParseTable(lines, 0);
    expect(r!.block.rows).toHaveLength(1);
    expect(r!.next).toBe(3);
  });

  it("retorna null quando nao ha separador valido", () => {
    expect(tryParseTable(["| A | B |", "| 1 | 2 |"], 0)).toBeNull();
    expect(tryParseTable(["texto normal", "outra linha"], 0)).toBeNull();
  });

  it("normaliza numero de colunas das linhas ao header", () => {
    const lines = ["| A | B | C |", "|---|---|---|", "| 1 | 2 |"];
    const r = tryParseTable(lines, 0);
    expect(r!.block.rows[0]).toEqual(["1", "2", ""]);
  });
});
