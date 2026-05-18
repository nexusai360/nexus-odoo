// src/lib/reports/queries/fiscal.test.ts

import {
  queryFaturamentoPeriodo,
  queryNotasEmitidas,
  queryNotasRecebidas,
  queryImpostosPeriodo,
  queryFaturamentoPorCliente,
  queryProdutosFaturados,
} from "./fiscal";

// Stub de prisma — substituído por mock real em cada describe
const fakePrisma = {} as Parameters<typeof queryFaturamentoPeriodo>[0];

describe("queryFaturamentoPeriodo", () => {
  // testes adicionados em C.6
  it.todo("filtra saídas autorizadas e agrega totalNotas e valorFaturado");
});

describe("queryNotasEmitidas", () => {
  // testes adicionados em C.7
  it.todo("retorna notas de saída com filtro de período e situacaoNfe");
});

describe("queryNotasRecebidas", () => {
  // testes adicionados em C.8
  it.todo("retorna notas de entrada com filtro de período");
});

describe("queryImpostosPeriodo", () => {
  // testes adicionados em C.9
  it.todo("agrega somaIbpt e somaIcmsProprio por período");
});

describe("queryFaturamentoPorCliente", () => {
  // testes adicionados em C.10
  it.todo("agrupa por participanteNome ordenado por valorTotal desc");
});

describe("queryProdutosFaturados", () => {
  // testes adicionados em C.11
  it.todo("agrupa itens de saída por produtoNome com limite");
});

// Silencia o "unused variable" lint — fakePrisma é placeholder para os mocks futuros
void fakePrisma;
