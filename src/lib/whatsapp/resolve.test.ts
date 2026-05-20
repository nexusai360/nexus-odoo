import { normalizeE164, resolveWhatsappUser } from "./resolve";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userWhatsappNumber: { findUnique: jest.fn() },
  },
}));

const mockPrisma = jest.mocked(prisma) as unknown as {
  userWhatsappNumber: { findUnique: jest.Mock };
};

describe("normalizeE164", () => {
  it("normaliza número já em E.164", () => {
    expect(normalizeE164("+5511991234567")).toBe("+5511991234567");
  });

  it("normaliza número com espaços e separadores", () => {
    expect(normalizeE164("+55 (11) 99123-4567")).toBe("+5511991234567");
  });

  it("assume Brasil quando não há prefixo internacional", () => {
    expect(normalizeE164("11991234567")).toBe("+5511991234567");
  });

  it("normaliza número com DDI 55 sem o +", () => {
    expect(normalizeE164("5511991234567")).toBe("+5511991234567");
  });

  it("lança para entrada vazia", () => {
    expect(() => normalizeE164("")).toThrow();
  });

  it("lança para entrada não numérica", () => {
    expect(() => normalizeE164("abc")).toThrow();
  });

  it("lança para número curto demais", () => {
    expect(() => normalizeE164("12345")).toThrow();
  });
});

describe("resolveWhatsappUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna unknown para número não cadastrado", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValue(null);
    const result = await resolveWhatsappUser("+5511991234567");
    expect(result).toEqual({ status: "unknown" });
  });

  it("retorna inactive para número de usuário inativo", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValue({
      user: { id: "u1", name: "Ana", isActive: false },
    });
    const result = await resolveWhatsappUser("+5511991234567");
    expect(result).toEqual({ status: "inactive" });
  });

  it("retorna ok com o usuário para número de usuário ativo", async () => {
    const user = { id: "u1", name: "Ana", isActive: true };
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValue({ user });
    const result = await resolveWhatsappUser("+5511991234567");
    expect(result).toEqual({ status: "ok", user });
  });

  it("normaliza o número antes de consultar", async () => {
    mockPrisma.userWhatsappNumber.findUnique.mockResolvedValue(null);
    await resolveWhatsappUser("11991234567");
    expect(mockPrisma.userWhatsappNumber.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phoneE164: "+5511991234567" } }),
    );
  });

  it("retorna unknown para número malformado", async () => {
    const result = await resolveWhatsappUser("abc");
    expect(result).toEqual({ status: "unknown" });
    expect(mockPrisma.userWhatsappNumber.findUnique).not.toHaveBeenCalled();
  });
});
