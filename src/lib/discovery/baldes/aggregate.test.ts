import { agregar } from "./aggregate";
import type { EntradaBalde, NaoClassificado } from "./types";

const e = (dominio: string, balde: "A" | "B" | "C"): EntradaBalde => ({
  dominio,
  descricao: dominio,
  balde,
  count: balde === "A" ? 100 : balde === "B" ? 0 : null,
  transient: false,
  motivo: balde === "A" ? "volume_acima_threshold" : "baixo_volume_dominio_negocio",
});

describe("agregar", () => {
  it("conta por balde e total", () => {
    const r = agregar(
      { "a.x": e("a", "A"), "a.y": e("a", "B"), "b.z": e("b", "C") },
      [],
    );
    expect(r.totais).toEqual({ A: 1, B: 1, C: 1, nao_classificados: 0, total: 3 });
  });
  it("agrupa por domínio", () => {
    const r = agregar({ "a.x": e("a", "A"), "a.y": e("a", "A") }, []);
    expect(r.por_dominio.a).toEqual({ A: 2, B: 0, C: 0, nao_classificados: 0 });
  });
  it("inclui nao_classificados no domínio e no total", () => {
    const nao: NaoClassificado[] = [{ modelo: "c.w", erro: "timeout" }];
    const r = agregar({ "a.x": e("a", "A") }, nao);
    expect(r.totais).toEqual({ A: 1, B: 0, C: 0, nao_classificados: 1, total: 2 });
    expect(r.por_dominio.c).toEqual({ A: 0, B: 0, C: 0, nao_classificados: 1 });
  });
  it("soma por domínio fecha com o total do domínio (partição)", () => {
    const r = agregar(
      { "a.x": e("a", "A"), "a.y": e("a", "B"), "a.z": e("a", "C") },
      [{ modelo: "a.w", erro: "x" }],
    );
    const d = r.por_dominio.a;
    expect(d.A + d.B + d.C + d.nao_classificados).toBe(4);
  });
});
