import { normalizarNomeEmpresa } from "./nome-empresa";

// Os nomes abaixo sao os que estao mesmo no banco de PRODUCAO (conferidos em 2026-07-14).
describe("normalizarNomeEmpresa , a sigla do grupo e marca, nao palavra comum", () => {
  it.each([
    ["Jht DF Comércio - Matriz DF", "JHT DF Comércio - Matriz DF"],
    ["Jht SP Comércio - Filial BA", "JHT SP Comércio - Filial BA"],
    ["Jds Comércio - Filial SE", "JDS Comércio - Filial SE"],
    ["Cs Comércio - Matriz DF", "CS Comércio - Matriz DF"],
    ["Jmf Comércio - Matriz DF", "JMF Comércio - Matriz DF"],
    ["Jib DF Comércio - Matriz DF", "JIB DF Comércio - Matriz DF"],
    ["Ks Comércio - Matriz DF", "KS Comércio - Matriz DF"],
  ])("%s => %s", (entrada, esperado) => {
    expect(normalizarNomeEmpresa(entrada)).toBe(esperado);
  });

  it("IJHT nao pode ser comido pelo JHT (a sigla mais longa vem primeiro)", () => {
    expect(normalizarNomeEmpresa("Ijht Premium Car - Matriz DF")).toBe(
      "IJHT Premium Car - Matriz DF",
    );
  });

  it("o que ja esta certo continua certo (o Odoo mistura os dois no mesmo cadastro)", () => {
    expect(normalizarNomeEmpresa("JHT Brasília - Matriz DF")).toBe("JHT Brasília - Matriz DF");
  });

  it("nao mexe no resto do nome", () => {
    expect(normalizarNomeEmpresa("Jht DF Comércio")).toBe("JHT DF Comércio");
    expect(normalizarNomeEmpresa("Premium Car")).toBe("Premium Car");
  });
});
