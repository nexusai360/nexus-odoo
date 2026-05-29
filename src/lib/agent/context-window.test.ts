import { resolveContextWindow } from "./context-window";

describe("resolveContextWindow", () => {
  const base = { size: 20, includeSystem: true };

  test("OFF -> budget 0", () => {
    expect(
      resolveContextWindow({ ...base, checkpoint: "OFF" }, { isPlayground: false }).budget,
    ).toBe(0);
    expect(
      resolveContextWindow({ ...base, checkpoint: "OFF" }, { isPlayground: true }).budget,
    ).toBe(0);
  });

  test("PLAYGROUND -> aplica só no playground", () => {
    expect(
      resolveContextWindow({ ...base, checkpoint: "PLAYGROUND" }, { isPlayground: false }).budget,
    ).toBe(0);
    expect(
      resolveContextWindow({ ...base, checkpoint: "PLAYGROUND" }, { isPlayground: true }).budget,
    ).toBe(20);
  });

  test("PRODUCTION -> aplica sempre", () => {
    expect(
      resolveContextWindow({ ...base, checkpoint: "PRODUCTION" }, { isPlayground: false }).budget,
    ).toBe(20);
    expect(
      resolveContextWindow({ ...base, checkpoint: "PRODUCTION" }, { isPlayground: true }).budget,
    ).toBe(20);
  });

  test("clamp 10..50", () => {
    expect(
      resolveContextWindow({ checkpoint: "PRODUCTION", size: 200, includeSystem: true }, { isPlayground: false }).budget,
    ).toBe(50);
    expect(
      resolveContextWindow({ checkpoint: "PRODUCTION", size: 3, includeSystem: true }, { isPlayground: false }).budget,
    ).toBe(10);
  });

  test("size 0 cai no default 20", () => {
    expect(
      resolveContextWindow({ checkpoint: "PRODUCTION", size: 0, includeSystem: false }, { isPlayground: false }),
    ).toEqual({ budget: 20, includeSystem: false });
  });

  test("propaga includeSystem", () => {
    expect(
      resolveContextWindow({ checkpoint: "PRODUCTION", size: 30, includeSystem: false }, { isPlayground: false }),
    ).toEqual({ budget: 30, includeSystem: false });
  });
});
