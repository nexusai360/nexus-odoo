jest.mock("@/lib/actions/domain-access", () => ({ getMyDomains: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

const { getMyDomains } = require("@/lib/actions/domain-access");
const { redirect } = require("next/navigation");

import { requireDomainAccess } from "./guard";

describe("requireDomainAccess", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("não redireciona quando o usuário tem o domínio", async () => {
    getMyDomains.mockResolvedValue(["estoque"]);
    await requireDomainAccess("estoque");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redireciona para /relatorios quando não tem o domínio", async () => {
    getMyDomains.mockResolvedValue([]);
    await requireDomainAccess("estoque");
    expect(redirect).toHaveBeenCalledWith("/relatorios");
  });
});
