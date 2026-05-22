/**
 * Gera src/lib/mcp-catalog-snapshot.json a partir do catálogo de tools do MCP.
 *
 * O painel de Documentação do Servidor MCP precisa listar as tools sem depender
 * do container `mcp` estar no ar (em dev ele não roda). Este script serializa o
 * catálogo (apenas metadados, sem handlers nem Zod) para um JSON in-app que a
 * Server Action `getMcpCatalogSchema` lê diretamente.
 *
 * Roda com tsx (resolve os imports `.js` -> `.ts` do código do container mcp/).
 * Regenerar sempre que tools forem adicionadas/alteradas: `npm run gen:mcp-catalog`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalogo } from "../mcp/catalog/index.js";
import { serializeCatalog } from "../mcp/catalog/schema-endpoint.js";

const payload = serializeCatalog(catalogo);
const outPath = join(process.cwd(), "src/lib/mcp-catalog-snapshot.json");
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Catálogo MCP serializado: ${payload.count} tools -> ${outPath}`);
