import { getUserDomains } from "./domain-access";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userDomainAccess: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));
const { prisma } = require("@/lib/prisma");

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
const { getCurrentUser } = require("@/lib/auth");

jest.mock("@/lib/permissions", () => ({ canEditUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
const { canEditUser } = require("@/lib/permissions");
const { logAudit } = require("@/lib/audit");

import { getMyDomains, updateUserDomains } from "./domain-access";

describe("getMyDomains", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin recebe todos sem consultar o banco", async () => {
    getCurrentUser.mockResolvedValue({ id: "a1", platformRole: "super_admin" });
    expect(await getMyDomains()).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
    ]);
    expect(prisma.userDomainAccess.findMany).not.toHaveBeenCalled();
  });
  it("manager recebe só os concedidos", async () => {
    getCurrentUser.mockResolvedValue({ id: "m1", platformRole: "manager" });
    prisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }]);
    expect(await getMyDomains()).toEqual(["estoque"]);
  });
  it("sem sessão lança erro", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(getMyDomains()).rejects.toThrow();
  });
});

describe("getUserDomains", () => {
  it("devolve os domínios do usuário", async () => {
    prisma.userDomainAccess.findMany.mockResolvedValue([
      { domain: "estoque" }, { domain: "fiscal" },
    ]);
    expect(await getUserDomains("u1")).toEqual(["estoque", "fiscal"]);
  });
  it("devolve [] quando o usuário não tem domínios", async () => {
    prisma.userDomainAccess.findMany.mockResolvedValue([]);
    expect(await getUserDomains("u1")).toEqual([]);
  });
});

describe("updateUserDomains", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: "m1", platformRole: "manager" });
    prisma.user.findUnique.mockResolvedValue({
      id: "u2", platformRole: "viewer", isOwner: false,
    });
    canEditUser.mockReturnValue({ allowed: true });
    prisma.userDomainAccess.findMany.mockResolvedValue([]);
    prisma.userDomainAccess.createMany.mockResolvedValue({ count: 1 });
    prisma.userDomainAccess.deleteMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it("concede um domínio novo e registra audit", async () => {
    // domínios atuais do alvo: nenhum; domínios do concedente: estoque
    prisma.userDomainAccess.findMany
      .mockResolvedValueOnce([])                       // domínios atuais do alvo
      .mockResolvedValueOnce([{ domain: "estoque" }]); // domínios do concedente
    const res = await updateUserDomains("u2", ["estoque"]);
    expect(res.success).toBe(true);
    expect(prisma.userDomainAccess.createMany).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_domains_changed" }),
    );
  });

  it("rejeita domínio que o concedente não possui", async () => {
    prisma.userDomainAccess.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ domain: "estoque" }]);
    const res = await updateUserDomains("u2", ["fiscal"]);
    expect(res.success).toBe(false);
  });
});
