/**
 * Trava de drift: garante que BI_SCHEMA_REFERENCE está em sincronia com o
 * schema.prisma. Se um modelo Fato* for adicionado/removido/renomeado no
 * schema, este teste falha — forçando atualização da constante.
 */

import * as fs from "fs";
import * as path from "path";
import { BI_SCHEMA_REFERENCE } from "./bi-schema-reference";

function extractFatoTableNames(schemaContent: string): string[] {
  const matches = schemaContent.match(/@@map\("(fato_[^"]+)"\)/g) ?? [];
  return matches
    .map((m) => m.match(/@@map\("(fato_[^"]+)"\)/)![1])
    .filter((name) => name !== "fato_build_state") // tabela interna, não exposta no BI
    .sort();
}

describe("BI_SCHEMA_REFERENCE — trava de drift", () => {
  let schemaContent: string;
  let fatoTableNames: string[];

  beforeAll(() => {
    const schemaPath = path.resolve(
      __dirname,
      "../../../prisma/schema.prisma",
    );
    schemaContent = fs.readFileSync(schemaPath, "utf-8");
    fatoTableNames = extractFatoTableNames(schemaContent);
  });

  test("BI_SCHEMA_REFERENCE existe e não é vazio", () => {
    expect(BI_SCHEMA_REFERENCE).toBeTruthy();
    expect(BI_SCHEMA_REFERENCE.length).toBeGreaterThan(100);
  });

  test("todas as fact tables do schema estão referenciadas na constante", () => {
    for (const tableName of fatoTableNames) {
      expect(BI_SCHEMA_REFERENCE).toContain(tableName);
    }
  });

  test("nenhuma tabela fato_ obsoleta na constante (drift reverso)", () => {
    // Extrai todas as tabelas fato_ mencionadas na constante
    const inConstant =
      BI_SCHEMA_REFERENCE.match(/fato_[a-z_]+/g)?.filter(
        (v, i, a) => a.indexOf(v) === i,
      ) ?? [];

    for (const tableName of inConstant) {
      expect(fatoTableNames).toContain(tableName);
    }
  });
});
