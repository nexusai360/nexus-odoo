import { carregarLayout } from "./layout-repo";

function prismaMock(impl: (args: { where: Record<string, unknown> }) => unknown) {
  return {
    diretoriaRelatorio: { findFirst: jest.fn(impl) },
  } as unknown as Parameters<typeof carregarLayout>[0];
}

describe("carregarLayout", () => {
  it("usa o layout do usuário quando existe", async () => {
    const prisma = prismaMock(({ where }) => {
      if (where.donoUserId === "u1") {
        return { blocos: [{ componenteId: "A-01", ordem: 0, larguraQuartos: 2, alturaU: 1 }] };
      }
      return { blocos: [{ componenteId: "PADRAO", ordem: 0, larguraQuartos: 4, alturaU: 2 }] };
    });
    const r = await carregarLayout(prisma, "estoque", "u1");
    expect(r).toEqual([{ componenteId: "A-01", ordem: 0, largura: 2, altura: 1, x: 0, y: 0 }]);
  });

  it("cai no padrão quando o usuário não tem layout", async () => {
    const prisma = prismaMock(({ where }) => {
      if (where.donoUserId === "u1") return null;
      if (where.isPadrao) return { blocos: [{ componenteId: "A-02", ordem: 1, larguraQuartos: 2, alturaU: 2 }] };
      return null;
    });
    const r = await carregarLayout(prisma, "estoque", "u1");
    expect(r).toEqual([{ componenteId: "A-02", ordem: 1, largura: 2, altura: 2, x: 0, y: 0 }]);
  });

  it("retorna vazio quando não há nenhum layout", async () => {
    const prisma = prismaMock(() => null);
    const r = await carregarLayout(prisma, "estoque", "u1");
    expect(r).toEqual([]);
  });
});
