// mcp/auth/session-store.ts
// Store em memória — válido para instância única do container `mcp`.
// A F4 tem um único cliente (o agente F5) e o servidor é stateless quanto a
// conversa. Escalar para 2+ réplicas exigiria mover a sessão para Redis —
// endurecimento de F5.
import type { UserContext } from "./user-context.js";

const store = new Map<string, UserContext>();

export const sessionStore = {
  set(sessionId: string, ctx: UserContext): void {
    store.set(sessionId, ctx);
  },
  get(sessionId: string): UserContext | undefined {
    return store.get(sessionId);
  },
  delete(sessionId: string): void {
    store.delete(sessionId);
  },
};
