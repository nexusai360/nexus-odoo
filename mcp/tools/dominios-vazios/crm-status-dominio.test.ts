// mcp/tools/dominios-vazios/crm-status-dominio.test.ts
// TDD , Onda F, Task F.2
import { crmStatusDominio } from "./crm-status-dominio.js";

describe("crmStatusDominio", () => {
  it("tem id correto", () => {
    expect(crmStatusDominio.id).toBe("crm_status_dominio");
  });

  it("é sempreVisivel", () => {
    expect(crmStatusDominio.sempreVisivel).toBe(true);
  });

  it("não tem dominio definido", () => {
    expect((crmStatusDominio as unknown as Record<string, unknown>).dominio).toBeUndefined();
  });

  it("inputSchemaShape é objeto vazio", () => {
    expect(crmStatusDominio.inputSchemaShape).toEqual({});
  });

  it("handler retorna output honesto com outcome implícito ok", async () => {
    const ctx = {} as Parameters<typeof crmStatusDominio.handler>[1];
    const output = await crmStatusDominio.handler({}, ctx);
    expect(output).toMatchObject({
      dominio: "crm",
      operado: false,
      registros: 0,
    });
    expect(typeof (output as unknown as Record<string, unknown>).mensagem).toBe("string");
    expect((output as unknown as Record<string, unknown>).mensagem).toContain("CRM");
  });
});
