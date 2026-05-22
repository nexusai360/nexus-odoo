// mcp/lib/migrations/parse-scopes.ts
// Função pura de conversão scopes (legado) → capabilities (F4 Onda 2).
// Separada de migrate-scopes.ts para permitir teste sem importar PrismaClient.

export interface NewCapabilities {
  version: 1;
  read: string[];
  write: Record<string, string[]>;
}

const KNOWN_WRITE_ACTIONS = ["create", "update", "delete", "transition"] as const;

export function parseScopes(scopes: string[]): NewCapabilities {
  const cap: NewCapabilities = { version: 1, read: [], write: {} };
  for (const s of scopes) {
    if (typeof s !== "string") continue;
    const [action, mod] = s.split(":");
    if (!action || !mod) continue;
    if (action === "read") {
      if (!cap.read.includes(mod)) cap.read.push(mod);
    } else if ((KNOWN_WRITE_ACTIONS as readonly string[]).includes(action)) {
      cap.write[mod] = Array.from(new Set([...(cap.write[mod] ?? []), action]));
    }
  }
  return cap;
}
