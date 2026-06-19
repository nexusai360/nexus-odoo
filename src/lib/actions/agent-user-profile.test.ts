const requireMinRole = jest.fn();
const resetUserAgentProfile = jest.fn();
const findMany = jest.fn();

jest.mock("@/lib/auth/require", () => ({ requireMinRole: (...a: unknown[]) => requireMinRole(...a) }));
jest.mock("@/lib/prisma", () => ({ prisma: { userAgentProfile: { findMany: (...a: unknown[]) => findMany(...a) } } }));
jest.mock("@/lib/agent/user-profile/store", () => ({
  resetUserAgentProfile: (...a: unknown[]) => resetUserAgentProfile(...a),
}));

import { getUserProfilesForAudit, resetUserProfileAction } from "./agent-user-profile";

beforeEach(() => {
  jest.clearAllMocks();
  requireMinRole.mockResolvedValue(undefined);
});

describe("getUserProfilesForAudit", () => {
  it("exige super_admin e retorna shape derivado (sem PII)", async () => {
    findMany.mockResolvedValueOnce([
      {
        userId: "u1",
        topTopics: [{ topic: "faturamento", score: 9, lastSeenAt: "x" }],
        preferredDomains: ["fiscal"],
        presentationPrefs: { faturamento: { breakdownPreferido: "empresa" } },
        recurringQuestions: [{ label: "faturamento", count: 3, lastSeenAt: "x" }],
        interactionPrompt: "Prefere respostas curtas.",
        profileBuiltAt: new Date("2026-06-19T00:00:00Z"),
        profileAppliedAt: null,
        quarantinedAt: null,
        lastLearnedModel: "deterministico-v1",
        user: { name: "Mariane", email: "m@x.com" },
      },
    ]);
    const out = await getUserProfilesForAudit();
    expect(requireMinRole).toHaveBeenCalledWith("super_admin");
    expect(out[0]).toMatchObject({
      userId: "u1",
      userName: "Mariane",
      preferredDomains: ["fiscal"],
      topTopics: ["faturamento"],
      breakdownPrefs: [{ familia: "faturamento", breakdown: "empresa" }],
      recurringLabels: ["faturamento"],
      interactionPrompt: "Prefere respostas curtas.",
    });
  });

  it("propaga negacao de papel", async () => {
    requireMinRole.mockRejectedValueOnce(new Error("forbidden"));
    await expect(getUserProfilesForAudit()).rejects.toThrow("forbidden");
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("resetUserProfileAction", () => {
  it("exige super_admin e chama o reset do store", async () => {
    resetUserAgentProfile.mockResolvedValueOnce(undefined);
    const r = await resetUserProfileAction("u1");
    expect(requireMinRole).toHaveBeenCalledWith("super_admin");
    expect(resetUserAgentProfile).toHaveBeenCalledWith("u1");
    expect(r).toEqual({ ok: true });
  });
});
