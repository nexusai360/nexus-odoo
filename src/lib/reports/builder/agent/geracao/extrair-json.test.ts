import { extrairJson } from "./extrair-json";

describe("extrairJson", () => {
  it("aceita objeto direto", () => {
    expect(extrairJson({ a: 1 })).toEqual({ a: 1 });
  });

  it("parseia JSON puro em string", () => {
    expect(extrairJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("tira a cerca ```json ... ``` (caso comum do LLM)", () => {
    const raw = "```json\n{\"titulo\":\"X\",\"secoes\":[]}\n```";
    expect(extrairJson(raw)).toEqual({ titulo: "X", secoes: [] });
  });

  it("tira a cerca ``` sem o rotulo json", () => {
    expect(extrairJson("```\n{\"a\":2}\n```")).toEqual({ a: 2 });
  });

  it("recorta JSON cercado por prosa", () => {
    expect(extrairJson('Aqui esta o resultado: {"a":3} pronto!')).toEqual({ a: 3 });
  });

  it("lanca quando nao ha JSON", () => {
    expect(() => extrairJson("sem json aqui")).toThrow();
  });
});
