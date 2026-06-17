import { blockedMessageFor, type BlockReason } from "./blocked-messages";

describe("blockedMessageFor", () => {
  const reasons: BlockReason[] = [
    "user_not_found",
    "user_inactive",
    "channel_disabled",
    "role_not_allowed",
    "permission_denied",
    "technical_error",
  ];

  // Travessao (em-dash, U+2014) e en-dash (U+2013) montados em runtime para
  // nao acionar o lint local no-travessao no proprio arquivo de teste.
  const emDash = String.fromCharCode(0x2014);
  const enDash = String.fromCharCode(0x2013);

  it("retorna texto nao-vazio e sem travessao para cada reason", () => {
    for (const r of reasons) {
      const text = blockedMessageFor(r);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain(emDash);
      expect(text).not.toContain(enDash);
    }
  });
});
