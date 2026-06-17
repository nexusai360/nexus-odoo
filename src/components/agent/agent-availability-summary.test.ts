import { describe, expect, test } from "@jest/globals";
import { summarizeAvailability } from "./agent-availability-summary";

describe("summarizeAvailability , niveis por canal (F5 C.4)", () => {
  test("viewer + viewer -> ativo nos dois canais", () => {
    const s = summarizeAvailability("viewer", "viewer");
    expect(s.tone).toBe("active");
    expect(s.title.toLowerCase()).toContain("chat in-app");
    expect(s.title.toLowerCase()).toContain("whatsapp");
  });

  test("so bubble (viewer/off) -> ativo apenas no chat", () => {
    const s = summarizeAvailability("viewer", "off");
    expect(s.tone).toBe("partial");
    expect(s.title.toLowerCase()).toContain("apenas no chat");
  });

  test("so whatsapp (off/viewer) -> ativo apenas no whatsapp", () => {
    const s = summarizeAvailability("off", "viewer");
    expect(s.tone).toBe("partial");
    expect(s.title.toLowerCase()).toContain("apenas no whatsapp");
  });

  test("nenhum (off/off) -> desativado em todos", () => {
    const s = summarizeAvailability("off", "off");
    expect(s.tone).toBe("off");
    expect(s.title.toLowerCase()).toContain("desativado");
  });

  test("nivel restrito (manager/off) -> partial e helper cita o nivel minimo", () => {
    const s = summarizeAvailability("manager", "off");
    expect(s.tone).toBe("partial");
    expect(s.helper).toContain("Gerente");
  });
});
