import { executarTool } from "./index";
import { despachar } from "../agent/tool-bridge";
import { journeyStateInicial, type JourneyState } from "../journey/state";
import type { BuilderReportEntry } from "../types";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

/* eslint-disable @typescript-eslint/no-explicit-any */
function fichaElegivel(): BuilderReportEntry {
  return {
    id: "r", titulo: "t", dominio: "estoque", schemaVersion: 1, tipo: "tela_cheia", parametros: [],
    secoes: [
      { id: "k", template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: {}, filtros: [] },
      { id: "d", template: "DataTable", fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: {}, filtros: [] },
    ],
  } as any;
}
function stateElegivel(): JourneyState {
  const s = journeyStateInicial();
  s.turnosUsuario = 2;
  s.entendimento = "voce quer ver o saldo de estoque com indicadores e tabela";
  // Evidencia objetiva do gate = intencao estruturada (nao mais a ficha).
  s.intencao = {
    secoes: [
      { fato: "fato_estoque_saldo", template: "KPIRow" },
      { fato: "fato_estoque_saldo", template: "DataTable" },
    ],
  };
  // fichaRascunho ainda alimenta os ITENS do montar_resumo (removido na Task 17).
  s.fichaRascunho = fichaElegivel();
  return s;
}

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

  it("oferecer_geracao recusa sem evidencia", () => {
    const r = executarTool("oferecer_geracao", { motivo: "acho que da" }, null, journeyStateInicial());
    expect(r.tipo).toBe("erro");
    if (r.tipo === "erro") expect(r.erro).toContain("ainda_sem_evidencia");
  });

  it("oferecer_geracao aceita com evidencia -> fase resumo", () => {
    const r = executarTool("oferecer_geracao", { motivo: "entendi o suficiente" }, null, stateElegivel());
    expect(r.tipo).toBe("jornada");
    if (r.tipo === "jornada") expect(r.journeyState.fase).toBe("resumo");
  });

  it("montar_resumo so com evidencia, monta itens", () => {
    const ruim = executarTool("montar_resumo", {}, null, journeyStateInicial());
    expect(ruim.tipo).toBe("erro");
    const bom = executarTool("montar_resumo", {}, null, stateElegivel());
    expect(bom.tipo).toBe("jornada");
    if (bom.tipo === "jornada") expect((bom.journeyState.resumo?.itens.length ?? 0)).toBeGreaterThan(0);
  });

  it("despachar repassa o journeyState e roteia para a tool de jornada", () => {
    const r = despachar(
      { id: "1", name: "oferecer_geracao", arguments: { motivo: "ok" } } as any,
      null,
      stateElegivel(),
    );
    expect(r.tipo).toBe("jornada");
  });
});
