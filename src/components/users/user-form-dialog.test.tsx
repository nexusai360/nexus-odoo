/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";

import type { FormState } from "./user-form-dialog.internals";
import { handleRoleChange } from "./user-form-dialog.internals";

describe("handleRoleChange — troca de role (N10)", () => {
  const baseForm: FormState = {
    name: "Teste",
    email: "teste@example.com",
    password: "",
    confirmPassword: "",
    role: "manager",
    isActive: true,
    domains: ["estoque", "financeiro"],
  };

  it("role manager mantém domínios existentes", () => {
    const result = handleRoleChange(baseForm, "manager", 1);
    expect(result.form.domains).toEqual(["estoque", "financeiro"]);
    expect(result.form.role).toBe("manager");
    expect(result.step).toBe(1);
  });

  it("role viewer mantém domínios existentes", () => {
    const result = handleRoleChange(baseForm, "viewer", 2);
    expect(result.form.domains).toEqual(["estoque", "financeiro"]);
    expect(result.form.role).toBe("viewer");
    expect(result.step).toBe(2);
  });

  it("ao escolher admin zera domínios", () => {
    const result = handleRoleChange(baseForm, "admin", 1);
    expect(result.form.domains).toEqual([]);
    expect(result.form.role).toBe("admin");
  });

  it("ao escolher super_admin zera domínios", () => {
    const result = handleRoleChange(baseForm, "super_admin", 1);
    expect(result.form.domains).toEqual([]);
    expect(result.form.role).toBe("super_admin");
  });

  it("ao escolher role privilegiado na etapa 2, recua para etapa 1", () => {
    const result = handleRoleChange(baseForm, "admin", 2);
    expect(result.step).toBe(1);
  });

  it("ao escolher role privilegiado na etapa 3, recua para etapa 2", () => {
    const result = handleRoleChange(baseForm, "super_admin", 3);
    expect(result.step).toBe(2);
  });

  it("ao escolher role privilegiado na etapa 1, permanece na etapa 1", () => {
    const result = handleRoleChange(baseForm, "admin", 1);
    expect(result.step).toBe(1);
  });

  it("ao trocar de privilegiado para manager, não altera step", () => {
    const privForm: FormState = { ...baseForm, role: "admin", domains: [] };
    const result = handleRoleChange(privForm, "manager", 1);
    expect(result.step).toBe(1);
    expect(result.form.role).toBe("manager");
  });
});
