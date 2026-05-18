import { createUser } from "./users";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canCreateRole } from "@/lib/permissions";

const ME_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    userDomainAccess: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/permissions", () => ({
  canCreateRole: jest.fn(),
  canEditUser: jest.fn(),
  canDeleteUser: jest.fn(),
  canDeactivateUser: jest.fn(),
  canChangeRole: jest.fn(),
}));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
jest.mock("@/lib/actions/domain-access", () => ({
  getUserDomains: jest.fn().mockResolvedValue([]),
  updateUserDomains: jest.fn(),
  getMyDomains: jest.fn().mockResolvedValue([]),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/temp-password", () => ({
  generateTempPassword: jest.fn().mockReturnValue("Temp1234!"),
}));

const mockPrisma = jest.mocked(prisma) as {
  user: { findUnique: jest.Mock; create: jest.Mock };
  userDomainAccess: { createMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockCanCreateRole = jest.mocked(canCreateRole);

describe("createUser com domínios", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({
      id: ME_ID,
      platformRole: "admin",
    } as never);
    mockCanCreateRole.mockReturnValue(true);
    // e-mail livre
    mockPrisma.user.findUnique.mockResolvedValue(null);
    // $transaction executa a função e retorna { id: NEW_ID }
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: NEW_ID }) },
        userDomainAccess: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      return fn(tx);
    });
  });

  it("cria o usuário e os domínios na mesma transação", async () => {
    const result = await createUser({
      name: "Maria",
      email: "maria@x.com",
      platformRole: "manager",
      domains: ["estoque"],
    });
    expect(result.success).toBe(true);
    // $transaction recebeu uma função; dentro dela rodam user.create + createMany
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it("faz rollback do par usuário+domínios em falha", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("db"));
    const result = await createUser({
      name: "Maria",
      email: "maria@x.com",
      platformRole: "manager",
      domains: ["estoque"],
    });
    expect(result.success).toBe(false);
  });
});
