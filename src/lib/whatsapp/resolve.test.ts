import { normalizeE164, resolveWhatsappUser } from "./resolve";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userWhatsappNumber: { findFirst: jest.fn() },
  },
}));

const mockPrisma = jest.mocked(prisma) as unknown as {
  userWhatsappNumber: { findFirst: jest.Mock };
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
  const findFirst = mockPrisma.userWhatsappNumber.findFirst;
  beforeEach(() => jest.clearAllMocks());

  it("retorna unknown para número não cadastrado", async () => {
    findFirst.mockResolvedValue(null);
    expect(await resolveWhatsappUser("+5511991234567")).toEqual({ status: "unknown" });
  });

  it("retorna inactive para número de usuário inativo", async () => {
    findFirst.mockResolvedValue({ user: { id: "u1", name: "Ana", isActive: false, platformRole: "viewer" } });
    expect(await resolveWhatsappUser("+5511991234567")).toEqual({ status: "inactive" });
  });

  it("retorna ok com o usuário (incluindo platformRole) para usuário ativo", async () => {
    const user = { id: "u1", name: "Ana", isActive: true, platformRole: "manager" };
    findFirst.mockResolvedValue({ user });
    expect(await resolveWhatsappUser("+5511991234567")).toEqual({ status: "ok", user });
  });

  it("consulta com IN das variantes (com/sem o 9) , normalizado", async () => {
    findFirst.mockResolvedValue(null);
    await resolveWhatsappUser("553498765432"); // sem o 9, vindo da Meta
    const arg = findFirst.mock.calls[0][0];
    expect(arg.where.phoneE164.in.length).toBeGreaterThanOrEqual(2);
    expect(arg.where.phoneE164.in).toContain("+5534998765432");
    expect(arg.select.user.select.platformRole).toBe(true);
  });

  it("retorna unknown para número malformado (sem consultar)", async () => {
    expect(await resolveWhatsappUser("abc")).toEqual({ status: "unknown" });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
