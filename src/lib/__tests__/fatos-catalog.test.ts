import fs from "node:fs";
import path from "node:path";

import { FATO_CATALOG, modeloDominio } from "@/lib/fatos-catalog";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("FATO_CATALOG , drift contra as fontes de verdade", () => {
  it("cobre exatamente os fatos do schema (menos fato_build_state e fato_estoque_saldo_snapshot)", () => {
    const schema = read("prisma/schema.prisma");
    // fato_estoque_saldo_snapshot NAO e um fato de sync-rebuild (nao tem builder
    // no registry); e populado pelo job diario de manutencao do worker
    // (capturarSnapshotEstoqueDiario). Por isso fica fora do FATO_CATALOG, como
    // o fato_build_state (que e estado interno, nao um fato de negocio).
    const fatosSchema = [...schema.matchAll(/@@map\("(fato_[a-z_]+)"\)/g)]
      .map((m) => m[1])
      .filter((f) => f !== "fato_build_state" && f !== "fato_estoque_saldo_snapshot")
      .sort();
    const fatosCatalogo = FATO_CATALOG.map((f) => f.nome).sort();
    expect(fatosCatalogo).toEqual(fatosSchema);
  });

  it("não tem nomes duplicados", () => {
    const nomes = FATO_CATALOG.map((f) => f.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("o modo bate com o cycle do builder em registry.ts", () => {
    const reg = read("src/worker/fatos/registry.ts");
    const cyclePorNome = new Map(
      [...reg.matchAll(/nome:\s*"(fato_[a-z_]+)",\s*cycle:\s*"(snapshot|incremental)"/g)].map(
        (m) => [m[1], m[2]],
      ),
    );
    for (const f of FATO_CATALOG) {
      expect(cyclePorNome.get(f.nome)).toBe(f.modo);
    }
  });

  it("a fonte bate com o model de FATO_FONTE (quando declarada)", () => {
    const fr = read("mcp/lib/freshness.ts");
    const modelPorNome = new Map(
      [...fr.matchAll(/(fato_[a-z_]+):\s*\{\s*model:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
    );
    for (const f of FATO_CATALOG) {
      const model = modelPorNome.get(f.nome);
      // fato_produto não tem entrada em FATO_FONTE (lê raw_sped_produto direto);
      // os demais têm e precisam casar.
      if (model) expect(f.fonte).toBe(model);
    }
  });
});

describe("modeloDominio", () => {
  it.each([
    ["sped.documento", "Fiscal"],
    ["reinf.evento", "Fiscal"],
    ["finan.banco.saldo.hoje", "Financeiro"],
    ["estoque.saldo", "Estoque"],
    ["pedido.documento", "Comercial"],
    ["contabil.lancamento", "Contábil"],
    ["res.partner", "Cadastros"],
    ["producao.ordem", "Produção"],
  ])("%s → %s", (model, dominio) => {
    expect(modeloDominio(model)).toBe(dominio);
  });

  it("prefixo desconhecido cai em Outros", () => {
    expect(modeloDominio("desconhecido.modelo")).toBe("Outros");
  });
});
