import { REPORT_DOMAINS, visibleDomains, grantableDomains } from "./domains";

describe("REPORT_DOMAINS", () => {
  it("tem os 4 domínios", () => {
    expect(REPORT_DOMAINS.map((d) => d.id)).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
    ]);
  });
});

describe("visibleDomains", () => {
  it("super_admin vê todos", () => {
    expect(visibleDomains("super_admin", [])).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
    ]);
  });
  it("admin vê todos", () => {
    expect(visibleDomains("admin", [])).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
    ]);
  });
  it("manager vê só os concedidos", () => {
    expect(visibleDomains("manager", ["estoque"])).toEqual(["estoque"]);
  });
  it("viewer vê só os concedidos", () => {
    expect(visibleDomains("viewer", ["fiscal"])).toEqual(["fiscal"]);
  });
});

describe("grantableDomains", () => {
  it("super_admin concede todos", () => {
    expect(grantableDomains("super_admin", [])).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
    ]);
  });
  it("admin concede todos", () => {
    expect(grantableDomains("admin", [])).toEqual([
      "estoque", "financeiro", "fiscal", "comercial",
    ]);
  });
  it("manager concede só o que possui", () => {
    expect(grantableDomains("manager", ["estoque"])).toEqual(["estoque"]);
  });
  it("viewer não concede nada", () => {
    expect(grantableDomains("viewer", ["estoque"])).toEqual([]);
  });
});
