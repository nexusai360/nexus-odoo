// mcp/tools/caminho3/bi-consulta-avancada.test.ts
import { biConsultaAvancada } from "./bi-consulta-avancada.js";
import { visibleTools, assertToolAllowed } from "../../catalog/registry.js";
import { DomainDeniedError } from "../../lib/failure.js";
import type { UserContext } from "../../auth/user-context.js";

// Helpers de UserContext
function makeUser(role: string, domains: string[] = []): UserContext {
  return {
    userId: "user-test",
    role: role as UserContext["role"],
    domains: domains as UserContext["domains"],
  };
}

describe("biConsultaAvancada — ToolEntry", () => {
  it("tem id correto", () => {
    expect(biConsultaAvancada.id).toBe("bi_consulta_avancada");
  });

  it("sempreVisivel é true", () => {
    expect(biConsultaAvancada.sempreVisivel).toBe(true);
  });

  it("gatedRoles contém apenas super_admin e admin", () => {
    expect(biConsultaAvancada.gatedRoles).toEqual(
      expect.arrayContaining(["super_admin", "admin"]),
    );
    expect(biConsultaAvancada.gatedRoles?.length).toBe(2);
  });

  it("inputSchema aceita { pergunta: string }", () => {
    const result = biConsultaAvancada.inputSchema.safeParse({
      pergunta: "Qual o total de vendas do mês?",
    });
    expect(result.success).toBe(true);
  });

  it("inputSchema rejeita input sem pergunta", () => {
    const result = biConsultaAvancada.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("outputSchema aceita { disponivel: false, mensagem: string, aviso: string }", () => {
    const result = biConsultaAvancada.outputSchema.safeParse({
      disponivel: false,
      mensagem: "modo BI ainda não disponível nesta fase",
      aviso: "consulta dinâmica não auditada",
    });
    expect(result.success).toBe(true);
  });

  it("outputSchema rejeita disponivel: true", () => {
    const result = biConsultaAvancada.outputSchema.safeParse({
      disponivel: true,
      mensagem: "ok",
      aviso: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("biConsultaAvancada — handler stub", () => {
  const ctx = { prisma: {} as never, user: makeUser("super_admin") };

  it("devolve { disponivel: false } com mensagem e aviso", async () => {
    const result = await biConsultaAvancada.handler(
      { pergunta: "Qual faturamento do mês?" },
      ctx,
    );
    expect(result.disponivel).toBe(false);
    expect(typeof result.mensagem).toBe("string");
    expect(result.mensagem.length).toBeGreaterThan(0);
    expect(typeof result.aviso).toBe("string");
    expect(result.aviso.length).toBeGreaterThan(0);
  });

  it("mensagem indica que o modo BI não está disponível nesta fase", async () => {
    const result = await biConsultaAvancada.handler(
      { pergunta: "relatório avançado" },
      ctx,
    );
    expect(result.mensagem.toLowerCase()).toMatch(/bi|disponível|fase/);
  });

  it("aviso menciona consulta dinâmica ou auditoria", async () => {
    const result = await biConsultaAvancada.handler(
      { pergunta: "análise" },
      ctx,
    );
    expect(result.aviso.toLowerCase()).toMatch(/dinâmica|auditada|auditoria/);
  });
});

describe("biConsultaAvancada — visibilidade por role", () => {
  const allTools = [biConsultaAvancada as never];

  it("super_admin vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("super_admin"));
    expect(visible.map((t) => t.id)).toContain("bi_consulta_avancada");
  });

  it("admin vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("admin"));
    expect(visible.map((t) => t.id)).toContain("bi_consulta_avancada");
  });

  it("manager NÃO vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("manager"));
    expect(visible.map((t) => t.id)).not.toContain("bi_consulta_avancada");
  });

  it("viewer NÃO vê a tool", () => {
    const visible = visibleTools(allTools, makeUser("viewer"));
    expect(visible.map((t) => t.id)).not.toContain("bi_consulta_avancada");
  });
});

describe("biConsultaAvancada — assertToolAllowed", () => {
  it("super_admin pode invocar", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("super_admin")),
    ).not.toThrow();
  });

  it("admin pode invocar", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("admin")),
    ).not.toThrow();
  });

  it("manager lança DomainDeniedError", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("manager")),
    ).toThrow(DomainDeniedError);
  });

  it("viewer lança DomainDeniedError", () => {
    expect(() =>
      assertToolAllowed(biConsultaAvancada as never, makeUser("viewer")),
    ).toThrow(DomainDeniedError);
  });
});
