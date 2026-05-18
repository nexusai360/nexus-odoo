// mcp/auth/session-store.test.ts
import { sessionStore } from "./session-store.js";
import type { UserContext } from "./user-context.js";

const ctx: UserContext = { userId: "user-1", role: "admin", domains: ["estoque"] };

describe("sessionStore", () => {
  beforeEach(() => {
    // Reset entre testes
    sessionStore.delete("sess-1");
    sessionStore.delete("sess-2");
  });

  it("set e get devolvem o mesmo contexto", () => {
    sessionStore.set("sess-1", ctx);
    expect(sessionStore.get("sess-1")).toBe(ctx);
  });

  it("get retorna undefined para sessão inexistente", () => {
    expect(sessionStore.get("sess-2")).toBeUndefined();
  });

  it("delete remove a sessão", () => {
    sessionStore.set("sess-1", ctx);
    sessionStore.delete("sess-1");
    expect(sessionStore.get("sess-1")).toBeUndefined();
  });
});
