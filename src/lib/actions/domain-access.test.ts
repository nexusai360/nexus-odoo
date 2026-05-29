import { getUserDomains, getMyDomains, updateUserDomains } from "./domain-access";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditUser } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

// IDs de teste são UUIDs válidos: updateUserDomains valida userId com z.string().uuid().
const ME_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const SOME_ID = "33333333-3333-4333-8333-333333333333";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userDomainAccess: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/permissions", () => ({ canEditUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));

const mockPrisma = jest.mocked(prisma) as {
  userDomainAccess: {
    findMany: jest.Mock;
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  user: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockCanEditUser = jest.mocked(canEditUser);
const mockLogAudit = jest.mocked(logAudit);

describe("getMyDomains", () => {
  beforeEach(() => jest.clearAllMocks());

  it("super_admin recebe todos sem consultar o banco", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "a1", platformRole: "super_admin" } as never);
    expect(await getMyDomains()).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
      "cadastros", "contabil", "crm",
    ]);
    expect(mockPrisma.userDomainAccess.findMany).not.toHaveBeenCalled();
  });
  it("manager recebe só os concedidos", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ME_ID, platformRole: "manager" } as never);
    mockPrisma.userDomainAccess.findMany.mockResolvedValue([{ domain: "estoque" }] as never);
    expect(await getMyDomains()).toEqual(["estoque"]);
  });
  it("sem sessão lança erro", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    await expect(getMyDomains()).rejects.toThrow();
  });
});

describe("getUserDomains", () => {
  it("devolve os domínios do usuário", async () => {
    mockPrisma.userDomainAccess.findMany.mockResolvedValue([
      { domain: "estoque" }, { domain: "fiscal" },
    ] as never);
    expect(await getUserDomains(SOME_ID)).toEqual(["estoque", "fiscal"]);
  });
  it("devolve [] quando o usuário não tem domínios", async () => {
    mockPrisma.userDomainAccess.findMany.mockResolvedValue([] as never);
    expect(await getUserDomains(SOME_ID)).toEqual([]);
  });
});

describe("updateUserDomains", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: ME_ID, platformRole: "manager" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: TARGET_ID, platformRole: "viewer", isOwner: false,
    } as never);
    mockCanEditUser.mockReturnValue({ allowed: true } as never);
    mockPrisma.userDomainAccess.findMany.mockResolvedValue([] as never);
    mockPrisma.userDomainAccess.createMany.mockResolvedValue({ count: 1 } as never);
    mockPrisma.userDomainAccess.deleteMany.mockResolvedValue({ count: 0 } as never);
    mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  });

  it("concede um domínio novo e registra audit", async () => {
    mockPrisma.userDomainAccess.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ domain: "estoque" }] as never);
    const res = await updateUserDomains(TARGET_ID, ["estoque"]);
    expect(res.success).toBe(true);
    expect(mockPrisma.userDomainAccess.createMany).toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_domains_changed" }),
    );
  });

  it("rejeita domínio que o concedente não possui", async () => {
    mockPrisma.userDomainAccess.findMany
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ domain: "estoque" }] as never);
    const res = await updateUserDomains(TARGET_ID, ["fiscal"]);
    expect(res.success).toBe(false);
  });
});
