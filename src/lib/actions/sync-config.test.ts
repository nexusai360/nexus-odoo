const mockFindMany = jest.fn();
const mockQueryRawUnsafe = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    fatoBuildState: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    $queryRawUnsafe: (...a: unknown[]) => mockQueryRawUnsafe(...a),
  },
}));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));

import { syncConfigSchema } from "@/lib/validations/sync-config";
import { getFatosState } from "@/lib/actions/sync-config";
import { getCurrentUser } from "@/lib/auth";
import { FATO_CATALOG } from "@/lib/fatos-catalog";

const getCurrentUserMock = getCurrentUser as jest.Mock;

describe("syncConfigSchema", () => {
  it("aceita intervalos inteiros positivos", () => {
    const r = syncConfigSchema.safeParse({ corteDados: "2026-03-16",
      incrementalIntervalMin: 3,
      snapshotIntervalMin: 1440,
      reconcileIntervalMin: 1440,
    });
    expect(r.success).toBe(true);
  });

  it("rejeita intervalo menor que 1", () => {
    const r = syncConfigSchema.safeParse({ corteDados: "2026-03-16",
      incrementalIntervalMin: 0,
      snapshotIntervalMin: 1440,
      reconcileIntervalMin: 1440,
    });
    expect(r.success).toBe(false);
  });
});

describe("getFatosState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUserMock.mockResolvedValue({ platformRole: "super_admin" });
    mockQueryRawUnsafe.mockResolvedValue([{ count: BigInt(0) }]);
    mockFindMany.mockResolvedValue([]);
  });

  it("nega acesso a quem não é super_admin", async () => {
    getCurrentUserMock.mockResolvedValue({ platformRole: "admin" });
    await expect(getFatosState()).rejects.toThrow("Acesso negado");
  });

  it("retorna uma linha por fato do catálogo", async () => {
    const rows = await getFatosState();
    expect(rows).toHaveLength(FATO_CATALOG.length);
  });

  it("fato com build registrado fica ok com a data; sem build fica rodando", async () => {
    const buildAt = new Date("2026-05-31T03:42:17.000Z");
    mockFindMany.mockResolvedValue([{ fato: "fato_estoque_saldo", ultimoBuildAt: buildAt }]);

    const rows = await getFatosState();
    const built = rows.find((r) => r.nome === "fato_estoque_saldo");
    const naoBuildado = rows.find((r) => r.nome === "fato_mdfe");

    expect(built).toMatchObject({ status: "ok", ultimoBuildAt: buildAt });
    expect(naoBuildado).toMatchObject({ status: "rodando", ultimoBuildAt: null });
  });

  it("conta registros ao vivo e tolera tabela inexistente (0)", async () => {
    mockQueryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes("fato_estoque_saldo")
        ? Promise.resolve([{ count: BigInt(42) }])
        : Promise.reject(new Error("relation does not exist")),
    );
    const rows = await getFatosState();
    expect(rows.find((r) => r.nome === "fato_estoque_saldo")?.recordCount).toBe(42);
    expect(rows.find((r) => r.nome === "fato_mdfe")?.recordCount).toBe(0);
  });
});
