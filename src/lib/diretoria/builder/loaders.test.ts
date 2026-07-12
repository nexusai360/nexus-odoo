import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

import { resolverBlocos, LOADERS } from "./loaders";

const prisma = {} as Parameters<typeof resolverBlocos>[0];

describe("resolverBlocos", () => {
  afterEach(() => jest.restoreAllMocks());

  it("dedup: id repetido roda o loader 1x", async () => {
    const spy = jest.spyOn(LOADERS, "A-01").mockResolvedValue({ valorTotal: 10 });
    const r = await resolverBlocos(prisma, ["A-01", "A-01"]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.get("A-01")).toEqual({ id: "A-01", ok: true, dado: { valorTotal: 10 } });
  });

  it("componente sem loader retorna ok=false / sem_loader", async () => {
    const r = await resolverBlocos(prisma, ["ZZ-99"]);
    expect(r.get("ZZ-99")).toEqual({ id: "ZZ-99", ok: false, erro: "sem_loader" });
  });

  it("allSettled: um loader que falha não derruba os demais", async () => {
    jest.spyOn(LOADERS, "A-01").mockRejectedValue(new Error("boom"));
    jest.spyOn(LOADERS, "A-02").mockResolvedValue({ linhas: [] });
    const r = await resolverBlocos(prisma, ["A-01", "A-02"]);
    expect(r.get("A-01")?.ok).toBe(false);
    expect(r.get("A-01")?.erro).toContain("boom");
    expect(r.get("A-02")?.ok).toBe(true);
  });

  // Um relatório montado sem período não significa "todo o histórico": significa "da data de
  // início das análises até hoje". Antes, o ctx chegava com periodoDe undefined e os blocos
  // de vendas/pedidos varriam o cache inteiro.
  it("relatório sem período: o loader recebe o período grampeado na data de início das análises", async () => {
    const spy = jest.spyOn(LOADERS, "C-01").mockResolvedValue({});
    await resolverBlocos(prisma, ["C-01"]);
    expect(spy.mock.calls[0][1].periodoDe).toBe(CORTE_DADOS_PADRAO);
  });

  it("período anterior ao corte é grampeado antes de chegar no loader", async () => {
    const spy = jest.spyOn(LOADERS, "C-02").mockResolvedValue({});
    await resolverBlocos(prisma, ["C-02"], { periodoDe: "2024-01-01", periodoAte: "2026-06-30" });
    expect(spy.mock.calls[0][1].periodoDe).toBe(CORTE_DADOS_PADRAO);
    expect(spy.mock.calls[0][1].periodoAte).toBe("2026-06-30");
  });

  it("período posterior ao corte passa intacto", async () => {
    const spy = jest.spyOn(LOADERS, "C-03").mockResolvedValue({});
    await resolverBlocos(prisma, ["C-03"], { periodoDe: "2026-06-01", periodoAte: "2026-06-30" });
    expect(spy.mock.calls[0][1].periodoDe).toBe("2026-06-01");
  });
});
