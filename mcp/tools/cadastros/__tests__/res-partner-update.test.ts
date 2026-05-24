// mcp/tools/cadastros/__tests__/res-partner-update.test.ts
import { cadastrosResPartnerUpdate } from "../res-partner-update.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(): WriteToolHandlerCtx {
  const odoo = mockOdooClient();
  odoo.read.mockResolvedValue([
    { id: 16426, name: "Cliente E2E", phone: "old", mobile: "old", active: true },
  ]);
  odoo.write.mockResolvedValue(true);
  return {
    prisma: mockPrisma(),
    user: { userId: "u1", role: "admin", domains: ["cadastros"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("cadastros.res_partner.update , metadados", () => {
  it("tem id, capability e module corretos", () => {
    expect(cadastrosResPartnerUpdate.id).toBe("cadastros.res_partner.update");
    expect(cadastrosResPartnerUpdate.operation).toBe("write");
    expect(cadastrosResPartnerUpdate.capability).toEqual({
      module: "cadastros",
      action: "update",
    });
    expect(cadastrosResPartnerUpdate.requiresExternalAuth).toBe(true);
    expect(cadastrosResPartnerUpdate.sensitive).toBe(false);
    expect(cadastrosResPartnerUpdate.odooModel).toBe("res.partner");
  });

  it("tem 4 examples", () => {
    expect(cadastrosResPartnerUpdate.examples).toHaveLength(4);
  });
});

describe("cadastros.res_partner.update , inputSchema", () => {
  it("aceita id + 1 campo", () => {
    const r = cadastrosResPartnerUpdate.inputSchema.safeParse({ id: 1, phone: "x" });
    expect(r.success).toBe(true);
  });

  it("rejeita sem nenhum campo alem de id", () => {
    const r = cadastrosResPartnerUpdate.inputSchema.safeParse({ id: 1 });
    expect(r.success).toBe(false);
  });

  it("rejeita id ausente", () => {
    const r = cadastrosResPartnerUpdate.inputSchema.safeParse({ phone: "x" });
    expect(r.success).toBe(false);
  });

  it("rejeita email invalido", () => {
    const r = cadastrosResPartnerUpdate.inputSchema.safeParse({ id: 1, email: "x" });
    expect(r.success).toBe(false);
  });

  it("transforma whatsapp em mobile", () => {
    const r = cadastrosResPartnerUpdate.inputSchema.safeParse({
      id: 1,
      whatsapp: "(11) 99999",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect((r.data as { mobile?: string }).mobile).toBe("(11) 99999");
      expect((r.data as { whatsapp?: string }).whatsapp).toBeUndefined();
    }
  });
});

describe("cadastros.res_partner.update , handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("chama write + le snapshot before e after", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    const parsed = cadastrosResPartnerUpdate.inputSchema.parse({
      id: 16426,
      phone: "(11) 4002-8923",
    });
    const r = await cadastrosResPartnerUpdate.handler(parsed, ctx);

    expect(odoo.read).toHaveBeenCalledTimes(2);
    expect(odoo.write).toHaveBeenCalledWith(
      "res.partner",
      [16426],
      { phone: "(11) 4002-8923" },
    );
    expect(r.id).toBe(16426);
    expect(r.snapshotBefore).not.toBeNull();
    expect(r.snapshotAfter).not.toBeNull();
  });

  it("respeita _skipSnapshotBefore=true (so 1 read)", async () => {
    const ctx = makeCtx();
    const odoo = ctx.odoo as ReturnType<typeof mockOdooClient>;
    const parsed = cadastrosResPartnerUpdate.inputSchema.parse({
      id: 16426,
      phone: "x",
      _skipSnapshotBefore: true,
    });
    await cadastrosResPartnerUpdate.handler(parsed, ctx);
    expect(odoo.read).toHaveBeenCalledTimes(1);
  });
});
