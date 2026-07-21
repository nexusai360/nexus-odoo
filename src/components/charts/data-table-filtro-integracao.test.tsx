/**
 * @jest-environment jsdom
 *
 * Integração do filtro avançado E/OU no pipeline do DataTable (Fase 4).
 *
 * O Popover do base-ui não posiciona no jsdom (useAnchorPositioning quebra ao
 * abrir). Aqui mockamos o Popover para renderizar o conteúdo inline, exercendo
 * o fluxo real: abrir o builder, adicionar uma condição e verificar que o
 * pipeline recorta as linhas da tabela. Contamos linhas de dados (não texto)
 * para não confundir com valores exibidos em outros popovers abertos pelo mock.
 */
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ReactNode, ReactElement } from "react";

// Popover inline (sem posicionamento). PopoverTrigger recebe `render` (padrão
// base-ui): renderiza o elemento passado. PopoverContent sempre visível.
jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ render }: { render?: ReactElement }) => render ?? null,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Evita URL.createObjectURL no jsdom.
jest.mock("./export-csv", () => {
  const actual = jest.requireActual("./export-csv");
  return { ...actual, downloadCsv: jest.fn() };
});

import { DataTable, type ColumnDef } from "./data-table";

interface RowUf extends Record<string, unknown> {
  uf: string;
  valor: number;
}
const colsUf: ColumnDef<RowUf>[] = [
  { key: "uf", header: "UF", tipo: "texto" },
  { key: "valor", header: "Valor", tipo: "moeda" },
];
const rowsUf: RowUf[] = [
  { uf: "SP", valor: 100 },
  { uf: "RJ", valor: 200 },
  { uf: "SP", valor: 300 },
  { uf: "ES", valor: 50 },
];

/** Nº de linhas de DADOS (linhas com célula <td>, exclui o cabeçalho). */
function contarLinhasDados(): number {
  return screen
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("cell").length > 0).length;
}

describe("DataTable filtro avançado , integração no pipeline", () => {
  it("sem a prop, não há botão Filtros (não-regressão)", () => {
    // Popover mockado deixa conteúdo inline, mas o botão só existe se a prop liga.
    render(<DataTable columns={colsUf} rows={rowsUf} />);
    expect(
      screen.queryByRole("button", { name: /Filtro personalizado/i }),
    ).not.toBeInTheDocument();
  });

  it("uma condição 'uf igual SP' recorta de 4 para 2 linhas", () => {
    render(<DataTable columns={colsUf} rows={rowsUf} filtroAvancado />);
    expect(contarLinhasDados()).toBe(4);

    fireEvent.click(screen.getByRole("button", { name: "Condição" }));
    // campo default = uf (1ª coluna visível), operador default = igual
    fireEvent.change(screen.getByLabelText("Valor da condição"), {
      target: { value: "SP" },
    });

    expect(contarLinhasDados()).toBe(2);
  });

  it("Limpar restaura todas as linhas (reset do pipeline)", () => {
    render(<DataTable columns={colsUf} rows={rowsUf} filtroAvancado />);
    fireEvent.click(screen.getByRole("button", { name: "Condição" }));
    fireEvent.change(screen.getByLabelText("Valor da condição"), {
      target: { value: "SP" },
    });
    expect(contarLinhasDados()).toBe(2);

    fireEvent.click(
      screen.getByRole("button", { name: "Limpar filtro personalizado" }),
    );
    expect(contarLinhasDados()).toBe(4);
  });
});
