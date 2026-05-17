import { requireDomainAccess } from "./guard";
import { getMyDomains } from "@/lib/actions/domain-access";
import { redirect } from "next/navigation";

jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const mockGetMyDomains = jest.mocked(getMyDomains);
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
