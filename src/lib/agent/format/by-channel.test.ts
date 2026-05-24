import { formatForChannel } from "./by-channel";

describe("formatForChannel", () => {
  test("bubble passa o conteudo direto", () => {
    expect(formatForChannel("**bold**", "bubble")).toBe("**bold**");
  });

  test("whatsapp: **bold** vira *bold*", () => {
    expect(formatForChannel("Olá **mundo**!", "whatsapp")).toBe("Olá *mundo*!");
  });

  test("whatsapp: *italic* (markdown) vira _italic_", () => {
    expect(formatForChannel("é *muito* bom", "whatsapp")).toBe("é _muito_ bom");
  });

  test("whatsapp: bold preserva enquanto italic converte", () => {
    expect(formatForChannel("**negrito** e *italico*", "whatsapp")).toBe(
      "*negrito* e _italico_",
    );
  });

  test("whatsapp: ~~strike~~ vira ~strike~", () => {
    expect(formatForChannel("~~cortado~~ aqui", "whatsapp")).toBe("~cortado~ aqui");
  });

  test("whatsapp: link markdown vira texto: url", () => {
    expect(formatForChannel("Veja [aqui](https://x.com)", "whatsapp")).toBe(
      "Veja aqui: https://x.com",
    );
  });

  test("whatsapp: tabela markdown vira lista hifenizada", () => {
    const tabela = [
      "| Produto | Saldo |",
      "|---|---|",
      "| A | 10 |",
      "| B | 5 |",
    ].join("\n");
    expect(formatForChannel(tabela, "whatsapp")).toBe(
      "- Produto: A | Saldo: 10\n- Produto: B | Saldo: 5",
    );
  });

  test("whatsapp: reduz 3+ quebras consecutivas para 2", () => {
    expect(formatForChannel("a\n\n\n\nb", "whatsapp")).toBe("a\n\nb");
  });
});
