import { inboundSchema } from "./inbound-payload";

describe("inboundSchema , contrato F5.1", () => {
  const baseText = {
    wa_id: "5511965725987",
    user_id: "BR.4377207372590200",
    type: "text" as const,
    text: "qual o estoque?",
    message_id: "wamid.1",
    timestamp: 1781727884000,
  };

  it("aceita texto com os campos obrigatórios + opcionais", () => {
    const r = inboundSchema.safeParse({ ...baseText, contact_name: "Ana" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.wa_id).toBe("5511965725987");
      expect(r.data.user_id).toBe("BR.4377207372590200");
      expect(r.data.contact_name).toBe("Ana");
    }
  });

  it("exige wa_id e user_id", () => {
    expect(inboundSchema.safeParse({ ...baseText, wa_id: "" }).success).toBe(false);
    const semUser = { ...baseText } as Record<string, unknown>;
    delete semUser.user_id;
    expect(inboundSchema.safeParse(semUser).success).toBe(false);
  });

  it("exige text em type text/audio", () => {
    expect(inboundSchema.safeParse({ ...baseText, text: "" }).success).toBe(false);
    expect(
      inboundSchema.safeParse({ ...baseText, type: "audio", text: "transcrição" }).success,
    ).toBe(true);
    expect(
      inboundSchema.safeParse({ ...baseText, type: "audio", text: "" }).success,
    ).toBe(false);
  });

  it("exige media (url + mime_type) em mensagens de mídia", () => {
    const semMedia = { ...baseText, type: "image" as const, text: undefined };
    expect(inboundSchema.safeParse(semMedia).success).toBe(false);

    const comMedia = inboundSchema.safeParse({
      ...baseText,
      type: "image",
      text: undefined,
      media: { url: "https://x/y.jpg", mime_type: "image/jpeg" },
    });
    expect(comMedia.success).toBe(true);

    const mediaSemUrl = inboundSchema.safeParse({
      ...baseText,
      type: "document",
      media: { mime_type: "application/pdf" },
    });
    expect(mediaSemUrl.success).toBe(false);
  });
});
