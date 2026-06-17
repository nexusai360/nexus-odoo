import { roleMeetsChannelLevel } from "./channel-access";

describe("roleMeetsChannelLevel", () => {
  it("off bloqueia todos", () => {
    expect(roleMeetsChannelLevel("super_admin", "off")).toBe(false);
    expect(roleMeetsChannelLevel("viewer", "off")).toBe(false);
  });
  it("viewer (nível) libera todos os roles", () => {
    expect(roleMeetsChannelLevel("viewer", "viewer")).toBe(true);
    expect(roleMeetsChannelLevel("manager", "viewer")).toBe(true);
    expect(roleMeetsChannelLevel("super_admin", "viewer")).toBe(true);
  });
  it("manager (nível) exige role >= manager", () => {
    expect(roleMeetsChannelLevel("viewer", "manager")).toBe(false);
    expect(roleMeetsChannelLevel("manager", "manager")).toBe(true);
    expect(roleMeetsChannelLevel("admin", "manager")).toBe(true);
  });
  it("super_admin (nível) só libera super_admin", () => {
    expect(roleMeetsChannelLevel("admin", "super_admin")).toBe(false);
    expect(roleMeetsChannelLevel("super_admin", "super_admin")).toBe(true);
  });
});
