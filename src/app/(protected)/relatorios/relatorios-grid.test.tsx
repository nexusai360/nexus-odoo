/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Boxes } from "lucide-react";
import { RelatoriosGrid } from "./relatorios-grid";
import type { ReportEntry } from "@/lib/reports/types";

const r1: ReportEntry = {
  id: "saldo-produto", titulo: "Saldo por produto", dominio: "estoque",
  descricao: "Saldo.", icone: Boxes, modeloFonte: "estoque.saldo.hoje", secoes: [],
};

describe("RelatoriosGrid", () => {
  it("renderiza os cards agrupados por domínio", () => {
    render(<RelatoriosGrid reports={[r1]} />);
    expect(screen.getByText("Saldo por produto")).toBeInTheDocument();
    expect(screen.getAllByText("Estoque").length).toBeGreaterThan(0);
  });
  it("renderiza o estado vazio quando não há relatórios", () => {
    render(<RelatoriosGrid reports={[]} />);
    expect(screen.getByText(/nenhum relatório disponível/i)).toBeInTheDocument();
  });
});
