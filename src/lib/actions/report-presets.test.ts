jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    reportPreset: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import type { AuthUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  listarPresets,
  criarPreset,
  excluirPreset,
  alternarFavorito,
} from "./report-presets";

const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockPrisma = prisma as unknown as {
  reportPreset: {
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
    update: jest.Mock;
  };
};

const mockUser: AuthUser = {
  id: "user-1",
  email: "user@test.com",
  name: "User",
  platformRole: "admin",
  isOwner: false,
  mustChangePassword: false,
  avatarUrl: null,
  theme: "system",
};

const mockPreset = {
  id: "preset-1",
  reportId: "saldo-produto",
  nome: "Teste",
  searchParams: "armazemId=1",
  favorito: false,
  criadoEm: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(mockUser);
});

// ---------------------------------------------------------------------------
// listarPresets
// ---------------------------------------------------------------------------
describe("listarPresets", () => {
  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await listarPresets("saldo-produto");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/autenticado/i);
  });

  it("retorna lista de presets do usuário", async () => {
    mockPrisma.reportPreset.findMany.mockResolvedValue([mockPreset]);
    const res = await listarPresets("saldo-produto");
    expect(res.success).toBe(true);
    expect((res as { success: true; data: typeof mockPreset[] }).data).toHaveLength(1);
    expect(mockPrisma.reportPreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", reportId: "saldo-produto" },
      }),
    );
  });

  it("retorna erro quando prisma lança exceção", async () => {
    mockPrisma.reportPreset.findMany.mockRejectedValue(new Error("db error"));
    const res = await listarPresets("saldo-produto");
    expect(res.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// criarPreset
// ---------------------------------------------------------------------------
describe("criarPreset", () => {
  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await criarPreset("saldo-produto", "Meu preset", "a=1");
    expect(res.success).toBe(false);
  });

  it("retorna erro quando nome vazio", async () => {
    const res = await criarPreset("saldo-produto", "   ", "a=1");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/nome/i);
  });

  it("retorna erro quando nome excede 80 caracteres", async () => {
    const res = await criarPreset("saldo-produto", "a".repeat(81), "a=1");
    expect(res.success).toBe(false);
  });

  it("retorna erro ao atingir limite de 50 presets", async () => {
    mockPrisma.reportPreset.count.mockResolvedValue(50);
    const res = await criarPreset("saldo-produto", "Novo", "a=1");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/limite/i);
  });

  it("cria preset com sucesso", async () => {
    mockPrisma.reportPreset.count.mockResolvedValue(0);
    mockPrisma.reportPreset.create.mockResolvedValue(mockPreset);
    const res = await criarPreset("saldo-produto", "Meu preset", "armazemId=1");
    expect(res.success).toBe(true);
    expect(mockPrisma.reportPreset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          reportId: "saldo-produto",
          nome: "Meu preset",
          searchParams: "armazemId=1",
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// excluirPreset
// ---------------------------------------------------------------------------
describe("excluirPreset", () => {
  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await excluirPreset("preset-1");
    expect(res.success).toBe(false);
  });

  it("retorna erro quando preset não existe", async () => {
    mockPrisma.reportPreset.findUnique.mockResolvedValue(null);
    const res = await excluirPreset("preset-inexistente");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/não encontrado/i);
  });

  it("retorna erro quando preset pertence a outro usuário", async () => {
    mockPrisma.reportPreset.findUnique.mockResolvedValue({
      userId: "outro-user",
      reportId: "saldo-produto",
    });
    const res = await excluirPreset("preset-1");
    expect(res.success).toBe(false);
    expect((res as { success: false; error: string }).error).toMatch(/acesso negado/i);
  });

  it("exclui preset com sucesso", async () => {
    mockPrisma.reportPreset.findUnique.mockResolvedValue({
      userId: "user-1",
      reportId: "saldo-produto",
    });
    mockPrisma.reportPreset.delete.mockResolvedValue({});
    const res = await excluirPreset("preset-1");
    expect(res.success).toBe(true);
    expect(mockPrisma.reportPreset.delete).toHaveBeenCalledWith({
      where: { id: "preset-1" },
    });
  });
});

// ---------------------------------------------------------------------------
// alternarFavorito
// ---------------------------------------------------------------------------
describe("alternarFavorito", () => {
  it("retorna erro quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await alternarFavorito("preset-1");
    expect(res.success).toBe(false);
  });

  it("retorna erro quando preset pertence a outro usuário", async () => {
    mockPrisma.reportPreset.findUnique.mockResolvedValue({
      userId: "outro-user",
      favorito: false,
      reportId: "saldo-produto",
    });
    const res = await alternarFavorito("preset-1");
    expect(res.success).toBe(false);
  });

  it("alterna favorito de false para true", async () => {
    mockPrisma.reportPreset.findUnique.mockResolvedValue({
      userId: "user-1",
      favorito: false,
      reportId: "saldo-produto",
    });
    mockPrisma.reportPreset.update.mockResolvedValue({
      favorito: true,
      reportId: "saldo-produto",
    });
    const res = await alternarFavorito("preset-1");
    expect(res.success).toBe(true);
    expect(mockPrisma.reportPreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { favorito: true },
      }),
    );
    expect(
      (res as { success: true; data: { favorito: boolean } }).data?.favorito,
    ).toBe(true);
  });

  it("alterna favorito de true para false", async () => {
    mockPrisma.reportPreset.findUnique.mockResolvedValue({
      userId: "user-1",
      favorito: true,
      reportId: "saldo-produto",
    });
    mockPrisma.reportPreset.update.mockResolvedValue({
      favorito: false,
      reportId: "saldo-produto",
    });
    const res = await alternarFavorito("preset-1");
    expect(res.success).toBe(true);
    expect(mockPrisma.reportPreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { favorito: false },
      }),
    );
  });
});
