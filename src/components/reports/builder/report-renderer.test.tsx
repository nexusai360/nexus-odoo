/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ReportRenderer } from "./report-renderer";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

const entry: BuilderReportEntry = {
  id: "draft-1",
  titulo: "Saldo por produto",
  dominio: "estoque",
  schemaVersion: 1,
  tipo: "tela_cheia",
  parametros: [],
  secoes: [
    {
      id: "s1",
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: {
        colunas: [
          { key: "produtoNome", header: "Produto", tipo: "texto" },
          { key: "valorTotal", header: "Valor", tipo: "moeda" },
        ],
      },
      filtros: [],
    },
  ],
};

describe("ReportRenderer", () => {
  it("renderiza a DataTable com as linhas resolvidas", () => {
    const dados: Record<string, SecaoResolvida> = {
      s1: { estado: "ok", dado: [{ produtoNome: "Esteira", valorTotal: 1000 }] },
    };
    render(<ReportRenderer entry={entry} dados={dados} />);
    expect(screen.getByText("Saldo por produto")).toBeInTheDocument();
    expect(screen.getByText("Esteira")).toBeInTheDocument();
  });

  it("mostra aviso quando a secao esta em erro", () => {
    const dados: Record<string, SecaoResolvida> = {
      s1: { estado: "erro", erro: "sem_acesso_dominio" },
    };
    render(<ReportRenderer entry={entry} dados={dados} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
