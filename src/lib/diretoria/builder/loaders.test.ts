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
});
