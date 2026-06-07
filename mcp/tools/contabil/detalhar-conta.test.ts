import { contabilDetalharConta } from "./detalhar-conta.js";
import { assertToolAllowed } from "../../catalog/registry.js";
import { DomainDeniedError } from "../../lib/failure.js";
import type { ToolEntry, ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// assertToolAllowed espera ToolEntry<unknown, unknown> (invariante nos generics);
// a entry tipada nao e assinavel direto, entao tratamos como ToolEntry no gate.
const entry = contabilDetalharConta as unknown as ToolEntry;

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoContaContabil: {
      findFirst: jest.fn(),
    },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["contabil"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_conta_contabil", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "contabil.conta", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
  ]);
}

function fakeConta() {
  return {
    odooId: 555,
    codigo: "1.01.001",
    nome: "Caixa Geral",
    tipo: "A",
    natureza: "ativo",
    nivel: 3,
    contaPaiId: 100,
    contaPaiNome: "Disponivel",
    parentPath: "1/1.01/1.01.001",
    caracteristicaSaldo: "devedora",
    ehRedutora: false,
    atualizadoEm: new Date("2026-06-01T00:00:00Z"),
  };
}

describe("contabil_detalhar_conta", () => {
  it("odooId existente => encontrado:true com campos confirmados", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoContaContabil.findFirst as jest.Mock).mockResolvedValue(fakeConta());

    const r = await contabilDetalharConta.handler({ odooId: 555 } as never, ctx);

    const callArgs = (ctx.prisma.fatoContaContabil.findFirst as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.odooId).toBe(555);

    expect(r.estado).not.toBe("preparando");
    if (r.estado !== "preparando") {
      expect(r.estado).toBe("ok");
      const c = r.dados.conta!;
      expect(r.dados.encontrado).toBe(true);
      expect(c.odooId).toBe(555);
      expect(c.codigo).toBe("1.01.001");
      expect(c.nome).toBe("Caixa Geral");
      expect(c.tipo).toBe("A");
      expect(c.natureza).toBe("ativo");
      expect(c.nivel).toBe(3);
      expect(c.contaPaiNome).toBe("Disponivel");
      expect(c.parentPath).toBe("1/1.01/1.01.001");
    }
  });

  it("odooId inexistente => encontrado:false SEM throw", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoContaContabil.findFirst as jest.Mock).mockResolvedValue(null);

    const r = await contabilDetalharConta.handler({ odooId: 999999 } as never, ctx);

    expect(r.estado).not.toBe("preparando");
    if (r.estado !== "preparando") {
      expect(r.dados.encontrado).toBe(false);
      expect(r.dados.conta).toBeNull();
    }
  });

  it("retorno valida contra o outputSchema (parse)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoContaContabil.findFirst as jest.Mock).mockResolvedValue(fakeConta());

    const r = await contabilDetalharConta.handler({ odooId: 555 } as never, ctx);
    expect(() => contabilDetalharConta.outputSchema.parse(r)).not.toThrow();
  });

  it("retorna estado preparando quando freshness nao primada", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([]);
    (ctx.prisma.fatoContaContabil.findFirst as jest.Mock).mockResolvedValue(fakeConta());

    const r = await contabilDetalharConta.handler({ odooId: 555 } as never, ctx);
    expect(r.estado).toBe("preparando");
  });

  describe("gate de role (defesa de seguranca)", () => {
    it("exporta gatedRoles exatamente ['admin','super_admin']", () => {
      expect(contabilDetalharConta.gatedRoles).toEqual(["admin", "super_admin"]);
    });

    function userComRole(role: UserContext["role"]): UserContext {
      // domains inclui "contabil": assim o unico bloqueio possivel e o gate de role,
      // provando que a defesa nao depende do dominio.
      return { userId: "u1", role, domains: ["contabil"] } as UserContext;
    }

    it("nega viewer e manager (DomainDeniedError)", () => {
      expect(() => assertToolAllowed(entry, userComRole("viewer"))).toThrow(DomainDeniedError);
      expect(() => assertToolAllowed(entry, userComRole("manager"))).toThrow(DomainDeniedError);
    });

    it("permite admin e super_admin", () => {
      expect(() => assertToolAllowed(entry, userComRole("admin"))).not.toThrow();
      expect(() => assertToolAllowed(entry, userComRole("super_admin"))).not.toThrow();
    });
  });
});
