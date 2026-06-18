import {
  channelLevelOptions,
  channelLevelDescription,
} from "./channel-level-options";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

describe("channelLevelOptions", () => {
  it("retorna Desativado seguido dos roles em hierarquia DECRESCENTE (super_admin..viewer)", () => {
    const opts = channelLevelOptions();
    expect(opts).toHaveLength(5);
    expect(opts[0]).toEqual({ value: "off", label: "Desativado" });
    expect(opts.slice(1).map((o) => o.value)).toEqual([
      "super_admin",
      "admin",
      "manager",
      "viewer",
    ]);
  });

  it("deriva os labels da fonte unica de roles (sem hardcode)", () => {
    const opts = channelLevelOptions();
    expect(opts[1].label).toBe(PLATFORM_ROLE_LABELS.super_admin);
    expect(opts[4].label).toBe(PLATFORM_ROLE_LABELS.viewer);
  });
});

describe("channelLevelDescription", () => {
  it("off => ninguém acessa", () => {
    expect(channelLevelDescription("off")).toMatch(/nenhum/i);
  });
  it("viewer => todos os perfis", () => {
    expect(channelLevelDescription("viewer")).toBe("Todos os perfis podem acessar.");
  });
  it("super_admin => somente Super Admin", () => {
    expect(channelLevelDescription("super_admin")).toBe("Somente Super Admin.");
  });
  it("admin => Admin e Super Admin", () => {
    expect(channelLevelDescription("admin")).toBe("Somente Admin e Super Admin.");
  });
  it("manager => Gerente, Admin e Super Admin", () => {
    expect(channelLevelDescription("manager")).toBe(
      "Somente Gerente, Admin e Super Admin.",
    );
  });
});
