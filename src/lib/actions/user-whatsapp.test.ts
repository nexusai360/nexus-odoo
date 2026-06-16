import {
  addWhatsappNumber,
  removeWhatsappNumber,
  listWhatsappNumbers,
  updateWhatsappNumber,
} from "./user-whatsapp";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const ME_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NUM_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userWhatsappNumber: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ logAudit: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

const mockPrisma = jest.mocked(prisma) as unknown as {
  user: { findUnique: jest.Mock };
  userWhatsappNumber: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockLogAudit = jest.mocked(logAudit);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue({
    id: ME_ID,
    platformRole: "admin",
  } as never);
});

describe("addWhatsappNumber", () => {
  it("rejeita usuário não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null as never);
    const r = await addWhatsappNumber({ userId: USER_ID, raw: "11991234567" });
    expect(r).toEqual({ success: false, error: "Não autenticado" });
  });

  it("rejeita papel sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: ME_ID,
      platformRole: "manager",
    } as never);
    const r = await addWhatsappNumber({ userId: USER_ID, raw: "11991234567" });
    expect(r).toEqual({ success: false, error: "Acesso negado" });
  });

  it("rejeita número inválido", async () => {
    const r = await addWhatsappNumber({ userId: USER_ID, raw: "abc" });
    expect(r.success).toBe(false);
  });

  it("rejeita número já em uso por outro usuário", async () => {
    mockPrisma.userWhatsappNumber.findFirst.mockResolvedValue({
      id: NUM_ID,
      userId: OTHER_USER_ID,
    });
    const r = await addWhatsappNumber({ userId: USER_ID, raw: "11991234567" });
    expect(r).toEqual({
      success: false,
      error: "Este número já está em uso por outro usuário",
    });
  });

  it("grava o número, normaliza e audita", async () => {
    mockPrisma.userWhatsappNumber.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    mockPrisma.userWhatsappNumber.create.mockResolvedValue({
      id: NUM_ID,
      phoneE164: "+5511991234567",
    });
    const r = await addWhatsappNumber({ userId: USER_ID, raw: "11991234567" });
    expect(r).toEqual({
      success: true,
      data: { id: NUM_ID, phoneE164: "+5511991234567" },
    });
    expect(mockPrisma.userWhatsappNumber.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          phoneE164: "+5511991234567",
        }),
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_whatsapp_added" }),
    );
  });

  it("rejeita usuário-alvo inexistente", async () => {
    mockPrisma.userWhatsappNumber.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const r = await addWhatsappNumber({ userId: USER_ID, raw: "11991234567" });
    expect(r).toEqual({ success: false, error: "Usuário não encontrado" });
  });
});

describe("removeWhatsappNumber", () => {
  it("remove e audita", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValue({
      id: NUM_ID,
      userId: USER_ID,
      phoneE164: "+5511991234567",
    });
    mockPrisma.userWhatsappNumber.delete.mockResolvedValue({});
    const r = await removeWhatsappNumber(NUM_ID);
    expect(r).toEqual({ success: true });
    expect(mockPrisma.userWhatsappNumber.delete).toHaveBeenCalledWith({
      where: { id: NUM_ID },
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_whatsapp_removed" }),
    );
  });

  it("rejeita número inexistente", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValue(null);
    const r = await removeWhatsappNumber(NUM_ID);
    expect(r).toEqual({ success: false, error: "Número não encontrado" });
  });

  it("rejeita papel sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: ME_ID,
      platformRole: "viewer",
    } as never);
    const r = await removeWhatsappNumber(NUM_ID);
    expect(r).toEqual({ success: false, error: "Acesso negado" });
  });
});

describe("updateWhatsappNumber", () => {
  it("rejeita papel sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: ME_ID,
      platformRole: "viewer",
    } as never);
    const r = await updateWhatsappNumber({ id: NUM_ID, raw: "11988887777" });
    expect(r).toEqual({ success: false, error: "Acesso negado" });
  });

  it("rejeita número inexistente", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValueOnce(null);
    const r = await updateWhatsappNumber({ id: NUM_ID, raw: "11988887777" });
    expect(r).toEqual({ success: false, error: "Número não encontrado" });
  });

  it("é no-op quando o número não muda", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValueOnce({
      id: NUM_ID,
      userId: USER_ID,
      phoneE164: "+5511991234567",
    });
    const r = await updateWhatsappNumber({ id: NUM_ID, raw: "11991234567" });
    expect(r).toEqual({
      success: true,
      data: { id: NUM_ID, phoneE164: "+5511991234567" },
    });
    expect(mockPrisma.userWhatsappNumber.update).not.toHaveBeenCalled();
  });

  it("rejeita novo número já em uso por outro usuário", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValueOnce({
      id: NUM_ID,
      userId: USER_ID,
      phoneE164: "+5511991234567",
    });
    mockPrisma.userWhatsappNumber.findFirst.mockResolvedValueOnce({
      id: "other",
      userId: OTHER_USER_ID,
    });
    const r = await updateWhatsappNumber({ id: NUM_ID, raw: "11988887777" });
    expect(r).toEqual({
      success: false,
      error: "Este número já está em uso por outro usuário",
    });
  });

  it("atualiza, normaliza e audita a troca", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValueOnce({
      id: NUM_ID,
      userId: USER_ID,
      phoneE164: "+5511991234567",
    });
    mockPrisma.userWhatsappNumber.findFirst.mockResolvedValueOnce(null);
    mockPrisma.userWhatsappNumber.update.mockResolvedValue({
      id: NUM_ID,
      phoneE164: "+5511988887777",
    });
    const r = await updateWhatsappNumber({ id: NUM_ID, raw: "11988887777" });
    expect(r).toEqual({
      success: true,
      data: { id: NUM_ID, phoneE164: "+5511988887777" },
    });
    expect(mockPrisma.userWhatsappNumber.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NUM_ID },
        data: { phoneE164: "+5511988887777" },
      }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_whatsapp_removed" }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_whatsapp_added" }),
    );
  });
});

describe("listWhatsappNumbers", () => {
  it("lista os números do usuário", async () => {
    const rows = [
      {
        id: NUM_ID,
        phoneE164: "+5511991234567",
        label: null,
        verifiedAt: null,
        createdAt: new Date(),
      },
    ];
    mockPrisma.userWhatsappNumber.findMany.mockResolvedValue(rows);
    const r = await listWhatsappNumbers(USER_ID);
    expect(r).toEqual({ success: true, data: rows });
  });

  it("rejeita papel sem permissão", async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: ME_ID,
      platformRole: "viewer",
    } as never);
    const r = await listWhatsappNumbers(USER_ID);
    expect(r).toEqual({ success: false, error: "Acesso negado" });
  });
});
