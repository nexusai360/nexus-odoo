// mcp/tools/crm/__tests__/res-partner-create.test.ts
// TDD para crm.res_partner.create (Bloco J2).
import { crmResPartnerCreate } from "../res-partner-create.js";
import { mockPrisma } from "../../../__tests__/mocks/prisma.js";
import { mockOdooClient } from "../../../__tests__/mocks/odoo-client.js";
import { ExternalIdAlreadyExistsError } from "../../../lib/errors.js";
import type { WriteToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makeCtx(odooOverrides: ReturnType<typeof mockOdooClient> = mockOdooClient()): WriteToolHandlerCtx {
  const odoo = odooOverrides;
  odoo.create.mockResolvedValue(101);
  odoo.read.mockResolvedValue([{ id: 101, name: "Empresa A", is_company: false }]);
  odoo.searchIrModelData.mockResolvedValue(null);

  return {
    prisma: mockPrisma(),
    user: { userId: "user-1", role: "admin", domains: ["crm"], tenantId: "t1" } as unknown as UserContext,
    odoo,
    requestId: "req-1",
    idempotencyKey: "idem-1",
  };
}

describe("crm.res_partner.create , metadados", () => {
  it("tem id, operation, capability e requiresExternalAuth corretos", () => {
    expect(crmResPartnerCreate.id).toBe("crm.res_partner.create");
    expect(crmResPartnerCreate.operation).toBe("write");
    expect(crmResPartnerCreate.capability).toEqual({ module: "crm", action: "create" });
    expect(crmResPartnerCreate.requiresExternalAuth).toBe(true);
    expect(crmResPartnerCreate.sensitive).toBe(false);
    expect(crmResPartnerCreate.odooModel).toBe("res.partner");
    expect(crmResPartnerCreate.eventName).toBe("crm.res_partner.created");
  });

  it("tem 4 examples (curl, n8n, python, javascript)", () => {
    expect(crmResPartnerCreate.examples).toHaveLength(4);
    const langs = crmResPartnerCreate.examples!.map((e) => e.language);
    expect(langs).toContain("curl");
    expect(langs).toContain("n8n");
    expect(langs).toContain("python");
    expect(langs).toContain("javascript");
  });
});

describe("crm.res_partner.create , inputSchema", () => {
  it("aceita input mínimo com name", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "Empresa X" });
    expect(r.success).toBe(true);
  });

  it("rejeita name vazio", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita name com mais de 128 chars", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "a".repeat(129) });
    expect(r.success).toBe(false);
  });

  it("rejeita email inválido", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "X", email: "nao-é-email" });
    expect(r.success).toBe(false);
  });

  it("aceita email válido", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "X", email: "a@b.com" });
    expect(r.success).toBe(true);
  });

  it("rejeita external_id com mais de 64 chars", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "X", external_id: "a".repeat(65) });
    expect(r.success).toBe(false);
  });

  it("is_company default false", () => {
    const r = crmResPartnerCreate.inputSchema.safeParse({ name: "X" });
    expect(r.success && r.data.is_company).toBe(false);
  });
});

describe("crm.res_partner.create , handler", () => {
  it("cria parceiro no Odoo e retorna WriteToolResult", async () => {
    const ctx = makeCtx();
    const input = crmResPartnerCreate.inputSchema.parse({ name: "Empresa A", is_company: false });
    const result = await crmResPartnerCreate.handler(input, ctx);

    expect(ctx.odoo.create).toHaveBeenCalledWith("res.partner", expect.objectContaining({ name: "Empresa A" }));
    expect(result.id).toBe(101);
    expect(result.snapshotBefore).toBeNull();
    expect(result.snapshotAfter).toBeDefined();
  });

  it("cria ir.model.data quando external_id é fornecido", async () => {
    const ctx = makeCtx();
    (ctx.odoo.create as jest.Mock)
      .mockResolvedValueOnce(101)   // criar res.partner
      .mockResolvedValueOnce(999);  // criar ir.model.data

    const input = crmResPartnerCreate.inputSchema.parse({ name: "Empresa B", is_company: false, external_id: "ext-001" });
    await crmResPartnerCreate.handler(input, ctx);

    expect(ctx.odoo.create).toHaveBeenCalledTimes(2);
    const secondCall = (ctx.odoo.create as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toBe("ir.model.data");
    expect(secondCall[1]).toMatchObject({
      name: "mcp_external_ext-001",
      model: "res.partner",
      module: "mcp_nexus",
      res_id: 101,
      noupdate: true,
    });
  });

  it("lança ExternalIdAlreadyExistsError quando external_id já existe", async () => {
    const ctx = makeCtx();
    (ctx.odoo.searchIrModelData as jest.Mock).mockResolvedValue({ id: 5, res_id: 77 });

    const input = crmResPartnerCreate.inputSchema.parse({ name: "Empresa C", is_company: false, external_id: "ext-dup" });
    await expect(
      crmResPartnerCreate.handler(input, ctx),
    ).rejects.toThrow(ExternalIdAlreadyExistsError);

    expect(ctx.odoo.create).not.toHaveBeenCalled();
  });

  it("não chama searchIrModelData quando external_id ausente", async () => {
    const ctx = makeCtx();
    const input = crmResPartnerCreate.inputSchema.parse({ name: "Empresa D", is_company: false });
    await crmResPartnerCreate.handler(input, ctx);
    expect(ctx.odoo.searchIrModelData).not.toHaveBeenCalled();
  });

  it("chama odoo.read com FIELDS_RES_PARTNER para snapshotAfter", async () => {
    const ctx = makeCtx();
    const input = crmResPartnerCreate.inputSchema.parse({ name: "Empresa E" });
    await crmResPartnerCreate.handler(input, ctx);
    expect(ctx.odoo.read).toHaveBeenCalledWith("res.partner", [101], expect.any(Array));
  });
});
