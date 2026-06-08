import { estimarCustoUsd } from "../catalog";

it("projeta custo por consulta a partir do cenario (cache reduz o custo)", () => {
  const semCache = estimarCustoUsd({
    modelId: "gpt-5.4-mini",
    nReqs: 3,
    avgInputTokens: 20000,
    avgOutputTokens: 800,
    cacheHitRate: 0,
  });
  const comCache = estimarCustoUsd({
    modelId: "gpt-5.4-mini",
    nReqs: 3,
    avgInputTokens: 20000,
    avgOutputTokens: 800,
    cacheHitRate: 0.85,
  });
  expect(semCache.costKnown).toBe(true);
  // gpt-5.4-mini: $0.25/1M in, $2.0/1M out. 3 reqs @20k in/800 out, sem cache:
  // 3*(20000*0.25 + 800*2.0)/1e6 = 3*(0.005+0.0016) = 0.0198
  expect(semCache.custoUsd).toBeCloseTo(0.0198, 4);
  expect(comCache.custoUsd).toBeLessThan(semCache.custoUsd as number);
});

it("modelo desconhecido -> costKnown=false", () => {
  expect(
    estimarCustoUsd({
      modelId: "modelo-inexistente-xyz",
      nReqs: 1,
      avgInputTokens: 100,
      avgOutputTokens: 100,
      cacheHitRate: 0,
    }).costKnown,
  ).toBe(false);
});
