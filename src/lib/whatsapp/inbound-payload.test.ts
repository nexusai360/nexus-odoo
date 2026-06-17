import { inboundSchema } from "./inbound-payload";

describe("inboundSchema , campos novos", () => {
  const base = {
    messageId: "wamid.1",
    from: "5534999999999",
    timestamp: 1718630000000,
    type: "text",
    text: "oi",
  };

  it("aceita contactName e phoneNumberId opcionais", () => {
    const r = inboundSchema.safeParse({
      ...base,
      contactName: "Ana",
      phoneNumberId: "593237780533272",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contactName).toBe("Ana");
      expect(r.data.phoneNumberId).toBe("593237780533272");
    }
  });

  it("aceita payload sem os opcionais", () => {
    expect(inboundSchema.safeParse(base).success).toBe(true);
  });
});
