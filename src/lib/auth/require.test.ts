import { NextResponse } from "next/server";

import type { AuthUser } from "@/lib/auth-helpers";

jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/actions/domain-access", () => ({
  getMyDomains: jest.fn(),
  getUserDomains: jest.fn(),
}));

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyDomains, getUserDomains } from "@/lib/actions/domain-access";
import {
  requireAuth,
  requireMinRole,
  requireVisibleDomainsOrRedirect,
  requireAgentAccessOrJson,
} from "./require";

const mockedRedirect = redirect as unknown as jest.Mock;
const mockedGetCurrentUser = getCurrentUser as jest.Mock;
const mockedGetMyDomains = getMyDomains as jest.Mock;
const mockedGetUserDomains = getUserDomains as jest.Mock;

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u1",
    email: "u@matrix.local",
    name: "User",
    platformRole: "viewer",
    isOwner: false,
    mustChangePassword: false,
    avatarUrl: null,
    theme: "system",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("requireAuth", () => {
  it("redireciona para /login quando nao autenticado", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(null);
    await expect(requireAuth()).rejects.toThrow("REDIRECT:/login");
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("retorna o usuario quando autenticado", async () => {
    const user = makeUser();
    mockedGetCurrentUser.mockResolvedValueOnce(user);
    await expect(requireAuth()).resolves.toBe(user);
  });
});

describe("requireMinRole", () => {
  it("super_admin passa em qualquer min", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "super_admin" }));
    await expect(requireMinRole("super_admin")).resolves.toBeTruthy();
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("admin passa em min=admin", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "admin" }));
    await expect(requireMinRole("admin")).resolves.toBeTruthy();
  });

  it("admin redireciona em min=super_admin com query denied", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "admin" }));
    await expect(requireMinRole("super_admin")).rejects.toThrow(
      "REDIRECT:/dashboard?denied=super_admin",
    );
  });

  it("viewer redireciona em min=admin", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "viewer" }));
    await expect(requireMinRole("admin")).rejects.toThrow(
      "REDIRECT:/dashboard?denied=admin",
    );
  });

  it("usa redirectTo customizado", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "viewer" }));
    await expect(requireMinRole("admin", "/perfil")).rejects.toThrow(
      "REDIRECT:/perfil?denied=admin",
    );
  });
});

describe("requireVisibleDomainsOrRedirect", () => {
  it("redireciona com error=no_domains quando array vazio", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "viewer" }));
    mockedGetMyDomains.mockResolvedValueOnce([]);
    await expect(requireVisibleDomainsOrRedirect()).rejects.toThrow(
      "REDIRECT:/dashboard?error=no_domains",
    );
  });

  it("retorna user + domains quando ha ao menos um", async () => {
    const user = makeUser({ platformRole: "viewer" });
    mockedGetCurrentUser.mockResolvedValueOnce(user);
    mockedGetMyDomains.mockResolvedValueOnce(["estoque"]);
    const result = await requireVisibleDomainsOrRedirect();
    expect(result.user).toBe(user);
    expect(result.domains).toEqual(["estoque"]);
  });
});

describe("requireAgentAccessOrJson", () => {
  it("responde 401 quando nao autenticado", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(null);
    const res = await requireAgentAccessOrJson();
    expect(res).toBeInstanceOf(NextResponse);
    const body = await (res as NextResponse).json();
    expect((res as NextResponse).status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("retorna allowedDomains=all para super_admin sem query", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "super_admin" }));
    const res = await requireAgentAccessOrJson();
    expect(res).not.toBeInstanceOf(NextResponse);
    expect((res as { allowedDomains: string }).allowedDomains).toBe("all");
    expect(mockedGetUserDomains).not.toHaveBeenCalled();
  });

  it("retorna allowedDomains=all para admin sem query", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "admin" }));
    const res = await requireAgentAccessOrJson();
    expect((res as { allowedDomains: string }).allowedDomains).toBe("all");
    expect(mockedGetUserDomains).not.toHaveBeenCalled();
  });

  it("responde 403 AgentNotEnabled para viewer sem dominios", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "viewer" }));
    mockedGetUserDomains.mockResolvedValueOnce([]);
    const res = await requireAgentAccessOrJson();
    expect(res).toBeInstanceOf(NextResponse);
    const body = await (res as NextResponse).json();
    expect((res as NextResponse).status).toBe(403);
    expect(body.error).toBe("AgentNotEnabled");
  });

  it("retorna Set para manager com 1 dominio", async () => {
    mockedGetCurrentUser.mockResolvedValueOnce(makeUser({ platformRole: "manager" }));
    mockedGetUserDomains.mockResolvedValueOnce(["estoque"]);
    const res = await requireAgentAccessOrJson();
    const allowed = (res as { allowedDomains: Set<string> }).allowedDomains;
    expect(allowed).toBeInstanceOf(Set);
    expect(allowed.has("estoque")).toBe(true);
  });
});
