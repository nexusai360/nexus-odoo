import { getUserDomains } from "./domain-access";

jest.mock("@/lib/prisma", () => ({
  prisma: { userDomainAccess: { findMany: jest.fn() } },
}));
const { prisma } = require("@/lib/prisma");

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
