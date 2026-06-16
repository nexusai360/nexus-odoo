// src/worker/odoo/field-selection.test.ts
import { getModelFields, clearFieldCache } from "./field-selection";

function fakeClient(meta: Record<string, { type: string; store: boolean }>) {
  return {
    executeKw: jest.fn().mockResolvedValue(meta),
  } as never;
}

beforeEach(() => clearFieldCache());

describe("getModelFields", () => {
  it("inclui campos store=true e exclui one2many e many2many", async () => {
    const client = fakeClient({
      id: { type: "integer", store: true },
      name: { type: "char", store: true },
      partner_id: { type: "many2one", store: true },
      line_ids: { type: "one2many", store: false },
      tag_ids: { type: "many2many", store: false },
      computed_field: { type: "char", store: false },
    });
    const fields = await getModelFields(client, "res.partner");
    expect(fields).toContain("id");
    expect(fields).toContain("name");
    expect(fields).toContain("partner_id");
    expect(fields).not.toContain("line_ids");
    expect(fields).not.toContain("tag_ids");
    expect(fields).not.toContain("computed_field");
  });

  it("exclui campos binary (imagens image_* e blobs) mesmo com store=true", async () => {
    const client = fakeClient({
      id: { type: "integer", store: true },
      nome: { type: "char", store: true },
      image_1920: { type: "binary", store: true },
      image_1024: { type: "binary", store: true },
      image_512: { type: "binary", store: true },
      image_128: { type: "binary", store: true },
      arquivo_pdf: { type: "binary", store: true },
    });
    const fields = await getModelFields(client, "sped.produto");
    expect(fields).toContain("id");
    expect(fields).toContain("nome");
    expect(fields).not.toContain("image_1920");
    expect(fields).not.toContain("image_1024");
    expect(fields).not.toContain("image_512");
    expect(fields).not.toContain("image_128");
    expect(fields).not.toContain("arquivo_pdf");
  });

  it("garante que id está sempre presente mesmo quando store=false", async () => {
    const client = fakeClient({
      id: { type: "integer", store: false },
      name: { type: "char", store: true },
    });
    const fields = await getModelFields(client, "res.partner");
    expect(fields).toContain("id");
  });

  it("memoiza: segunda chamada não faz novo RPC", async () => {
    const client = fakeClient({ id: { type: "integer", store: true } });
    await getModelFields(client, "res.partner");
    await getModelFields(client, "res.partner");
    expect((client as never as { executeKw: jest.Mock }).executeKw).toHaveBeenCalledTimes(1);
  });

  it("cache é por modelo: modelos diferentes fazem RPCs independentes", async () => {
    const meta = { id: { type: "integer", store: true } };
    const client = fakeClient(meta);
    await getModelFields(client, "res.partner");
    await getModelFields(client, "res.company");
    expect((client as never as { executeKw: jest.Mock }).executeKw).toHaveBeenCalledTimes(2);
  });

  it("chama fields_get com atributos corretos", async () => {
    const client = fakeClient({ id: { type: "integer", store: true } });
    await getModelFields(client, "res.partner");
    const mock = (client as never as { executeKw: jest.Mock }).executeKw;
    expect(mock).toHaveBeenCalledWith(
      "res.partner",
      "fields_get",
      [],
      { attributes: ["type", "store"] },
    );
  });

  it("subtrai os excludeFields declarados no MODEL_CATALOG", async () => {
    // sped.certificado consta no MODEL_CATALOG com excludeFields:["senha","arquivo"].
    const client = fakeClient({
      id: { type: "integer", store: true },
      tipo: { type: "selection", store: true },
      senha: { type: "char", store: true },
      arquivo: { type: "binary", store: true },
      proprietario: { type: "char", store: true },
    });
    const fields = await getModelFields(client, "sped.certificado");
    expect(fields).toContain("tipo");
    expect(fields).toContain("proprietario");
    expect(fields).not.toContain("senha");
    expect(fields).not.toContain("arquivo");
  });
});
