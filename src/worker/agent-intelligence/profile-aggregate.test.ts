// Mocka prisma/redis para nao carregar o client gerado (usa import.meta, nao parseavel no jest).
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/redis", () => ({ redis: { get: jest.fn(), set: jest.fn(), keys: jest.fn(), del: jest.fn() } }));

import { rodarProfileAggregateWith } from "./profile-aggregate";
import type { CandidateStat } from "@/lib/agent/user-profile/candidates";
import type { UserProfileData } from "@/lib/agent/user-profile/types";

const NOW = 1_700_000_000_000;

function stat(over: Partial<CandidateStat>): CandidateStat {
  return { userId: "u", conversations: 5, messages: 50, lastMessageMs: NOW, profileBuiltMs: null, ...over };
}

describe("rodarProfileAggregateWith", () => {
  it("atualiza so candidatos elegiveis e pula inelegiveis", async () => {
    const upserts: { userId: string; data: UserProfileData }[] = [];
    const res = await rodarProfileAggregateWith({
      nowMs: NOW,
      queryCandidateStats: async () => [
        stat({ userId: "ok" }),
        stat({ userId: "novato", conversations: 1 }), // abaixo do piso
      ],
      queryUserRows: async (userId) => ({
        topics: [],
        questions: [],
        toolCalls:
          userId === "ok"
            ? [{ toolName: "fiscal_faturamento_por_empresa", count: 3, lastSeenMs: NOW }]
            : [],
      }),
      upsert: async (userId, data) => {
        upserts.push({ userId, data });
      },
    });
    expect(res.atualizados).toBe(1);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].userId).toBe("ok");
    // usuario sem topic_tags ainda deriva preferredDomains via tool_calls
    expect(upserts[0].data.preferredDomains).toContain("fiscal");
    expect(upserts[0].data.presentationPrefs.faturamento?.breakdownPreferido).toBe("empresa");
  });

  it("retorna 0 quando nao ha candidatos", async () => {
    const res = await rodarProfileAggregateWith({
      nowMs: NOW,
      queryCandidateStats: async () => [],
      queryUserRows: async () => ({ topics: [], questions: [], toolCalls: [] }),
      upsert: async () => {},
    });
    expect(res.atualizados).toBe(0);
  });
});
