// src/lib/reports/local-nome.ts

export type LocalTipo = "proprio" | "demonstracao" | "virtual" | "outros";

export interface LocalNomeResult {
  rotulo: string;
  tipo: LocalTipo;
}

/**
 * Limpa e classifica o nome bruto de local vindo do Odoo.
 *
 * Formas conhecidas:
 *   - "<Empresa> - <Filial> » Próprio"  → tipo="proprio", rotulo=trecho antes de " » "
 *   - "... » Demonstração » Terceiros"  → tipo="demonstracao", rotulo fixo
 *   - "Virtual"                          → tipo="virtual", rotulo="Virtual"
 *   - qualquer outro                     → tipo="outros", rotulo truncado em 40 chars
 */
export function limparNomeLocal(raw: string): LocalNomeResult {
  if (raw.includes("» Próprio")) {
    const idx = raw.indexOf(" » ");
    const rotulo = idx !== -1 ? raw.slice(0, idx) : raw;
    return { rotulo, tipo: "proprio" };
  }
  if (raw.includes("Demonstração")) {
    return { rotulo: "Demonstração (em cliente)", tipo: "demonstracao" };
  }
  if (raw === "Virtual") {
    return { rotulo: "Virtual", tipo: "virtual" };
  }
  const rotulo = raw.length > 40 ? raw.slice(0, 40) + "…" : raw;
  return { rotulo, tipo: "outros" };
}
