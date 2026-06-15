import { pickTools } from "../pick-tools";
import type { RetrievalTool } from "../types";

// Vetores 2D simples para cosseno previsivel.
const V = {
  // alinhado com a pergunta [1,0]
  fiscal_faturamento_periodo: [1, 0],
  // ortogonal
  fiscal_notas_emitidas: [0, 1],
  comercial_pedidos_periodo: [0.9, 0.1],
  estoque_saldo: [0, 1],
  registrar_lacuna: [0, 1],
  bi_consulta_avancada: [0, 1],
};
const tools: RetrievalTool[] = Object.keys(V).map((name) => ({ name, description: name }));
const question = [1, 0];

describe("pickTools", () => {
  it("inclui a tool de maior cosseno no top-K", () => {
    const r = pickTools({ tools, toolVectors: V, questionVector: question, pickedDomains: [], k: 1 });
    expect(r.picked).toContain("fiscal_faturamento_periodo");
  });

  it("nucleo: toda tool de pickedDomains entra mesmo com cosseno baixo", () => {
    const r = pickTools({ tools, toolVectors: V, questionVector: question, pickedDomains: ["estoque"], k: 1 });
    expect(r.picked).toContain("estoque_saldo"); // estoque no floor apesar de cosseno 0
  });

  it("floor real: bi_consulta_avancada (_desconhecido) e registrar_lacuna (dominios-vazios) sempre entram", () => {
    const r = pickTools({ tools, toolVectors: V, questionVector: question, pickedDomains: [], k: 1 });
    expect(r.picked).toContain("bi_consulta_avancada"); // via UNKNOWN_DOMAIN
    expect(r.picked).toContain("registrar_lacuna"); // via dominios-vazios (excludeFromFiltering)
  });

  it("K limita so candidatas cross-dominio (nao corta o floor)", () => {
    // pickedDomains vazio: floor = so excludeFromFiltering + _desconhecido. topK=1 entre o resto.
    const r = pickTools({ tools, toolVectors: V, questionVector: question, pickedDomains: [], k: 1 });
    // fiscal_* e comercial_* nao estao no floor; so 1 (o de maior cosseno) entra por topK
    const crossDominio = r.picked.filter((n) => n.startsWith("fiscal_") || n.startsWith("comercial_"));
    expect(crossDominio).toEqual(["fiscal_faturamento_periodo"]);
  });

  it("sem questionVector => fallback retorna todas as tools", () => {
    const r = pickTools({ tools, toolVectors: V, questionVector: null, pickedDomains: [], k: 1 });
    expect(r.picked.sort()).toEqual(tools.map((t) => t.name).sort());
  });
});
