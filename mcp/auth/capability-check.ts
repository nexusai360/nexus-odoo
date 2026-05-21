// mcp/auth/capability-check.ts
// Verifica se uma ApiKey possui uma capability específica.
// Respeita addedInVersion: chaves com capabilitiesVersion inferior não enxergam
// tools adicionadas em versão posterior (versionamento de catálogo).
import type { ApiKeyContext } from "./api-key-context.js";

export type CapabilityCheck =
  | { type: "read"; module: string }
  | { type: "write"; module: string; action: string };

export interface CapabilityCheckOpts {
  /** Versão mínima de capabilitiesVersion necessária para acessar. */
  addedInVersion?: number;
}

/**
 * Retorna true se a ApiKey possui a capability solicitada.
 *
 * Regras:
 * 1. Se `addedInVersion` for informado e for maior que `ctx.capabilitiesVersion`,
 *    retorna false imediatamente (chave criada antes da tool existir).
 * 2. Para capability de leitura: verifica `ctx.capabilities.read.includes(module)`.
 * 3. Para capability de escrita: verifica `ctx.capabilities.write[module]?.includes(action)`.
 */
export function hasCapability(
  ctx: ApiKeyContext,
  capability: CapabilityCheck,
  opts: CapabilityCheckOpts = {},
): boolean {
  // Gate de versão — chave não "vê" tools adicionadas após sua criação
  if (opts.addedInVersion !== undefined && opts.addedInVersion > ctx.capabilitiesVersion) {
    return false;
  }

  if (capability.type === "read") {
    return ctx.capabilities.read.includes(capability.module);
  }

  // write
  return ctx.capabilities.write[capability.module]?.includes(capability.action) ?? false;
}
