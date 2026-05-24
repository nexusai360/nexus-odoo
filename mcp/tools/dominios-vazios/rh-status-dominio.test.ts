// mcp/tools/dominios-vazios/rh-status-dominio.test.ts
// TDD , Onda F, Task F.1
import { rhStatusDominio } from "./rh-status-dominio.js";

describe("rhStatusDominio", () => {
  it("tem id correto", () => {
    expect(rhStatusDominio.id).toBe("rh_status_dominio");
  });

  it("é sempreVisivel", () => {
    expect(rhStatusDominio.sempreVisivel).toBe(true);
  });

  it("não tem dominio definido", () => {
    expect((rhStatusDominio as unknown as Record<string, unknown>).dominio).toBeUndefined();
  });

  it("inputSchemaShape é objeto vazio", () => {
    expect(rhStatusDominio.inputSchemaShape).toEqual({});
  });

  it("handler retorna output honesto com outcome implícito ok", async () => {
    const ctx = {} as Parameters<typeof rhStatusDominio.handler>[1];
    const output = await rhStatusDominio.handler({}, ctx);
    expect(output).toMatchObject({
      dominio: "rh",
      operado: false,
      registros: 0,
    });
    expect(typeof (output as unknown as Record<string, unknown>).mensagem).toBe("string");
    expect((output as unknown as Record<string, unknown>).mensagem).toContain("RH");
  });
});
