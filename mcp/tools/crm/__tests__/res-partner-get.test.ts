// mcp/tools/crm/__tests__/res-partner-get.test.ts
// TDD para crm.res_partner.get (Bloco J1).
import { crmResPartnerGet } from "../res-partner-get.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeUser(): UserContext {
  return {
    userId: "user-1",
    role: "admin",
    domains: ["crm"],
    tenantId: "t1",
  } as unknown as UserContext;
}

describe("crm.res_partner.get", () => {
  it("tem id, dominio, inputSchemaShape e handler definidos", () => {
    expect(crmResPartnerGet.id).toBe("crm.res_partner.get");
    expect(crmResPartnerGet.dominio).toBe("crm");
    expect(crmResPartnerGet.inputSchemaShape).toBeDefined();
    expect(typeof crmResPartnerGet.handler).toBe("function");
  });

  it("aceita input com id numérico", () => {
    const result = crmResPartnerGet.inputSchema.safeParse({ id: 42 });
    expect(result.success).toBe(true);
  });

  it("rejeita input sem id", () => {
    const result = crmResPartnerGet.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejeita id não inteiro", () => {
    const result = crmResPartnerGet.inputSchema.safeParse({ id: "abc" });
    expect(result.success).toBe(false);
  });

  it("retorna row quando encontrado no cache", async () => {
    const row = { odooId: 42, data: { name: "Empresa A" }, odooWriteDate: null, syncedAt: new Date(), rawDeleted: false };
    const prisma = mockPrisma({
      rawResPartner: {
        findUnique: jest.fn().mockResolvedValue(row),
      },
    });

    const result = await crmResPartnerGet.handler({ id: 42 }, { prisma, user: makeUser() });
    expect(result).toEqual({ found: true, record: row });
    expect(prisma.rawResPartner.findUnique).toHaveBeenCalledWith({ where: { odooId: 42 } });
  });

  it("retorna found:false quando registro não existe no cache", async () => {
    const prisma = mockPrisma({
      rawResPartner: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });

    const result = await crmResPartnerGet.handler({ id: 999 }, { prisma, user: makeUser() });
    expect(result).toEqual({ found: false, record: null });
  });

  it("outputSchema valida resultado found:true", () => {
    const row = { odooId: 1, data: {}, odooWriteDate: null, syncedAt: new Date().toISOString(), rawDeleted: false };
    // outputSchema é permissivo para o campo record (unknown)
    const parsed = crmResPartnerGet.outputSchema.safeParse({ found: true, record: row });
    expect(parsed.success).toBe(true);
  });

  it("outputSchema valida resultado found:false", () => {
    const parsed = crmResPartnerGet.outputSchema.safeParse({ found: false, record: null });
    expect(parsed.success).toBe(true);
  });
});
