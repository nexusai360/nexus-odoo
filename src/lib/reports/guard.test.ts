import { requireDomainAccess, guardDominio } from "./guard";
import { getMyDomains } from "@/lib/actions/domain-access";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const mockGetMyDomains = jest.mocked(getMyDomains);
const mockGetCurrentUser = jest.mocked(getCurrentUser);
const mockRedirect = jest.mocked(redirect);

describe("requireDomainAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("não redireciona quando o usuário tem o domínio", async () => {
    mockGetMyDomains.mockResolvedValue(["estoque"] as never);
    await requireDomainAccess("estoque");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redireciona para /relatorios quando não tem o domínio", async () => {
    mockGetMyDomains.mockResolvedValue([] as never);
    await requireDomainAccess("estoque");
    expect(mockRedirect).toHaveBeenCalledWith("/relatorios");
  });
});

describe("guardDominio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockResolvedValue({ id: "u1" } as never);
  });

  it("não lança quando o usuário tem o domínio", async () => {
    mockGetMyDomains.mockResolvedValue(["financeiro"] as never);
    await expect(guardDominio("financeiro")).resolves.toBeUndefined();
  });

  it("lança quando o usuário não tem o domínio pedido", async () => {
    mockGetMyDomains.mockResolvedValue(["estoque"] as never);
    await expect(guardDominio("financeiro")).rejects.toThrow(
      "Sem acesso ao domínio",
    );
  });

  it("lança quando não autenticado", async () => {
    mockGetCurrentUser.mockResolvedValue(null as never);
    mockGetMyDomains.mockResolvedValue(["estoque"] as never);
    await expect(guardDominio("estoque")).rejects.toThrow("Não autenticado");
  });
});
