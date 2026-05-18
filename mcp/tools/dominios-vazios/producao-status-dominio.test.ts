// mcp/tools/dominios-vazios/producao-status-dominio.test.ts
// TDD — Onda F, Task F.3
import { producaoStatusDominio } from "./producao-status-dominio.js";

describe("producaoStatusDominio", () => {
  it("tem id correto", () => {
    expect(producaoStatusDominio.id).toBe("producao_status_dominio");
  });

  it("é sempreVisivel", () => {
    expect(producaoStatusDominio.sempreVisivel).toBe(true);
  });

  it("não tem dominio definido", () => {
    expect((producaoStatusDominio as unknown as Record<string, unknown>).dominio).toBeUndefined();
  });

  it("inputSchemaShape é objeto vazio", () => {
    expect(producaoStatusDominio.inputSchemaShape).toEqual({});
  });

  it("handler retorna output honesto com outcome implícito ok", async () => {
    const ctx = {} as Parameters<typeof producaoStatusDominio.handler>[1];
    const output = await producaoStatusDominio.handler({}, ctx);
    expect(output).toMatchObject({
      dominio: "producao",
      operado: false,
      registros: 0,
    });
    expect(typeof (output as unknown as Record<string, unknown>).mensagem).toBe("string");
    expect((output as unknown as Record<string, unknown>).mensagem).toContain("Produção");
  });
});
