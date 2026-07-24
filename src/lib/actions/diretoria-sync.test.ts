import { readFileSync } from "node:fs";
import { join } from "node:path";

const add = jest.fn().mockResolvedValue({ id: "ondemand-vendas" });

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/diretoria/access", () => ({ canDiretoria: jest.fn() }));
jest.mock("@/worker/sync/ondemand-queue", () => ({
  getOndemandSyncQueue: () => ({ add }),
}));
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    quit: jest.fn().mockResolvedValue(undefined),
  }));
});

import { getCurrentUser } from "@/lib/auth";
import { canDiretoria } from "@/lib/diretoria/access";
import { forcarSyncDiretoria } from "./diretoria-sync";

const mockUser = getCurrentUser as jest.Mock;
const mockCan = canDiretoria as jest.Mock;

beforeEach(() => {
  add.mockClear();
  mockUser.mockReset();
  mockCan.mockReset();
});

describe("forcarSyncDiretoria", () => {
  it("nega quem não está autenticado", async () => {
    mockUser.mockResolvedValue(null);
    const r = await forcarSyncDiretoria("vendas");
    expect(r.ok).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("nega quem não tem a capability sync.force", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "viewer" });
    mockCan.mockResolvedValue(false);
    const r = await forcarSyncDiretoria("vendas");
    expect(r.ok).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it("enfileira com jobId determinístico quando autorizado", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "super_admin" });
    mockCan.mockResolvedValue(true);
    const r = await forcarSyncDiretoria("vendas");
    expect(r.ok).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    const [jobName, payload, opts] = add.mock.calls[0];
    expect(jobName).toBe("ondemand");
    expect(payload.models).toContain("pedido.documento");
    expect(opts.jobId).toBe("ondemand-vendas");
  });

  it("área sem modelos Odoo (agenda) não enfileira", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "super_admin" });
    mockCan.mockResolvedValue(true);
    const r = await forcarSyncDiretoria("agenda");
    expect(r.ok).toBe(true);
    expect(add).not.toHaveBeenCalled();
  });

  it("NÃO importa worker/index.ts nem chama upsertJobScheduler (não-regressão)", () => {
    const src = readFileSync(
      join(__dirname, "diretoria-sync.ts"),
      "utf8",
    );
    // checa os IMPORTS (não comentários): nenhum import de worker/index.
    expect(src).not.toMatch(/from\s+["'][^"']*worker\/index/);
    expect(src).not.toMatch(/upsertJobScheduler/);
  });
});
