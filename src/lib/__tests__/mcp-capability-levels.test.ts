import {
  emptyAccessMap,
  capabilitiesToLevels,
  levelsToCapabilities,
} from "@/lib/mcp-capability-levels";
import type { McpCapabilities } from "@/lib/actions/mcp-api-keys-types";

describe("mcp-capability-levels", () => {
  it("emptyAccessMap deixa todos os módulos sem acesso", () => {
    const map = emptyAccessMap();
    expect(map.crm).toEqual({ level: "none", actions: [] });
    expect(map.financeiro).toEqual({ level: "none", actions: [] });
  });

  it("capabilitiesToLevels marca leitura e escrita corretamente", () => {
    const cap: McpCapabilities = {
      version: 1,
      read: ["estoque", "crm"],
      write: { crm: ["Create", "Update"] },
    };
    const map = capabilitiesToLevels(cap);
    expect(map.estoque).toEqual({ level: "read", actions: [] });
    expect(map.crm).toEqual({ level: "write", actions: ["Create", "Update"] });
    expect(map.financeiro.level).toBe("none");
  });

  it("levelsToCapabilities inclui o módulo de escrita também em read", () => {
    const map = emptyAccessMap();
    map.crm = { level: "write", actions: ["Create"] };
    map.estoque = { level: "read", actions: [] };
    const cap = levelsToCapabilities(map);
    expect(cap.version).toBe(1);
    expect(cap.read.sort()).toEqual(["crm", "estoque"]);
    expect(cap.write).toEqual({ crm: ["Create"] });
  });

  it("nível write sem ações não vira entrada em write", () => {
    const map = emptyAccessMap();
    map.crm = { level: "write", actions: [] };
    const cap = levelsToCapabilities(map);
    expect(cap.read).toContain("crm");
    expect(cap.write.crm).toBeUndefined();
  });

  it("round-trip preserva capabilities", () => {
    const cap: McpCapabilities = {
      version: 1,
      read: ["estoque", "crm", "financeiro"],
      write: { crm: ["Create", "Delete"] },
    };
    const back = levelsToCapabilities(capabilitiesToLevels(cap));
    expect(back.read.sort()).toEqual([...cap.read].sort());
    expect(back.write).toEqual(cap.write);
  });
});
