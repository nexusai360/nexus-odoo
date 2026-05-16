import { MODEL_CATALOG, rawTableFor } from "./model-catalog";
import fs from "node:fs";
import path from "node:path";

describe("model-catalog", () => {
  it("tem 79 modelos", () => {
    expect(MODEL_CATALOG).toHaveLength(79);
  });

  // discovery/output/ é gitignored (saídas brutas locais — ver .gitignore).
  // Em dev, com os field-maps presentes, valida-se que o catálogo bate com
  // o discovery; em CI o diretório não existe e o caso é pulado.
  const discoveryDir = path.join(process.cwd(), "discovery/output/modelos");
  const temDiscovery = fs.existsSync(discoveryDir);
  (temDiscovery ? it : it.skip)(
    "cobre exatamente os modelos de discovery/output/modelos",
    () => {
      const arquivos = fs
        .readdirSync(discoveryDir)
        .filter((f) => f.endsWith(".json"));
      const noDisco = new Set(arquivos.map((f) => f.replace(/\.json$/, "")));
      const noCatalogo = new Set(MODEL_CATALOG.map((m) => m.odooModel));
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
