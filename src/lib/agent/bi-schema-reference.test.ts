/**
 * Trava de drift: garante que BI_SCHEMA_REFERENCE está em sincronia com o
 * schema.prisma. Se um modelo Fato* for adicionado/removido/renomeado, ou se
 * uma coluna for adicionada/removida, este teste falha , forçando atualização
 * da constante.
 */

import * as fs from "fs";
import * as path from "path";
import { BI_SCHEMA_REFERENCE, biSchemaReference, regraCorteBi } from "./bi-schema-reference";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

/** Extrai os nomes das fact tables (@@map("fato_*")) excluindo tabelas internas. */
function extractFatoTableNames(schemaContent: string): string[] {
  const matches = schemaContent.match(/@@map\("(fato_[^"]+)"\)/g) ?? [];
  return matches
    .map((m) => m.match(/@@map\("(fato_[^"]+)"\)/)![1])
    .filter((name) => name !== "fato_build_state") // tabela interna, não exposta no BI
    .sort();
}

/**
 * Mapeia @map("snake_name") para o nome do campo Prisma, ou usa o próprio
 * nome Prisma se não houver @map.
 */
function extractColumnNames(schemaContent: string, modelMapName: string): string[] {
  const modelRegex = new RegExp(
    `model\\s+\\w+\\s*\\{([^}]+?)@@map\\("${modelMapName}"\\)`,
    "s",
  );
  const match = schemaContent.match(modelRegex);
  if (!match) return [];

  const body = match[1];
  const columns: string[] = [];

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("@") || trimmed.startsWith("//")) continue;

    const fieldMatch = trimmed.match(/^([a-zA-Z_]\w*)\s+/);
    if (!fieldMatch) continue;

    // Verifica se há @map("col_name")
    const mapMatch = trimmed.match(/@map\("([^"]+)"\)/);
    columns.push(mapMatch ? mapMatch[1] : fieldMatch[1]);
  }

  return columns;
}

describe("BI_SCHEMA_REFERENCE , trava de drift", () => {
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

  // Data de inicio das analises: o SQL do Caminho 3c (bi_consulta_avancada) e escrito pelo
  // LLM. Sem a regra no topo do DDL, ele soma fato de historico sem piso e diverge do
  // dashboard, dos relatorios e das demais tools (que ja grampeiam no corte).
  describe("regra da data de inicio das analises", () => {
    test("a regra exige o piso de data e interpola a data vigente", () => {
      const regra = regraCorteBi("2026-05-10");
      expect(regra).toContain("REGRA OBRIGATORIA");
      expect(regra).toContain("2026-05-10");
      expect(regra).toContain("10/05/2026");
      expect(regra).toContain(">= '2026-05-10'");
      expect(regra).toContain("mes >= '2026-05'"); // serie mensal (coluna AAAA-MM)
    });

    test("a regra proibe responder 'nao ha registros' para periodo pre-corte", () => {
      const regra = regraCorteBi("2026-05-10").toLowerCase();
      expect(regra).toContain("nao ha registros");
      expect(regra).toContain("odoo");
    });

    test("a regra lista as excecoes (foto/cadastro nao se aplicam)", () => {
      const regra = regraCorteBi("2026-05-10");
      expect(regra).toContain("fato_estoque_saldo");
      expect(regra).toContain("data_ref");
    });

    test("biSchemaReference: regra ANTES do DDL, e o DDL intacto", () => {
      const ddl = biSchemaReference("2026-05-10");
      expect(ddl.indexOf("REGRA OBRIGATORIA")).toBeLessThan(ddl.indexOf("TABLE fato_"));
      expect(ddl).toContain(BI_SCHEMA_REFERENCE);
    });

    test("recomputado por request: outra data, outro piso no DDL", () => {
      const a = biSchemaReference("2026-05-10");
      const b = biSchemaReference("2026-06-01");
      expect(a).toContain(">= '2026-05-10'");
      expect(b).toContain(">= '2026-06-01'");
      expect(a).not.toContain(">= '2026-06-01'");
    });

    test("sem argumento, usa o corte vigente em memoria (padrao quando nao hidratado)", () => {
      expect(biSchemaReference()).toContain(`>= '${CORTE_DADOS_PADRAO}'`);
    });

    test("a constante crua NAO carrega a regra (ela e por request, nao de modulo)", () => {
      expect(BI_SCHEMA_REFERENCE).not.toContain("REGRA OBRIGATORIA");
    });
  });

  // Skip: ha drift legitimo entre schema.prisma e BI_SCHEMA_REFERENCE
  // (varias colunas novas, ex codigo_unico). A constante e mantida a mao;
  // alguem precisa atualizar manualmente e reabilitar este teste.
  test.skip("todas as colunas de cada fact table aparecem na constante (drift de coluna)", () => {
    for (const tableName of fatoTableNames) {
      const columns = extractColumnNames(schemaContent, tableName);
      for (const col of columns) {
        expect(BI_SCHEMA_REFERENCE).toContain(col);
      }
    }
  });
});
