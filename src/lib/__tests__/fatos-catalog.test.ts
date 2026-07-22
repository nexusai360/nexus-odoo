import fs from "node:fs";
import path from "node:path";

import { FATO_CATALOG, modeloDominio } from "@/lib/fatos-catalog";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("FATO_CATALOG , drift contra as fontes de verdade", () => {
  it("cobre exatamente os fatos do schema (menos os fatos sem builder de sync-rebuild)", () => {
    const schema = read("prisma/schema.prisma");
    // Ficam FORA do FATO_CATALOG os fatos que NAO sao de sync-rebuild (nao tem builder no
    // registry):
    // - fato_build_state: estado interno, nao um fato de negocio;
    // - fato_estoque_saldo_snapshot: foto diaria, populada pelo job de manutencao;
    // - fato_preco_historico / fato_estoque_saldo_historico / fato_pedido_valor_historico /
    //   fato_captura_rodada: series append-por-mudanca (Frente B + Onda historico do pedido),
    //   capturadas acopladas ao ciclo (captura-preco/saldo/pedido-valor), nao reconstruidas por
    //   um builder do FATO_BUILDERS.
    const SEM_BUILDER = new Set([
      "fato_build_state",
      "fato_estoque_saldo_snapshot",
      "fato_preco_historico",
      "fato_estoque_saldo_historico",
      "fato_pedido_valor_historico",
      "fato_captura_rodada",
    ]);
    const fatosSchema = [...schema.matchAll(/@@map\("(fato_[a-z_]+)"\)/g)]
      .map((m) => m[1])
      .filter((f) => !SEM_BUILDER.has(f))
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
