/**
 * TB.3 , Trava de número único (SPEC §3.4.1, decisão do usuário 2026-07-09).
 *
 * Um número de WhatsApp existe em UMA configuração, e só uma: ou no canal
 * direto (credenciais Meta globais) ou numa Conexão por webhook. A trava vale
 * nos dois sentidos e compara pelo número NORMALIZADO (E.164, tolerando a
 * ausência do nono dígito de celular BR), porque `business_id` é gravado cru
 * e o telefone do canal direto vem formatado da Graph API.
 */

const mockChannelFindUnique = jest.fn();
const mockWebhookFindMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    whatsappChannel: { findUnique: mockChannelFindUnique },
    whatsappWebhook: { findMany: mockWebhookFindMany },
  },
}));

import {
  verificarNumeroParaConexao,
  verificarNumeroParaCanalDireto,
} from "./numero-unico";

beforeEach(() => {
  jest.clearAllMocks();
  // Por padrão: canal direto sem telefone resolvido e nenhuma conexão.
  mockChannelFindUnique.mockResolvedValue(null);
  mockWebhookFindMany.mockResolvedValue([]);
});

describe("verificarNumeroParaConexao", () => {
  it("número livre é aceito", async () => {
    const r = await verificarNumeroParaConexao("5561995630029");
    expect(r.ok).toBe(true);
  });

  it("número inválido é recusado (fail-closed)", async () => {
    const r = await verificarNumeroParaConexao("abc");
    expect(r.ok).toBe(false);
  });

  it("número já usado pelo canal direto é recusado com a mensagem da SPEC", async () => {
    mockChannelFindUnique.mockResolvedValue({ phoneNumber: "+55 61 99563-0029" });

    const r = await verificarNumeroParaConexao("5561995630029");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("envio direto");
      expect(r.error).toContain("Remova de lá");
    }
  });

  it("número já usado por OUTRA conexão é recusado nomeando a conexão existente", async () => {
    mockWebhookFindMany.mockResolvedValue([
      { name: "Cliente B", businessId: "5534991908624", connectionId: "conn-B" },
    ]);

    const r = await verificarNumeroParaConexao("+55 34 99190-8624");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Cliente B");
  });

  it("detecta o conflito mesmo quando um lado está sem o nono dígito", async () => {
    // Gravado sem o 9 (como a Meta às vezes entrega); candidato com o 9.
    mockWebhookFindMany.mockResolvedValue([
      { name: "Cliente B", businessId: "553491908624", connectionId: "conn-B" },
    ]);

    const r = await verificarNumeroParaConexao("5534991908624");
    expect(r.ok).toBe(false);
  });

  it("a própria conexão (edição) não conflita consigo mesma", async () => {
    mockWebhookFindMany.mockResolvedValue([
      { name: "Cliente A", businessId: "5561995630029", connectionId: "conn-A" },
    ]);

    const r = await verificarNumeroParaConexao("5561995630029", {
      ignorarConnectionId: "conn-A",
    });
    expect(r.ok).toBe(true);
  });

  it("canal direto sem telefone resolvido não bloqueia por esse lado", async () => {
    mockChannelFindUnique.mockResolvedValue({ phoneNumber: null });

    const r = await verificarNumeroParaConexao("5561995630029");
    expect(r.ok).toBe(true);
  });
});

describe("verificarNumeroParaCanalDireto", () => {
  it("número livre é aceito", async () => {
    const r = await verificarNumeroParaCanalDireto("+5561995630029");
    expect(r.ok).toBe(true);
  });

  it("número inválido é recusado (fail-closed)", async () => {
    const r = await verificarNumeroParaCanalDireto("");
    expect(r.ok).toBe(false);
  });

  it("número de uma Conexão por webhook é recusado nomeando a conexão", async () => {
    mockWebhookFindMany.mockResolvedValue([
      { name: "Matrix Group", businessId: "5561995630029", connectionId: "conn-1" },
    ]);

    const r = await verificarNumeroParaCanalDireto("+55 61 99563-0029");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("Matrix Group");
      expect(r.error).toContain("conexão");
    }
  });
});
