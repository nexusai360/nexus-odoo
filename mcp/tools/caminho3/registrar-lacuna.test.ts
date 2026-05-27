// mcp/tools/caminho3/registrar-lacuna.test.ts
import { registrarLacuna } from "./registrar-lacuna.js";
import { assertToolAllowed, visibleTools } from "../../catalog/registry.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    featureRequest: { createMany: jest.fn() },
  };
}

function makeCtx(role = "viewer", domains: string[] = []): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role, domains } as UserContext,
  };
}

describe("registrar_lacuna", () => {
  it("handler grava featureRequest via createMany (sem RETURNING) e retorna { registrado: true }", async () => {
    const ctx = makeCtx();
    (ctx.prisma.featureRequest.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    const result = await registrarLacuna.handler(
      { perguntaResumo: "Qual o estoque de bicicletas?", dominio: "estoque" },
      ctx,
    );
    expect(result).toMatchObject({ registrado: true });
    expect(ctx.prisma.featureRequest.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: "u1",
          perguntaResumo: "Qual o estoque de bicicletas?",
          dominio: "estoque",
        }),
      ],
    });
  });

  it("visibleTools inclui a tool para viewer sem domínio (sempreVisivel)", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    const visible = visibleTools([registrarLacuna as never], viewer);
    expect(visible).toContainEqual(expect.objectContaining({ id: "registrar_lacuna" }));
  });

  it("assertToolAllowed não lança para viewer (sempreVisivel, sem gatedRoles)", () => {
    const viewer: UserContext = { userId: "u2", role: "viewer", domains: [] } as UserContext;
    expect(() => assertToolAllowed(registrarLacuna as never, viewer)).not.toThrow();
  });
});
