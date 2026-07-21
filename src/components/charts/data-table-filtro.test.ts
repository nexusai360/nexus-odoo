// Testes puros do controle de filtro avançado do DataTable (Fase 4).
import { contarCondicoes } from "./data-table-filtro";
import { grupoVazio, type Grupo } from "@/lib/reports/filtro-avancado";

describe("contarCondicoes", () => {
  it("grupo vazio conta 0", () => {
    expect(contarCondicoes(grupoVazio())).toBe(0);
  });

  it("ignora folha sem campo e conta condições + subgrupos + lista", () => {
    const g: Grupo = {
      conector: "E",
      itens: [
        { campo: "uf", operador: "esta_em_lista", valor: "SP" },
        { campo: "", operador: "igual", valor: "" }, // em branco, não conta
        {
          conector: "OU",
          itens: [{ campo: "marca", operador: "contem", valor: "x" }],
        },
      ],
    };
    expect(contarCondicoes(g)).toBe(2);
  });

  it("conta condições aninhadas em profundidade", () => {
    const g: Grupo = {
      conector: "OU",
      itens: [
        { campo: "a", operador: "igual", valor: "1" },
        {
          conector: "E",
          itens: [
            { campo: "b", operador: "igual", valor: "2" },
            {
              conector: "OU",
              itens: [{ campo: "c", operador: "maior", valor: "3" }],
            },
          ],
        },
      ],
    };
    expect(contarCondicoes(g)).toBe(3);
  });
});
