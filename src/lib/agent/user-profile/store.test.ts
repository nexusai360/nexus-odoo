import type { UserProfileData } from "./types";

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
};
const mockPrisma = {
  userAgentProfile: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock("@/lib/redis", () => ({ redis: mockRedis }));
jest.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import {
  getUserAgentProfile,
  upsertUserAgentProfile,
  resetUserAgentProfile,
  PROFILE_CACHE_PREFIX,
} from "./store";

const data: UserProfileData = {
  topTopics: [{ topic: "faturamento", score: 9, lastSeenAt: "2026-06-01T00:00:00.000Z" }],
  topKeywords: [],
  preferredDomains: ["fiscal"],
  recurringQuestions: [],
  presentationPrefs: { faturamento: { breakdownPreferido: "empresa" } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.keys.mockResolvedValue([]);
});

describe("getUserAgentProfile", () => {
  it("retorna do cache quando presente", async () => {
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(data));
    const out = await getUserAgentProfile("u1");
    expect(out).toEqual(data);
    expect(mockPrisma.userAgentProfile.findUnique).not.toHaveBeenCalled();
  });

  it("recomputa do prisma quando ausente e seta cache", async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.userAgentProfile.findUnique.mockResolvedValueOnce({
      topTopics: data.topTopics,
      topKeywords: [],
      preferredDomains: ["fiscal"],
      recurringQuestions: [],
      presentationPrefs: data.presentationPrefs,
    });
    const out = await getUserAgentProfile("u1");
    expect(out?.preferredDomains).toEqual(["fiscal"]);
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it("null quando nao ha linha", async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockPrisma.userAgentProfile.findUnique.mockResolvedValueOnce(null);
    expect(await getUserAgentProfile("u1")).toBeNull();
  });
});

describe("upsertUserAgentProfile", () => {
  it("grava e invalida cache do perfil E do welcome", async () => {
    mockRedis.keys.mockResolvedValue(["nex:welcome-suggestions:u1:v4:3:all"]);
    await upsertUserAgentProfile("u1", data, { lastLearnedModel: "deterministico-v1" });
    expect(mockPrisma.userAgentProfile.upsert).toHaveBeenCalled();
    // invalida as duas namespaces (perfil + welcome)
    const patterns = mockRedis.keys.mock.calls.map((c) => c[0]);
    expect(patterns.some((p: string) => p.startsWith(PROFILE_CACHE_PREFIX))).toBe(true);
    expect(patterns.some((p: string) => p.includes("welcome-suggestions"))).toBe(true);
  });
});

describe("resetUserAgentProfile", () => {
  it("zera personalizacao e marca quarentena", async () => {
    await resetUserAgentProfile("u1");
    const arg = mockPrisma.userAgentProfile.update.mock.calls[0][0];
    expect(arg.data.interactionPrompt).toBeNull();
    expect(arg.data.presentationPrefs).toEqual({});
    expect(arg.data.quarantinedAt).toBeInstanceOf(Date);
  });
});
