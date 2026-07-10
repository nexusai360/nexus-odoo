/**
 * TB.1 , Modo de resposta efetivo de uma Conexão (SPEC §3.4).
 *
 * O `responseMode` passou a ser da conexão (coluna na linha inbound), com
 * fallback para o singleton global (`WhatsappChannel`) e, por fim, `direct`.
 * O backfill deixa conexões antigas com `NULL`: para elas vale o fallback.
 */
import { modoEfetivo } from "./response-mode";

describe("modoEfetivo", () => {
  it("o modo da conexão vence o singleton", () => {
    expect(modoEfetivo("n8n_webhook", "direct")).toBe("n8n_webhook");
    expect(modoEfetivo("direct", "n8n_webhook")).toBe("direct");
  });

  it("conexão sem modo (NULL do backfill) cai no singleton global", () => {
    expect(modoEfetivo(null, "n8n_webhook")).toBe("n8n_webhook");
    expect(modoEfetivo(undefined, "direct")).toBe("direct");
  });

  it("sem conexão e sem singleton, o modo é direct", () => {
    expect(modoEfetivo(null, null)).toBe("direct");
    expect(modoEfetivo(undefined, undefined)).toBe("direct");
  });
});
