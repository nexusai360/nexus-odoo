import {
  builderProgressLabel,
  rotulosDeduplicados,
  colapsarProgressSteps,
} from "./builder-progress-labels";

describe("builderProgressLabel", () => {
  it("traduz as tools mutadoras em frases de acao", () => {
    expect(builderProgressLabel("criar_relatorio")).toBe("Criando o relatório");
    expect(builderProgressLabel("adicionar_secao")).toBe("Adicionando uma seção");
    expect(builderProgressLabel("validar")).toBe("Validando o relatório");
  });

  it("traduz as tools de leitura", () => {
    expect(builderProgressLabel("listar_fontes")).toBe("Vendo as fontes de dado");
    expect(builderProgressLabel("prever_dado")).toBe("Conferindo o formato do dado");
  });

  it("usa fallback neutro para tool desconhecida (nunca o id cru)", () => {
    expect(builderProgressLabel("tool_que_nao_existe")).toBe("Montando o relatório");
  });
});

describe("rotulosDeduplicados", () => {
  it("colapsa acoes repetidas em sequencia para o plural", () => {
    const out = rotulosDeduplicados([
      "adicionar_secao",
      "adicionar_secao",
      "adicionar_secao",
    ]);
    expect(out).toEqual([{ label: "Adicionando seções" }]);
  });

  it("mantem singular quando a acao aparece so uma vez", () => {
    expect(rotulosDeduplicados(["adicionar_secao"])).toEqual([
      { label: "Adicionando uma seção" },
    ]);
  });

  it("nao funde acoes diferentes nem repeticoes nao adjacentes", () => {
    const out = rotulosDeduplicados([
      "adicionar_secao",
      "definir_titulo",
      "adicionar_secao",
    ]);
    expect(out).toEqual([
      { label: "Adicionando uma seção" },
      { label: "Renomeando o relatório" },
      { label: "Adicionando uma seção" },
    ]);
  });
});

describe("colapsarProgressSteps", () => {
  it("funde steps consecutivos da mesma tool, pluralizando e somando o estado", () => {
    const out = colapsarProgressSteps([
      { id: "a", label: "Adicionando uma seção", state: "done", raw: true, toolName: "adicionar_secao" },
      { id: "b", label: "Adicionando uma seção", state: "done", raw: true, toolName: "adicionar_secao" },
      { id: "c", label: "Adicionando uma seção", state: "running", raw: true, toolName: "adicionar_secao" },
    ]);
    expect(out).toEqual([
      { id: "a", label: "Adicionando seções", state: "running", raw: true },
    ]);
  });

  it("preserva steps de tools distintas e a ordem", () => {
    const out = colapsarProgressSteps([
      { id: "a", label: "Criando o relatório", state: "done", raw: true, toolName: "criar_relatorio" },
      { id: "b", label: "Adicionando uma seção", state: "done", raw: true, toolName: "adicionar_secao" },
      { id: "c", label: "Adicionando uma seção", state: "done", raw: true, toolName: "adicionar_secao" },
    ]);
    expect(out).toEqual([
      { id: "a", label: "Criando o relatório", state: "done", raw: true },
      { id: "b", label: "Adicionando seções", state: "done", raw: true },
    ]);
  });

  it("sem toolName, nao funde (cai no comportamento por label)", () => {
    const out = colapsarProgressSteps([
      { id: "a", label: "Passo X", state: "done", raw: true },
      { id: "b", label: "Passo X", state: "done", raw: true },
    ]);
    expect(out).toHaveLength(2);
  });
});
