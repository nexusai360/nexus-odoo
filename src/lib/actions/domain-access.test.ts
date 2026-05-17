import { getUserDomains } from "./domain-access";

jest.mock("@/lib/prisma", () => ({
  prisma: { userDomainAccess: { findMany: jest.fn() } },
}));
const { prisma } = require("@/lib/prisma");

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
const { getCurrentUser } = require("@/lib/auth");
import { getMyDomains } from "./domain-access";

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
