import { executarTool } from "./index";
import { despachar } from "../agent/tool-bridge";
import { journeyStateInicial } from "../journey/state";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("tools de jornada (executarTool)", () => {
  it("atualizar_entendimento grava o texto e marca dimensoes", () => {
    const r = executarTool("atualizar_entendimento", { texto: "entendi que voce quer estoque por marca", dimensoes: ["dados"] }, null, journeyStateInicial());
    expect(r.tipo).toBe("jornada");
    if (r.tipo === "jornada") {
      expect(r.journeyState.entendimento).toContain("estoque por marca");
      expect(r.journeyState.dimensoesTocadas.dados).toBe(true);
    }
  });

  it("oferecer_opcoes descarta tipoVisual invalido", () => {
    const r = executarTool("oferecer_opcoes", { titulo: "Como visualizar?", opcoes: [
      { id: "a", rotulo: "Barras", tipoVisual: "BarChart" },
      { id: "b", rotulo: "Holograma", tipoVisual: "Holo3D" },
    ] }, null, journeyStateInicial());
    expect(r.tipo).toBe("opcoes");
    if (r.tipo === "opcoes") {
      expect(r.opcoes.find((o) => o.id === "a")?.tipoVisual).toBe("BarChart");
      expect(r.opcoes.find((o) => o.id === "b")?.tipoVisual).toBeUndefined();
    }
  });


  it("registrar_seccao_pretendida anexa secao viavel a intencao", () => {
    const r = executarTool(
      "registrar_seccao_pretendida",
      { fato: "fato_estoque_saldo", template: "BarChart", recorte: "por armazem" },
      null,
      journeyStateInicial(),
    );
    expect(r.tipo).toBe("jornada");
    if (r.tipo === "jornada") expect(r.journeyState.intencao.secoes).toHaveLength(1);
  });

  it("registrar_seccao_pretendida recusa secao inviavel (fora do catalogo)", () => {
    const r = executarTool(
      "registrar_seccao_pretendida",
      { fato: "fato_vendas", template: "BarChart" },
      null,
      journeyStateInicial(),
    );
    expect(r.tipo).toBe("erro");
  });

  it("marcar_dimensao_relevante cresce o roteiro", () => {
    const r = executarTool("marcar_dimensao_relevante", { dimensao: "filtros", motivo: "tem recorte por marca" }, null, journeyStateInicial());
    expect(r.tipo).toBe("jornada");
    if (r.tipo === "jornada") expect(r.journeyState.dimensoesRelevantes).toContain("filtros");
  });

  it("declarar_sem_kpi marca a flag na intencao", () => {
    const r = executarTool("declarar_sem_kpi", {}, null, journeyStateInicial());
    expect(r.tipo).toBe("jornada");
    if (r.tipo === "jornada") expect(r.journeyState.intencao.semKpiDeclarado).toBe(true);
  });

  it("despachar repassa o journeyState e roteia para a tool de jornada", () => {
    const r = despachar(
      { id: "1", name: "marcar_dimensao_relevante", arguments: { dimensao: "filtros", motivo: "ok" } },
      null,
      journeyStateInicial(),
    );
    expect(r.tipo).toBe("jornada");
  });
});
