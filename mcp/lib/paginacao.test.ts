import { describe, it, expect } from "@jest/globals";
import {
  resolverPaginacao,
  montarPaginacaoMeta,
  limiteEfetivo,
  PAGINACAO_LIMIT_DEFAULT,
  PAGINACAO_LIMIT_MAX,
} from "./paginacao";

describe("constantes de paginacao (F4 Onda 2)", () => {
  it("default e 50 e max e 50", () => {
    expect(PAGINACAO_LIMIT_DEFAULT).toBe(50);
    expect(PAGINACAO_LIMIT_MAX).toBe(50);
  });
});

describe("limiteEfetivo", () => {
  it("sem pedido nem teto usa o default 50", () => {
    expect(limiteEfetivo()).toBe(50);
  });
  it("min(pedido, teto): teto da tool de linha rica vence", () => {
    expect(limiteEfetivo(50, 20)).toBe(20);
    expect(limiteEfetivo(undefined, 12)).toBe(12);
  });
  it("min(pedido, teto): pedido menor vence", () => {
    expect(limiteEfetivo(5, 50)).toBe(5);
    expect(limiteEfetivo(8, 30)).toBe(8);
  });
  it("clampa acima do max e abaixo de 1", () => {
    expect(limiteEfetivo(999)).toBe(PAGINACAO_LIMIT_MAX);
    expect(limiteEfetivo(0)).toBe(1);
  });
});

describe("resolverPaginacao", () => {
  it("aplica defaults", () => {
    expect(resolverPaginacao({})).toEqual({ limit: PAGINACAO_LIMIT_DEFAULT, offset: 0 });
  });
  it("aplica teto no limit", () => {
    expect(resolverPaginacao({ limit: 999 })).toEqual({ limit: PAGINACAO_LIMIT_MAX, offset: 0 });
  });
  it("preserva valores validos", () => {
    expect(resolverPaginacao({ limit: 5, offset: 20 })).toEqual({ limit: 5, offset: 20 });
  });
  it("normaliza offset negativo para 0", () => {
    expect(resolverPaginacao({ offset: -3 })).toEqual({ limit: PAGINACAO_LIMIT_DEFAULT, offset: 0 });
  });
  it("tetoTool reduz o limite efetivo (linha rica)", () => {
    expect(resolverPaginacao({}, 15)).toEqual({ limit: 15, offset: 0 });
    expect(resolverPaginacao({ limit: 50 }, 15)).toEqual({ limit: 15, offset: 0 });
  });
});

describe("montarPaginacaoMeta", () => {
  it("primeira pagina com mais itens", () => {
    expect(montarPaginacaoMeta(100, 0, 10, 10)).toEqual({
      total: 100,
      mostrando: "1-10 de 100",
      temMais: true,
      proximoOffset: 10,
    });
  });
  it("ultima pagina parcial", () => {
    expect(montarPaginacaoMeta(15, 10, 10, 5)).toEqual({
      total: 15,
      mostrando: "11-15 de 15",
      temMais: false,
      proximoOffset: null,
    });
  });
  it("recorte vazio", () => {
    expect(montarPaginacaoMeta(0, 0, 10, 0)).toEqual({
      total: 0,
      mostrando: "0 de 0",
      temMais: false,
      proximoOffset: null,
    });
  });
  it("offset alem do total (sem itens retornados)", () => {
    expect(montarPaginacaoMeta(5, 50, 10, 0)).toEqual({
      total: 5,
      mostrando: "0 de 5",
      temMais: false,
      proximoOffset: null,
    });
  });
});
