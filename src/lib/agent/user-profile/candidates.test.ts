import { isEligibleCandidate, selectEligible, MIN_CONVERSATIONS, MIN_MESSAGES } from "./candidates";

const base = { userId: "u", conversations: 5, messages: 50, lastMessageMs: 2000, profileBuiltMs: null as number | null };

describe("isEligibleCandidate", () => {
  it("abaixo do piso de conversas -> inelegivel", () => {
    expect(isEligibleCandidate({ ...base, conversations: MIN_CONVERSATIONS - 1 })).toBe(false);
  });
  it("abaixo do piso de mensagens -> inelegivel", () => {
    expect(isEligibleCandidate({ ...base, messages: MIN_MESSAGES - 1 })).toBe(false);
  });
  it("passa o piso, sem perfil -> elegivel", () => {
    expect(isEligibleCandidate({ ...base, profileBuiltMs: null })).toBe(true);
  });
  it("com perfil e sem mensagem nova -> inelegivel", () => {
    expect(isEligibleCandidate({ ...base, lastMessageMs: 1000, profileBuiltMs: 2000 })).toBe(false);
  });
  it("com perfil e mensagem nova -> elegivel", () => {
    expect(isEligibleCandidate({ ...base, lastMessageMs: 3000, profileBuiltMs: 2000 })).toBe(true);
  });
});

describe("selectEligible", () => {
  it("retorna so os userIds elegiveis", () => {
    const stats = [
      { ...base, userId: "a", conversations: 1 }, // inelegivel
      { ...base, userId: "b" }, // elegivel
    ];
    expect(selectEligible(stats)).toEqual(["b"]);
  });
});
