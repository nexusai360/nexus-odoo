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

/**
 * T0.3 , Formatação compacta para mobile (SPEC §3.12).
 *
 * Nascem VERMELHOS: o formato atual é o verboso "- Col: val | Col: val".
 * Ficam verdes na Onda E (TE.1/TE.2). O caso da entrada fixa é o critério
 * de aceite 11 da SPEC, byte a byte.
 */
describe("formatForChannel , tabela compacta (SPEC §3.12)", () => {
  function tabela(...linhas: string[]): string {
    return linhas.join("\n");
  }

  test("caso fixo da SPEC: título + moeda sem rótulo + número com rótulo do mapa", () => {
    const entrada = tabela(
      "| Cliente          | Valor            | Notas |",
      "|---|---|---|",
      "| Jht Comercial SP | R$ 50.500.000,00 | 12    |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe(
      "- Jht Comercial SP R$ 50.500.000,00 (12 NF)",
    );
  });

  test("moeda negativa é moeda: sem rótulo e nunca truncada", () => {
    const entrada = tabela(
      "| Nome         | Saldo             |",
      "|---|---|",
      "| Fornecedor X | -R$ 1.234.567,89  |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe(
      "- Fornecedor X -R$ 1.234.567,89",
    );
  });

  test("1.2.3 não é número: entra como texto, com rótulo do cabeçalho", () => {
    const entrada = tabela(
      "| Item  | Versão |",
      "|---|---|",
      "| Motor | 1.2.3  |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe("- Motor (Versão 1.2.3)");
  });

  test("teto de 4 colunas: a 5ª e a 6ª são descartadas", () => {
    const entrada = tabela(
      "| Cliente | Valor    | Notas | Filial | Vendedor | Região |",
      "|---|---|---|---|---|---|",
      "| Acme    | R$ 10,00 | 3     | SP     | João     | Sul    |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe(
      "- Acme R$ 10,00 (3 NF) (Filial SP)",
    );
  });

  test("primeira coluna vazia: o título vem da próxima coluna não vazia", () => {
    const entrada = tabela(
      "| Código | Cliente   | Valor   |",
      "|---|---|---|",
      "|        | Beta Ltda | R$ 5,00 |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe("- Beta Ltda R$ 5,00");
  });

  test("linha toda vazia é descartada", () => {
    const entrada = tabela(
      "| A | B |",
      "|---|---|",
      "|   |   |",
      "| X | Y |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe("- X (B Y)");
  });

  test("texto longo é truncado em 24 caracteres com reticências; moeda e número nunca", () => {
    const entrada = tabela(
      "| Pedido     | Cliente                                |",
      "|---|---|",
      "| Pedido 123 | Distribuidora Nacional Equipamentos SA |",
    );
    expect(formatForChannel(entrada, "whatsapp")).toBe(
      "- Pedido 123 (Cliente Distribuidora Nacional E...)",
    );
  });
});
