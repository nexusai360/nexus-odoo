import { construirToolDefs, despachar } from "./tool-bridge";
import { BUILDER_TOOLS } from "../tools";

// read-tools -> source-registry importa @/lib/prisma (client gerado usa import.meta).
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

describe("tool-bridge , construirToolDefs", () => {
  it("converte todas as BUILDER_TOOLS para ToolDefinition (name/description/parameters)", () => {
    const defs = construirToolDefs();
    expect(defs).toHaveLength(BUILDER_TOOLS.length);
    for (const d of defs) {
      expect(typeof d.name).toBe("string");
      expect(typeof d.description).toBe("string");
      expect(typeof d.parameters).toBe("object");
    }
  });

  it("gera JSON Schema com os campos obrigatorios da tool", () => {
    const def = construirToolDefs().find((d) => d.name === "descrever_componente")!;
    const params = def.parameters as { properties?: Record<string, unknown>; required?: string[] };
    expect(params.properties).toHaveProperty("chave");
    expect(params.required).toContain("chave");
  });

  it("modo jornada so oferece as tools de coleta (sem construir ficha)", () => {
    const nomes = construirToolDefs("jornada").map((d) => d.name);
    expect(nomes).toContain("registrar_seccao_pretendida");
    expect(nomes).toContain("atualizar_entendimento");
    expect(nomes).not.toContain("criar_relatorio");
    expect(nomes).not.toContain("adicionar_secao");
  });

  it("modo refino so oferece as tools de construcao da ficha", () => {
    const nomes = construirToolDefs("refino").map((d) => d.name);
    expect(nomes).toContain("adicionar_secao");
    expect(nomes).not.toContain("registrar_seccao_pretendida");
    expect(nomes).not.toContain("oferecer_geracao");
  });
});

describe("tool-bridge , despachar", () => {
  it("despacha uma tool de leitura sem ficha", () => {
    const r = despachar({ id: "1", name: "listar_componentes", arguments: {} }, null);
    expect(r.tipo).toBe("leitura");
  });

  it("recusa args invalidos antes de executar (sem campo obrigatorio)", () => {
    const r = despachar({ id: "2", name: "descrever_componente", arguments: {} }, null);
    expect(r.tipo).toBe("erro");
    if (r.tipo === "erro") expect(r.erro).toMatch(/args_invalidos/);
  });

  it("recusa tool desconhecida", () => {
    const r = despachar({ id: "3", name: "tool_que_nao_existe", arguments: {} }, null);
    expect(r.tipo).toBe("erro");
    if (r.tipo === "erro") expect(r.erro).toBe("tool_desconhecida");
  });

  it("cria a ficha via criar_relatorio com args validos", () => {
    const r = despachar(
      { id: "4", name: "criar_relatorio", arguments: { titulo: "Estoque" } },
      null,
    );
    expect(r.tipo).toBe("ficha");
    if (r.tipo === "ficha") expect(r.ficha.titulo).toBe("Estoque");
  });
});
