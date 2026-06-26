import { builderProgressLabel } from "./builder-progress-labels";

describe("builderProgressLabel", () => {
  it("traduz as tools mutadoras em frases de acao", () => {
    expect(builderProgressLabel("criar_relatorio")).toBe("Criando o relatorio");
    expect(builderProgressLabel("adicionar_secao")).toBe("Adicionando uma secao");
    expect(builderProgressLabel("validar")).toBe("Validando o relatorio");
  });

  it("traduz as tools de leitura", () => {
    expect(builderProgressLabel("listar_fontes")).toBe("Vendo as fontes de dado");
    expect(builderProgressLabel("prever_dado")).toBe("Conferindo o formato do dado");
  });

  it("usa fallback neutro para tool desconhecida (nunca o id cru)", () => {
    expect(builderProgressLabel("tool_que_nao_existe")).toBe("Montando o relatorio");
  });
});
