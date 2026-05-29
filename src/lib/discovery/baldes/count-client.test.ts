import { searchCount, type ContadorRpc } from "./count-client";
import { OdooAccessError, OdooMissingError } from "@/worker/odoo/client";

/** Client fake estruturalmente compatível (só o que searchCount usa). */
function fakeClient(behavior: (model: string) => Promise<number>): ContadorRpc {
  return {
    executeKw: <T>(model: string) => behavior(model) as unknown as Promise<T>,
  };
}

describe("searchCount", () => {
  it("sucesso -> { ok:true, count }", async () => {
    const c = fakeClient(async () => 42);
    await expect(searchCount(c, "sped.documento")).resolves.toEqual({
      ok: true,
      count: 42,
    });
  });
  it("OdooAccessError -> { ok:false, tipo: acesso_negado }", async () => {
    const c = fakeClient(async () => {
      throw new OdooAccessError("not allowed");
    });
    const r = await searchCount(c, "ir.secret");
    expect(r).toMatchObject({ ok: false, tipo: "acesso_negado" });
  });
  it("fault persistente -> { ok:false, tipo: abstract }", async () => {
    const c = fakeClient(async () => {
      throw new OdooMissingError("não existe");
    });
    const r = await searchCount(c, "abstract.model");
    expect(r).toMatchObject({ ok: false, tipo: "abstract" });
  });
});
