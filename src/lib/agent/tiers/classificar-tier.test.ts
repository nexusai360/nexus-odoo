// Onda O (Arquitetura 3.0) O.2 , testes do classificador lexical de tiers.
import { classificarTier } from "./classificar-tier";

describe("classificarTier , T1 simples (default)", () => {
  test.each([
    "Qual o faturamento de junho?",
    "Qual o saldo da esteira?",
    "Quantos pedidos existem no total?",
    "Quais os 10 maiores titulos vencidos?",
    "E de maio?",
  ])("%s -> T1", (q) => {
    expect(classificarTier(q)).toBe("T1");
  });
});

describe("classificarTier , T2 composta (multi-eixo/comparacao)", () => {
  test.each([
    "Compare o faturamento de maio e junho por empresa",
    "Qual o faturamento por empresa e por vendedor este ano?",
    "Me da um panorama geral da operacao",
    "Faturamento de junho versus maio",
    "Qual o estoque da esteira e tambem o da bike?",
    "Resume a situacao financeira e fiscal do grupo",
  ])("%s -> T2", (q) => {
    expect(classificarTier(q)).toBe("T2");
  });
});

describe("classificarTier , T3 explicativa/contestacao", () => {
  test.each([
    "Por que o CMV ficou maior que a venda?",
    "Explique como voce chegou nesse numero",
    "Tem certeza? Esse valor nao bate com o relatorio",
    "Voce esta errado, o faturamento de maio foi outro",
    "De onde saiu esse 776?",
    "Nao concordo com esse numero, confere ai",
    "Justifique essa margem",
    "Esse numero esta estranho, nao bate com o que vi",
  ])("%s -> T3", (q) => {
    expect(classificarTier(q)).toBe("T3");
  });

  test("contestacao ganha de composicao (T3 > T2)", () => {
    expect(
      classificarTier("Por que o faturamento por empresa e por vendedor nao batem?"),
    ).toBe("T3");
  });
});
