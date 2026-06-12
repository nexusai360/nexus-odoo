// mcp/__tests__/provision-raw-allowlist.test.ts
// Trava a classe de bug 2026-06-12: o provision-mcp.sql roda em TODO boot de
// prod e revoga raw_* fora da allowlist. Se uma migration grant_raw_* nasce sem
// a tabela na allowlist do provision, o GRANT morre no proximo deploy e a tool
// quebra SO em producao ("Erro interno" silencioso). Este teste compara as duas
// fontes e tambem as duas secoes do provision entre si.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");

function rawsDasMigrations(): Set<string> {
  const dir = join(ROOT, "prisma", "migrations");
  const out = new Set<string>();
  for (const m of readdirSync(dir)) {
    let sql: string;
    try {
      sql = readFileSync(join(dir, m, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    for (const match of sql.matchAll(/GRANT SELECT ON (raw_[a-z_]+)/g)) {
      out.add(match[1]);
    }
  }
  return out;
}

function allowlistsDoProvision(): string[][] {
  const sql = readFileSync(join(ROOT, "prisma", "sql", "provision-mcp.sql"), "utf8");
  const blocos = [...sql.matchAll(/raw_permitidas TEXT\[\] := ARRAY\[([^\]]+)\]/g)];
  return blocos.map((b) =>
    [...b[1].matchAll(/'(raw_[a-z_]+)'/g)].map((m) => m[1]).sort(),
  );
}

describe("provision-mcp.sql , allowlist de raw_*", () => {
  it("toda migration grant_raw_* tem a tabela na allowlist do provision", () => {
    const migrations = [...rawsDasMigrations()].sort();
    const allow = new Set(allowlistsDoProvision()[0] ?? []);
    const faltando = migrations.filter((t) => !allow.has(t));
    expect(faltando).toEqual([]);
  });

  it("as duas secoes do provision (GRANT e REVOKE-exceto) usam a MESMA lista", () => {
    const listas = allowlistsDoProvision();
    expect(listas).toHaveLength(2);
    expect(listas[0]).toEqual(listas[1]);
  });
});
