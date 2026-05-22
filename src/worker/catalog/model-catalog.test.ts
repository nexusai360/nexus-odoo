import { MODEL_CATALOG, rawTableFor } from "./model-catalog";
import fs from "node:fs";
import path from "node:path";

// Modelos acrescentados na F4 L1a (expansão da base de leitura). Entraram pela
// investigação `fields_get`, não pela varredura F0, então não têm arquivo
// correspondente em discovery/output/modelos.
const MODELOS_L1A = new Set([
  "sped.tabela.preco",
  "sped.tabela.preco.regra",
  "sped.servico",
  "sped.apuracao",
  "sped.carta.correcao",
]);

describe("model-catalog", () => {
  it("tem 84 modelos (79 do F0 + 5 da expansão L1a)", () => {
    expect(MODEL_CATALOG).toHaveLength(84);
  });

  // discovery/output/ é gitignored (saídas brutas locais — ver .gitignore).
  // Em dev, com os field-maps presentes, valida-se que o catálogo bate com
  // o discovery; em CI o diretório não existe e o caso é pulado.
  const discoveryDir = path.join(process.cwd(), "discovery/output/modelos");
  const temDiscovery = fs.existsSync(discoveryDir);
  (temDiscovery ? it : it.skip)(
    "cobre exatamente os modelos de discovery/output/modelos (fora os da L1a)",
    () => {
      const arquivos = fs
        .readdirSync(discoveryDir)
        .filter((f) => f.endsWith(".json"));
      const noDisco = new Set(arquivos.map((f) => f.replace(/\.json$/, "")));
      const noCatalogo = new Set(
        MODEL_CATALOG.map((m) => m.odooModel).filter((m) => !MODELOS_L1A.has(m)),
      );
      expect(noCatalogo).toEqual(noDisco);
    },
  );

  it("todo modo é incremental, snapshot ou estatico", () => {
    for (const m of MODEL_CATALOG) {
      expect(["incremental", "snapshot", "estatico"]).toContain(m.mode);
    }
  });

  it("rawTableFor converte ponto em underscore com prefixo raw_", () => {
    expect(rawTableFor("estoque.saldo.hoje")).toBe("raw_estoque_saldo_hoje");
  });
});
