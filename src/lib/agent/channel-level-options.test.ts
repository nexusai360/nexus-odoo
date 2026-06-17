import { channelLevelOptions } from "./channel-level-options";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

describe("channelLevelOptions", () => {
  it("retorna Desativado seguido dos roles em hierarquia crescente", () => {
    const opts = channelLevelOptions();
    expect(opts).toHaveLength(5);
    expect(opts[0]).toEqual({ value: "off", label: "Desativado" });
    expect(opts.slice(1).map((o) => o.value)).toEqual([
      "viewer",
      "manager",
      "admin",
      "super_admin",
    ]);
  });

  it("deriva os labels da fonte unica de roles (sem hardcode)", () => {
    const opts = channelLevelOptions();
    expect(opts[1].label).toBe(PLATFORM_ROLE_LABELS.viewer);
    expect(opts[4].label).toBe(PLATFORM_ROLE_LABELS.super_admin);
  });
});
