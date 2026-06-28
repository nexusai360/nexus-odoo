jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/diretoria/access", () => ({ canDiretoria: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    diretoriaEvento: {
      create: jest.fn().mockResolvedValue({ id: "ev1" }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { canDiretoria } from "@/lib/diretoria/access";
import { prisma } from "@/lib/prisma";
import { criarEvento, excluirEvento, type EventoInput } from "./diretoria-agenda";

const mockUser = getCurrentUser as jest.Mock;
const mockCan = canDiretoria as jest.Mock;
const create = prisma.diretoriaEvento.create as jest.Mock;

const valido: EventoInput = {
  titulo: "Reunião comercial",
  tipo: "reuniao",
  inicio: "2026-07-01T14:00:00Z",
};

beforeEach(() => {
  mockUser.mockReset();
  mockCan.mockReset();
  create.mockClear();
});

describe("criarEvento", () => {
  it("nega sem autenticação", async () => {
    mockUser.mockResolvedValue(null);
    const r = await criarEvento(valido);
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("nega sem capability agenda.manage", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "viewer" });
    mockCan.mockResolvedValue(false);
    const r = await criarEvento(valido);
    expect(r.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("valida título obrigatório", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "admin" });
    mockCan.mockResolvedValue(true);
    const r = await criarEvento({ ...valido, titulo: "  " });
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/título/i);
  });

  it("cria quando autorizado e válido", async () => {
    mockUser.mockResolvedValue({ id: "u1", platformRole: "admin" });
    mockCan.mockResolvedValue(true);
    const r = await criarEvento(valido);
    expect(r.ok).toBe(true);
    expect(r.id).toBe("ev1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.criadoPorId).toBe("u1");
  });
});

describe("excluirEvento", () => {
  it("nega sem capability", async () => {
    mockUser.mockResolvedValue({ id: "1", platformRole: "viewer" });
    mockCan.mockResolvedValue(false);
    const r = await excluirEvento("ev1");
    expect(r.ok).toBe(false);
    expect(prisma.diretoriaEvento.delete).not.toHaveBeenCalled();
  });
});
