// scripts/gen-raw-models.ts
// Imprime os 79 blocos `model Raw...` para o schema.prisma.
// Uso: npx tsx scripts/gen-raw-models.ts
import { MODEL_CATALOG, rawTableFor } from "../src/worker/catalog/model-catalog";

function pascal(table: string): string {
  return table
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

for (const { odooModel } of MODEL_CATALOG) {
  const table = rawTableFor(odooModel);
  const model = pascal(table); // raw_estoque_saldo_hoje -> RawEstoqueSaldoHoje
  console.log(`model ${model} {
  odooId        Int       @id @map("odoo_id")
  data          Json
  odooWriteDate DateTime? @map("odoo_write_date")
  syncedAt      DateTime  @default(now()) @map("synced_at")
  rawDeleted    Boolean   @default(false) @map("raw_deleted")

  @@index([odooWriteDate])
  @@index([rawDeleted])
  @@map("${table}")
}
`);
}
