import { describe, expect, test } from "@jest/globals";
import { summarizeAvailability } from "./agent-availability-summary";

describe("summarizeAvailability , 4 estados", () => {
  test("bubble + whatsapp -> ativo nos dois canais", () => {
    const s = summarizeAvailability(true, true);
    expect(s.tone).toBe("active");
    expect(s.title.toLowerCase()).toContain("chat in-app");
    expect(s.title.toLowerCase()).toContain("whatsapp");
  });

  test("so bubble -> ativo apenas no chat", () => {
    const s = summarizeAvailability(true, false);
    expect(s.tone).toBe("partial");
    expect(s.title.toLowerCase()).toContain("apenas no chat");
  });

  test("so whatsapp -> ativo apenas no whatsapp", () => {
    const s = summarizeAvailability(false, true);
    expect(s.tone).toBe("partial");
    expect(s.title.toLowerCase()).toContain("apenas no whatsapp");
  });

  test("nenhum -> desativado em todos", () => {
    const s = summarizeAvailability(false, false);
    expect(s.tone).toBe("off");
    expect(s.title.toLowerCase()).toContain("desativado");
  });
});
