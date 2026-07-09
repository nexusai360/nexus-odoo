import {
  kindsVisiveis,
  podeGerenciarWhatsappWebhook,
  podeGerenciarWebhooks,
} from "./webhook-permissions";

describe("podeGerenciarWhatsappWebhook", () => {
  it("o receptor de WhatsApp e exclusivo do super_admin", () => {
    expect(podeGerenciarWhatsappWebhook("super_admin")).toBe(true);
    expect(podeGerenciarWhatsappWebhook("admin")).toBe(false);
    expect(podeGerenciarWhatsappWebhook("manager")).toBe(false);
    expect(podeGerenciarWhatsappWebhook("viewer")).toBe(false);
  });
});

describe("kindsVisiveis , os cards do passo 1 do assistente", () => {
  it("super_admin ve os tres tipos", () => {
    expect(kindsVisiveis("super_admin")).toEqual(["whatsapp", "inbound_generic", "outbound"]);
  });

  it("os demais perfis nao veem o tipo WhatsApp", () => {
    for (const role of ["admin", "manager", "viewer"] as const) {
      expect(kindsVisiveis(role)).toEqual(["inbound_generic", "outbound"]);
      expect(kindsVisiveis(role)).not.toContain("whatsapp");
    }
  });
});

// Quem gerencia webhooks e quem enxerga o menu Integracoes (nivel configurado em
// Configuracao). O tipo WhatsApp e a excecao: sempre super_admin.
describe("podeGerenciarWebhooks", () => {
  it("segue o nivel do menu Integracoes para webhooks comuns", () => {
    expect(podeGerenciarWebhooks("admin", "super_admin", false)).toBe(false);
    expect(podeGerenciarWebhooks("admin", "admin", false)).toBe(true);
    expect(podeGerenciarWebhooks("manager", "manager", false)).toBe(true);
    expect(podeGerenciarWebhooks("viewer", "manager", false)).toBe(false);
  });

  it("menu desativado: so o super_admin passa", () => {
    expect(podeGerenciarWebhooks("admin", "off", false)).toBe(false);
    expect(podeGerenciarWebhooks("super_admin", "off", false)).toBe(true);
  });

  it("webhook de WhatsApp exige super_admin, mesmo com o menu liberado", () => {
    expect(podeGerenciarWebhooks("admin", "admin", true)).toBe(false);
    expect(podeGerenciarWebhooks("manager", "viewer", true)).toBe(false);
    expect(podeGerenciarWebhooks("super_admin", "admin", true)).toBe(true);
  });
});
