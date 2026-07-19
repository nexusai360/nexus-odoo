import { describe, it, expect } from "@jest/globals";
import { precosQueMudaram, type PrecoAtual, type UltimoPreco } from "./historico-preco";

const p = (tabelaId: number, produtoId: number, valor: number): PrecoAtual => ({ tabelaId, produtoId, valor });
const u = (tabelaId: number, produtoId: number, valor: number): UltimoPreco => ({ tabelaId, produtoId, valor });

describe("precosQueMudaram (append-por-mudanca)", () => {
  it("grava os NOVOS (nunca registrados)", () => {
    const r = precosQueMudaram([p(3, 100, 500), p(3, 200, 800)], []);
    expect(r).toHaveLength(2);
  });

  it("NAO regrava o que nao mudou (mesmo valor)", () => {
    const r = precosQueMudaram([p(3, 100, 500)], [u(3, 100, 500)]);
    expect(r).toEqual([]);
  });

  it("grava so o que MUDOU de valor", () => {
    const r = precosQueMudaram(
      [p(3, 100, 550), p(3, 200, 800)], // 100 mudou 500->550; 200 igual
      [u(3, 100, 500), u(3, 200, 800)],
    );
    expect(r).toEqual([p(3, 100, 550)]);
  });

  it("mesma dupla produto em tabelas diferentes sao chaves distintas", () => {
    const r = precosQueMudaram(
      [p(3, 100, 500), p(5, 100, 500)], // tab 3 igual, tab 5 novo
      [u(3, 100, 500)],
    );
    expect(r).toEqual([p(5, 100, 500)]);
  });

  it("ignora variacao abaixo de 1 centavo (ruido de arredondamento)", () => {
    const r = precosQueMudaram([p(3, 100, 500.004)], [u(3, 100, 500)]);
    expect(r).toEqual([]);
    const r2 = precosQueMudaram([p(3, 100, 500.02)], [u(3, 100, 500)]);
    expect(r2).toHaveLength(1);
  });

  it("lista atual vazia devolve vazio", () => {
    expect(precosQueMudaram([], [u(3, 100, 500)])).toEqual([]);
  });
});
