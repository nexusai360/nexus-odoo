/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReportView } from "./report-view";
import type { ReportEntry } from "@/lib/reports/types";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/relatorios/saldo-produto",
  useSearchParams: () => new URLSearchParams(""),
}));

const entry: ReportEntry = {
  id: "saldo-produto", titulo: "Saldo", dominio: "estoque", descricao: "",
  icone: "Boxes", modeloFonte: "estoque.saldo.hoje",
  secoes: [{
    id: "tabela", template: "DataTable", fato: "fato_estoque_saldo",
    config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
    filtros: [],
  }],
};

describe("ReportView", () => {
  it("renderiza o indicador de freshness", () => {
    render(
      <ReportView
        report={entry}
        secoes={[{ secao: entry.secoes[0], estado: "ok", dados: [{ produtoNome: "X" }] }]}
        freshness={new Date("2026-05-16T09:00:00Z")}
        options={{ produtos: [], armazens: [], familias: [] }}
      />,
    );
    expect(screen.getByText(/atualizado em/i)).toBeInTheDocument();
  });
  it("renderiza cada seção com seu estado", () => {
    render(
      <ReportView
        report={entry}
        secoes={[{ secao: entry.secoes[0], estado: "preparando", dados: [] }]}
        freshness={null}
        options={{ produtos: [], armazens: [], familias: [] }}
      />,
    );
    expect(screen.getAllByText(/ainda sendo preparado/i).length).toBeGreaterThan(0);
  });

  it("discrimina seções multi-fato (R6) pelo id da seção (IM-05)", () => {
    const r6: ReportEntry = {
      id: "concentracao", titulo: "Concentração", dominio: "estoque",
      descricao: "", icone: "Boxes", modeloFonte: "estoque.saldo.hoje",
      secoes: [
        {
          id: "familia", template: "PieChart", fato: "fato_estoque_saldo",
          config: { nameKey: "rotulo", valueKey: "valor", formato: "moeda" },
          filtros: [],
        },
        {
          id: "marca", template: "BarChart", fato: "fato_estoque_saldo",
          config: { xKey: "rotulo", yKey: "valor", formato: "moeda" },
          filtros: [],
        },
      ],
    };
    // Mesmo objeto multi-fato para as duas seções; cada uma deve pegar a
    // sua fatia pelo id (familia/marca), não por inspeção de chave.
    const dados = {
      familia: [{ rotulo: "Esteiras", valor: 100 }],
      marca: [{ rotulo: "Matrix", valor: 90 }],
    };
    const { container } = render(
      <ReportView
        report={r6}
        secoes={[
          { secao: r6.secoes[0], estado: "ok", dados },
          { secao: r6.secoes[1], estado: "ok", dados },
        ]}
        freshness={null}
        options={{ produtos: [], armazens: [], familias: [] }}
      />,
    );
    expect(container.querySelector('[data-slot="pie-chart"]')).toBeInTheDocument();
  });
});
