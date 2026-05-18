// mcp/catalog/registry.test.ts
import { visibleTools, assertToolAllowed } from "./registry.js";
import { DomainDeniedError } from "../lib/failure.js";
import type { ToolEntry } from "./types.js";
import type { UserContext } from "../auth/user-context.js";
import { z } from "zod";

const schema = z.object({});

function makeTool(
  id: string,
  dominio: ToolEntry["dominio"],
  opts: Partial<Pick<ToolEntry, "gatedRoles" | "sempreVisivel">> = {},
): ToolEntry {
  return {
    id,
    dominio,
    descricao: `Tool ${id}`,
    inputSchemaShape: {},
    inputSchema: schema,
    outputSchema: schema,
    handler: async () => ({}),
    ...opts,
  };
}

const estoqueToolA = makeTool("saldo_produto", "estoque");
const financeiroToolA = makeTool("saldo_contas", "financeiro");
const adminTool = makeTool("bi_consulta", "estoque", { gatedRoles: ["super_admin", "admin"] });
const sempreVisivelTool = makeTool("registrar_lacuna", "estoque", { sempreVisivel: true });

const allTools = [estoqueToolA, financeiroToolA, adminTool, sempreVisivelTool];

function makeUser(
  role: UserContext["role"],
  domains: UserContext["domains"],
): UserContext {
  return { userId: "u1", role, domains };
}

describe("visibleTools", () => {
  it("viewer com domínio estoque vê só tools de estoque (e sempreVisivel)", () => {
    const user = makeUser("viewer", ["estoque"]);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);
    expect(ids).toContain("saldo_produto");
    expect(ids).toContain("registrar_lacuna"); // sempreVisivel
    expect(ids).not.toContain("saldo_contas"); // financeiro não acessível
    expect(ids).not.toContain("bi_consulta"); // gatedRole
  });

  it("admin vê todas as tools incluindo gatedRoles", () => {
    const user = makeUser("admin", ["estoque"]);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);
    expect(ids).toContain("bi_consulta");
    expect(ids).toContain("saldo_produto");
    expect(ids).toContain("registrar_lacuna");
    // financeiro não está em domains mas admin vê tudo
    expect(ids).toContain("saldo_contas");
  });

  it("manager/viewer não vê tool com gatedRoles admin", () => {
    const user = makeUser("manager", ["estoque", "financeiro"]);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);
    expect(ids).not.toContain("bi_consulta");
  });

  it("tool sempreVisivel aparece para qualquer usuário (sem domains)", () => {
    const user = makeUser("viewer", []);
    const result = visibleTools(allTools, user);
    const ids = result.map((t) => t.id);
    expect(ids).toContain("registrar_lacuna");
    expect(ids).not.toContain("saldo_produto");
  });
});

describe("assertToolAllowed", () => {
  it("não lança para viewer com domínio correto", () => {
    const user = makeUser("viewer", ["estoque"]);
    expect(() => assertToolAllowed(estoqueToolA, user)).not.toThrow();
  });

  it("lança DomainDeniedError para viewer tentando tool de financeiro", () => {
    const user = makeUser("viewer", ["estoque"]);
    expect(() => assertToolAllowed(financeiroToolA, user)).toThrow(DomainDeniedError);
  });

  it("lança DomainDeniedError para manager em tool com gatedRoles admin", () => {
    const user = makeUser("manager", ["estoque"]);
    expect(() => assertToolAllowed(adminTool, user)).toThrow(DomainDeniedError);
  });

  it("não lança para admin em tool com gatedRoles admin", () => {
    const user = makeUser("admin", ["estoque"]);
    expect(() => assertToolAllowed(adminTool, user)).not.toThrow();
  });

  it("não lança para sempreVisivel mesmo sem domínio correspondente", () => {
    const user = makeUser("viewer", []); // sem nenhum domínio
    expect(() => assertToolAllowed(sempreVisivelTool, user)).not.toThrow();
  });

  it("lança para sempreVisivel com gatedRoles quando role não está na lista", () => {
    const gatedSempreVisivel = makeTool("bi_avancado", "estoque", {
      sempreVisivel: true,
      gatedRoles: ["super_admin", "admin"],
    });
    const user = makeUser("viewer", []);
    expect(() => assertToolAllowed(gatedSempreVisivel, user)).toThrow(DomainDeniedError);
  });
});
