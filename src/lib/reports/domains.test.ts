import { REPORT_DOMAINS, visibleDomains, grantableDomains } from "./domains";

const ALL_9 = [
  "estoque", "financeiro", "fiscal", "comercial",
  "cadastros", "contabil", "rh", "crm", "producao",
];

describe("REPORT_DOMAINS", () => {
  it("tem os 9 domínios", () => {
    expect(REPORT_DOMAINS.map((d) => d.id)).toEqual(ALL_9);
  });
});

describe("visibleDomains", () => {
  it("super_admin vê todos", () => {
    expect(visibleDomains("super_admin", [])).toEqual(ALL_9);
  });
  it("admin vê todos", () => {
    expect(visibleDomains("admin", [])).toEqual(ALL_9);
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
    expect(grantableDomains("super_admin", [])).toEqual(ALL_9);
  });
  it("admin concede todos", () => {
    expect(grantableDomains("admin", [])).toEqual(ALL_9);
  });
  it("manager concede só o que possui", () => {
    expect(grantableDomains("manager", ["estoque"])).toEqual(["estoque"]);
  });
  it("viewer não concede nada", () => {
    expect(grantableDomains("viewer", ["estoque"])).toEqual([]);
  });
});
