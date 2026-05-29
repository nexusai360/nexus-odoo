import { REPORT_DOMAINS, visibleDomains, grantableDomains } from "./domains";
import { DOMAINS } from "@/lib/agent/router/domain-vocabulary";

// Alinhado com a SPEC v3 do RBAC v2: 7 domínios (drop rh/producao para
// refletir o vocabulário do Router R1).
const ALL_7 = [
  "estoque", "financeiro", "fiscal", "comercial",
  "cadastros", "contabil", "crm",
];

describe("REPORT_DOMAINS", () => {
  it("tem os 7 domínios alinhados com o Router R1", () => {
    expect(REPORT_DOMAINS.map((d) => d.id)).toEqual(ALL_7);
  });

  // Guardrail futuro: ao adicionar domínio em REPORT_DOMAINS, ele tem que
  // estar no Router R1 (e vice-versa). Router pode ter `caminho3`/`dominios-vazios`
  // extras (escape hatch técnico).
  it("todo id em REPORT_DOMAINS está em DOMAINS do Router R1", () => {
    const routerIds = new Set(DOMAINS.map((d) => d.domain));
    for (const r of REPORT_DOMAINS) {
      expect(routerIds.has(r.id)).toBe(true);
    }
  });
});

describe("visibleDomains", () => {
  it("super_admin vê todos", () => {
    expect(visibleDomains("super_admin", [])).toEqual(ALL_7);
  });
  it("admin vê todos", () => {
    expect(visibleDomains("admin", [])).toEqual(ALL_7);
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
    expect(grantableDomains("super_admin", [])).toEqual(ALL_7);
  });
  it("admin concede todos", () => {
    expect(grantableDomains("admin", [])).toEqual(ALL_7);
  });
  it("manager concede só o que possui", () => {
    expect(grantableDomains("manager", ["estoque"])).toEqual(["estoque"]);
  });
  it("viewer não concede nada", () => {
    expect(grantableDomains("viewer", ["estoque"])).toEqual([]);
  });
});
