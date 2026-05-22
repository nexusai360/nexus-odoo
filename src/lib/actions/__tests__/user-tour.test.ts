jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { userTourSeen: { findUnique: jest.fn(), upsert: jest.fn() } },
}));

import { hasSeenTour, markTourSeen } from "@/lib/actions/user-tour";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const mockUser = getCurrentUser as jest.Mock;
const mockFind = prisma.userTourSeen.findUnique as jest.Mock;
const mockUpsert = prisma.userTourSeen.upsert as jest.Mock;

describe("user-tour", () => {
  beforeEach(() => jest.clearAllMocks());

  it("hasSeenTour retorna true quando não há usuário autenticado", async () => {
    mockUser.mockResolvedValue(null);
    expect(await hasSeenTour("tela-x")).toBe(true);
  });

  it("hasSeenTour retorna false quando o usuário ainda não viu", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    mockFind.mockResolvedValue(null);
    expect(await hasSeenTour("tela-x")).toBe(false);
  });

  it("hasSeenTour retorna true quando há registro de visto", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    mockFind.mockResolvedValue({ id: "row-1" });
    expect(await hasSeenTour("tela-x")).toBe(true);
  });

  it("markTourSeen faz upsert pelo par usuário e tour", async () => {
    mockUser.mockResolvedValue({ id: "u1" });
    await markTourSeen("tela-x");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId_tourKey: { userId: "u1", tourKey: "tela-x" } },
      create: { userId: "u1", tourKey: "tela-x" },
      update: {},
    });
  });

  it("markTourSeen não faz nada sem usuário", async () => {
    mockUser.mockResolvedValue(null);
    await markTourSeen("tela-x");
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
