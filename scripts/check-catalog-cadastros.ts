// scripts/check-catalog-cadastros.ts
// Sanity check rapido: serializa o catalogo e mostra as tools de cadastros
// que vao renderizar na pagina /integracoes/servidor-mcp/docs.
import { catalogo } from "../mcp/catalog/index.js";
import { serializeCatalog } from "../mcp/catalog/schema-endpoint.js";
import type { WriteToolEntry, ToolEntry } from "../mcp/catalog/types.js";

const result = serializeCatalog(catalogo as ReadonlyArray<ToolEntry | WriteToolEntry>);
const cads = result.tools.filter((t) => t.module === "cadastros");
const reads = cads.filter((t) => t.operation === "read");
const writes = cads.filter((t) => t.operation === "write");

console.log("Total catalogo:", result.count);
console.log(`Cadastros: ${cads.length} (${reads.length} reads + ${writes.length} writes)`);
console.log("");
console.log("Writes detail:");
writes.forEach((t) => {
  console.log(`  [${t.operation}] ${t.id}`);
  console.log(`    capability: ${t.capability}`);
  console.log(`    sensitive:  ${t.sensitive}`);
  console.log(`    examples:   ${t.examples.length} (${t.examples.map((e) => e.language).join(", ")})`);
  console.log(`    args:       ${t.inputSchemaKeys.join(", ")}`);
});
