jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));

const deleteAccess = jest.fn();
const createAccess = jest.fn();
const deleteUf = jest.fn();
const createUf = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: {
    userDiretoriaAccess: { deleteMany: (...a: unknown[]) => deleteAccess(...a), createMany: (...a: unknown[]) => createAccess(...a) },
    userDiretoriaUf: { deleteMany: (...a: unknown[]) => deleteUf(...a), createMany: (...a: unknown[]) => createUf(...a) },
    $transaction: (ops: unknown[]) => Promise.resolve(ops),
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { updateUserDiretoriaAccess } from "./diretoria-access";

const mockUser = getCurrentUser as jest.Mock;

beforeEach(() => {
  mockUser.mockReset();
  createAccess.mockClear();
  createUf.mockClear();
});

describe("updateUserDiretoriaAccess", () => {
  it("nega quem não é super_admin/admin", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "manager" });
    const r = await updateUserDiretoriaAccess("u2", ["diretoria.vendas.view"], ["SP"]);
    expect(r.ok).toBe(false);
    expect(createAccess).not.toHaveBeenCalled();
  });

  it("admin define capabilities válidas e UFs, descartando inválidas", async () => {
    mockUser.mockResolvedValue({ id: "adm", platformRole: "admin" });
    const r = await updateUserDiretoriaAccess(
      "u2",
      ["diretoria.vendas.view", "capability.invalida", "diretoria.vendas.view"],
      ["sp", "XX", "MG"],
    );
    expect(r.ok).toBe(true);
    const caps = createAccess.mock.calls[0][0].data.map((d: { capability: string }) => d.capability);
    expect(caps).toEqual(["diretoria.vendas.view"]); // dedup + filtra inválida
    const ufs = createUf.mock.calls[0][0].data.map((d: { uf: string }) => d.uf);
    expect(ufs).toEqual(["SP", "MG"]); // upper + filtra XX
    expect(createAccess.mock.calls[0][0].data[0].grantedById).toBe("adm");
  });
});
