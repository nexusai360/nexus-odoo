import {
  JOB_INCREMENTAL,
  JOB_SNAPSHOT,
  JOB_RECONCILE,
  JOB_CONFIG_CHECK,
  rawDelegateKey,
} from "./jobs";

describe("jobs", () => {
  it("nomes dos jobs são estáveis", () => {
    expect(JOB_INCREMENTAL).toBe("incremental");
    expect(JOB_SNAPSHOT).toBe("snapshot");
    expect(JOB_RECONCILE).toBe("reconcile");
    expect(JOB_CONFIG_CHECK).toBe("config-check");
  });

  it("rawDelegateKey converte odooModel na propriedade camelCase do Prisma", () => {
    expect(rawDelegateKey("estoque.saldo.hoje")).toBe("rawEstoqueSaldoHoje");
    expect(rawDelegateKey("res.partner")).toBe("rawResPartner");
  });
});
