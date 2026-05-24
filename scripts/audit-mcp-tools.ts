/**
 * scripts/audit-mcp-tools.ts
 *
 * Verifica que toda tool definida em mcp/tools/<dom>/*.ts esta exportada
 * no index.ts do dominio. Reporta arquivos orfaos.
 *
 * Heuristica: arquivos .ts (exceto index.ts e *.test.ts e em __tests__/)
 * que contem `export const <X>` cujo nome aparece no index correspondente.
 *
 * Uso: pnpm audit:tools
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, relative } from "node:path";

const ROOT = join(process.cwd(), "mcp", "tools");
const IGNORE_DIR = new Set(["__tests__", "__mocks__", "fixtures"]);
const IGNORE_FILE_RE = /^(index|.*\.test)\.ts$/;

interface Finding {
  module: string;
  file: string;
  exportName: string;
  reason: string;
}

function listToolFiles(domainDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(domainDir)) {
    const full = join(domainDir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (IGNORE_DIR.has(entry)) continue;
      // recurse 1 nivel se houver subpastas (none today)
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    if (IGNORE_FILE_RE.test(entry)) continue;
    out.push(full);
  }
  return out.sort();
}

function extractToolExportNames(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const names: string[] = [];
  // padrao: export const <name>: <Type> = { ... }
  const re = /export\s+const\s+([a-zA-Z_$][\w$]*)\s*:\s*(?:WriteToolEntry|ToolEntry)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function main(): void {
  const findings: Finding[] = [];
  const domains = readdirSync(ROOT).filter(
    (d) => statSync(join(ROOT, d)).isDirectory(),
  );

  for (const domain of domains) {
    const domainDir = join(ROOT, domain);
    const indexPath = join(domainDir, "index.ts");
    let indexContent = "";
    try {
      indexContent = readFileSync(indexPath, "utf-8");
    } catch {
      findings.push({
        module: domain,
        file: relative(process.cwd(), indexPath),
        exportName: "",
        reason: "index.ts ausente no dominio",
      });
      continue;
    }

    const files = listToolFiles(domainDir);
    for (const file of files) {
      const names = extractToolExportNames(file);
      if (names.length === 0) continue; // helper, ignora
      for (const name of names) {
        if (!indexContent.includes(name)) {
          findings.push({
            module: domain,
            file: relative(process.cwd(), file),
            exportName: name,
            reason: "export nao referenciado no index.ts do dominio",
          });
        }
      }
    }
  }

  if (findings.length === 0) {
    const total = domains
      .map((d) => listToolFiles(join(ROOT, d)).length)
      .reduce((a, b) => a + b, 0);
    console.log(`[audit-mcp-tools] OK: ${domains.length} dominios, ${total} arquivos varridos, 0 orfas.`);
    process.exit(0);
  }

  console.error(`[audit-mcp-tools] FOUND ${findings.length} orfas:`);
  for (const f of findings) {
    console.error(`  - ${f.module}/${basename(f.file)} :: ${f.exportName} (${f.reason})`);
  }
  process.exit(1);
}

main();
