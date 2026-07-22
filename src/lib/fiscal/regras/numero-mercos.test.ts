import { describe, it, expect } from "@jest/globals";
import { extrairNumeroMercos, extrairNumerosMercos } from "./numero-mercos";

describe("extrairNumerosMercos (lista)", () => {
  it("extrai o número do formato padrão PEDIDO MERCOS: NNNNN", () => {
    expect(extrairNumerosMercos("PEDIDO MERCOS: 43203")).toEqual(["43203"]);
    expect(extrairNumerosMercos("PEDIDO MERCOS: 3095")).toEqual(["3095"]);
  });

  it("tolera erro de digitação no rótulo (MERVCOS, distância <= 2)", () => {
    expect(extrairNumerosMercos("PEDIDO MERVCOS: 47519")).toEqual(["47519"]);
    expect(extrairNumerosMercos("PEDIDO MECROS: 47519")).toEqual(["47519"]);
    expect(extrairNumerosMercos("PEDIDO MERCOSS 45110")).toEqual(["45110"]);
  });

  it("extrai vários números separados por pipe, traço, vírgula, barra ou espaço", () => {
    expect(extrairNumerosMercos("PEDIDO MERCOS: 48524 | 48529")).toEqual(["48524", "48529"]);
    expect(extrairNumerosMercos("PEDIDO MERCOS: 38043 - 45375")).toEqual(["38043", "45375"]);
    expect(extrairNumerosMercos("PEDIDOS MERCOS: 33611 33885")).toEqual(["33611", "33885"]);
    expect(extrairNumerosMercos("MERCOS: 40001, 40002")).toEqual(["40001", "40002"]);
    expect(extrairNumerosMercos("MERCOS: 40001/40002")).toEqual(["40001", "40002"]);
  });

  it("uma palavra quebra a cadeia: pega só o Mercos, ignora referência a outro pedido", () => {
    expect(
      extrairNumerosMercos("PEDIDO MERCOS: 47434 PEDIDO DE TROCA EM REFERENCIA AO PEDIDO 45829"),
    ).toEqual(["47434"]);
  });

  it("ignora números que não têm forma de Mercos (1 dígito, 2 dígitos) após o número", () => {
    expect(extrairNumerosMercos("PEDIDO MERCOS: 46864 1 PALETE CONTEM 47 VOLUMES")).toEqual([
      "46864",
    ]);
  });

  it("fallback 'Pedido Nº' quando não há rótulo Mercos", () => {
    expect(extrairNumerosMercos("Pedido Nº 31737")).toEqual(["31737"]);
    expect(extrairNumerosMercos("Pedido No 44028")).toEqual(["44028"]);
    expect(extrairNumerosMercos("Pedido Numero 46253")).toEqual(["46253"]);
  });

  it("não extrai de linhas de endereço/OC (sem rótulo Mercos nem 'Pedido Nº')", () => {
    expect(
      extrairNumerosMercos(
        "Smart fit VILA MADALENA / OC 573546 / ENDEREÇO DE ENTREGA: PRAÇA BARONESA",
      ),
    ).toEqual([]);
    expect(extrairNumerosMercos("SMF ASA NORTE 509 / SBRDFCASN08 / OC 530171 / ENDEREÇO")).toEqual(
      [],
    );
  });

  it("é case-insensitive e tolera variações de espaçamento", () => {
    expect(extrairNumerosMercos("Pedido Mercos 44142")).toEqual(["44142"]);
    expect(extrairNumerosMercos("mercos:31737")).toEqual(["31737"]);
    expect(extrairNumerosMercos("PEDIDOMERCOS:45110")).toEqual(["45110"]);
  });

  it("não confunde 'mercosul' com Mercos", () => {
    expect(extrairNumerosMercos("Operacao Mercosul 12345")).toEqual([]);
    expect(extrairNumerosMercos("MERCOSUL 12345")).toEqual([]);
    expect(extrairNumerosMercos("Mercosul 12345 e MERCOS 55555")).toEqual(["55555"]);
  });

  it("o rótulo não atravessa quebra de linha para pegar número de outra linha", () => {
    // rótulo numa linha, número embutido em texto de outra linha: não casa
    expect(extrairNumerosMercos("MERCOS\nfoo 43203 bar")).toEqual([]);
    // mas pega quando rótulo e número estão na mesma linha
    expect(extrairNumerosMercos("MERCOS 43203\noutra linha")).toEqual(["43203"]);
  });

  it("rejeita bloco de 7+ dígitos em vez de truncar", () => {
    expect(extrairNumerosMercos("mercos 12345678")).toEqual([]);
    expect(extrairNumerosMercos("MERCOS: 43203 obs extra")).toEqual(["43203"]);
  });

  it("não extrai quando não há número após 'mercos' (ex.: DEMONSTRAÇÃO)", () => {
    expect(extrairNumerosMercos("PEDIDO MERCOS: DEMONSTRAÇÃO")).toEqual([]);
  });

  it("deduplica números repetidos preservando a ordem", () => {
    expect(extrairNumerosMercos("MERCOS: 44142 44142")).toEqual(["44142"]);
  });

  it("número isolado: uma obs que é só um número de EXATAMENTE 5 dígitos é Mercos", () => {
    expect(extrairNumerosMercos("41499")).toEqual(["41499"]);
    expect(extrairNumerosMercos("  41499  ")).toEqual(["41499"]);
    expect(extrairNumerosMercos("Nº 41499")).toEqual(["41499"]);
    // multi-linha: linha que é só o número de 5 dígitos conta.
    expect(extrairNumerosMercos("SMARTFIT X / OC 548239\n41499")).toEqual(["41499"]);
  });

  it("número isolado só vale para EXATAMENTE 5 dígitos (4, 6+ não contam)", () => {
    expect(extrairNumerosMercos("4149")).toEqual([]);
    expect(extrairNumerosMercos("414990")).toEqual([]);
    expect(extrairNumerosMercos("123456")).toEqual([]);
  });

  it("número isolado não casa CEP nem número no meio de texto", () => {
    expect(extrairNumerosMercos("68440-000")).toEqual([]);
    expect(extrairNumerosMercos("PRAÇA BARONESA DE BOCAINA, 12345 - CENTRO")).toEqual([]);
  });

  it("rótulo Mercos tem prioridade sobre número isolado na mesma obs", () => {
    expect(extrairNumerosMercos("PEDIDO MERCOS: 39667\n41499")).toEqual(["39667"]);
  });

  it("devolve lista vazia para obs sem mercos, nulo ou vazio", () => {
    expect(extrairNumerosMercos("Pedido normal sem referencia")).toEqual([]);
    expect(extrairNumerosMercos(null)).toEqual([]);
    expect(extrairNumerosMercos(undefined)).toEqual([]);
    expect(extrairNumerosMercos("")).toEqual([]);
  });
});

describe("extrairNumeroMercos (wrapper de display, retrocompatível)", () => {
  it("devolve um único número como string", () => {
    expect(extrairNumeroMercos("PEDIDO MERCOS: 43203")).toBe("43203");
  });

  it("junta múltiplos números por vírgula + espaço", () => {
    expect(extrairNumeroMercos("PEDIDO MERCOS: 48524 | 48529")).toBe("48524, 48529");
  });

  it("devolve null quando não há número", () => {
    expect(extrairNumeroMercos("Pedido normal")).toBeNull();
    expect(extrairNumeroMercos(null)).toBeNull();
  });
});
