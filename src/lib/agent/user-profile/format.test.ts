import { formatUserProfileBlock, formatProfileForChips, CLAUSULA_PRECEDENCIA } from "./format";
import { EMPTY_PROFILE } from "./types";
import type { UserProfileData } from "./types";

const cheio: UserProfileData = {
  topTopics: [{ topic: "faturamento", score: 9, lastSeenAt: "2026-06-01T00:00:00.000Z" }],
  topKeywords: [],
  preferredDomains: ["fiscal", "estoque"],
  recurringQuestions: [{ label: "faturamento", count: 5, lastSeenAt: "2026-06-10T00:00:00.000Z" }],
  presentationPrefs: { faturamento: { breakdownPreferido: "empresa" } },
};

describe("formatUserProfileBlock", () => {
  it("null -> string vazia", () => {
    expect(formatUserProfileBlock(null)).toBe("");
  });
  it("perfil vazio -> string vazia", () => {
    expect(formatUserProfileBlock(EMPTY_PROFILE)).toBe("");
  });
  it("perfil cheio -> contem assuntos, breakdown e a clausula literal", () => {
    const out = formatUserProfileBlock(cheio);
    expect(out).toContain("empresa");
    expect(out.toLowerCase()).toContain("faturamento");
    expect(out).toContain(CLAUSULA_PRECEDENCIA);
  });
  it("nunca contem digitos longos (input e derivado)", () => {
    const out = formatUserProfileBlock(cheio);
    expect(/\d{5,}/.test(out)).toBe(false);
  });
});

describe("formatProfileForChips", () => {
  it("vazio -> ''", () => {
    expect(formatProfileForChips(null)).toBe("");
    expect(formatProfileForChips(EMPTY_PROFILE)).toBe("");
  });
  it("cheio -> resumo compacto com assuntos", () => {
    const out = formatProfileForChips(cheio);
    expect(out.toLowerCase()).toContain("fiscal");
  });
});
