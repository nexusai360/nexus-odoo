jest.mock("@/lib/prisma", () => ({ prisma: { llmUsage: { findMany: jest.fn() } } }));
import { prisma } from "@/lib/prisma";
import { Decimal } from "decimal.js";
import { agregarCustoPorConversa } from "../usage-stats";

// O Prisma v7 retorna costUsd como Decimal (decimal.js). O codigo usa Number(r.costUsd);
// o teste exercita o tipo real (Decimal), nao uma string, para nao mascarar regressao.
it("soma custo/tokens/latencia (Decimal real) e quebra por origin", async () => {
  (prisma.llmUsage.findMany as jest.Mock).mockResolvedValue([
    {
      costUsd: new Decimal("0.0100"),
      tokensInput: 20000,
      tokensOutput: 800,
      tokensCachedInput: 0,
      durationMs: 1200,
      toolCallsCount: 2,
      costKnown: true,
      origin: "loop_principal",
    },
    {
      costUsd: new Decimal("0.0005"),
      tokensInput: 500,
      tokensOutput: 100,
      tokensCachedInput: 0,
      durationMs: 300,
      toolCallsCount: 0,
      costKnown: true,
      origin: "enhance",
    },
  ]);
  const r = await agregarCustoPorConversa("conv-1");
  expect(r.nReqs).toBe(2);
  expect(r.custoUsdTotal).toBeCloseTo(0.0105, 6);
  expect(r.tokensInput).toBe(20500);
  expect(r.latenciaMsTotal).toBe(1500);
  expect(r.toolCallsTotal).toBe(2);
  expect(r.todosCustoConhecido).toBe(true);
  expect(r.breakdownPorOrigin.loop_principal.custoUsd).toBeCloseTo(0.01, 6);
  expect(r.breakdownPorOrigin.enhance.custoUsd).toBeCloseTo(0.0005, 6);
});

it("todosCustoConhecido=false quando alguma linha tem costKnown=false", async () => {
  (prisma.llmUsage.findMany as jest.Mock).mockResolvedValue([
    {
      costUsd: null,
      tokensInput: 0,
      tokensOutput: 0,
      tokensCachedInput: 0,
      durationMs: 100,
      costKnown: false,
      origin: null,
    },
  ]);
  const r = await agregarCustoPorConversa("conv-2");
  expect(r.todosCustoConhecido).toBe(false);
});
