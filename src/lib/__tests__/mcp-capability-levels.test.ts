import {
  emptyAccessMap,
  capabilitiesToLevels,
  levelsToCapabilities,
  deriveModuleWriteActions,
} from "@/lib/mcp-capability-levels";
import {
  MCP_MODULES,
  WRITE_ACTIONS,
  SENSITIVE_ACTIONS,
  type McpCapabilities,
} from "@/lib/actions/mcp-api-keys-types";
import type { CatalogByModule } from "@/lib/actions/mcp-catalog-schema";

describe("MCP_MODULES", () => {
  it("inclui cadastros como módulo canônico", () => {
    expect(MCP_MODULES).toContain("cadastros");
  });

  it("preserva os módulos existentes", () => {
    for (const mod of [
      "crm",
      "vendas",
      "estoque",
      "compras",
      "financeiro",
      "fiscal",
      "contabil",
      "producao",
      "rh",
      "projeto",
    ]) {
      expect(MCP_MODULES).toContain(mod);
    }
  });
});

describe("WRITE_ACTIONS", () => {
  it("inclui Archive como ação de escrita", () => {
    expect(WRITE_ACTIONS).toContain("Archive");
  });

  it("Archive não é considerada sensível (reversível)", () => {
    expect(SENSITIVE_ACTIONS).not.toContain("Archive" as never);
  });
});

describe("deriveModuleWriteActions, archive mapping", () => {
  it("mapeia capability cadastros.archive para action Archive", () => {
    const catalog: CatalogByModule[] = [
      {
        module: "cadastros",
        readTools: [],
        writeTools: [
          {
            id: "cadastros.res_partner.archive",
            operation: "write",
            module: "cadastros",
            descricao: "",
            capability: "cadastros.archive",
            sensitive: false,
            addedInVersion: null,
            inputSchemaKeys: [],
            examples: [],
          },
        ],
      },
    ];
    const map = deriveModuleWriteActions(catalog);
    expect(map.cadastros).toEqual([
      { action: "Archive", tools: ["cadastros.res_partner.archive"] },
    ]);
  });
});

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
