import { mapReinfEventoRow } from "./fato-reinf-evento";

describe("mapReinfEventoRow", () => {
  it("mapeia campos reais do evento REINF", () => {
    const raw = {
      id: 5,
      chave: "ID1234567890",
      tipo: "R-4020",
      situacao: "enviado",
      protocolo_transmissao: "1.2.202605.0000001",
      empresa_id: [1, "Matrix"],
      empresa_cnpj_cpf_raiz: "12345678",
      data_evento: "2026-05-10",
      data_inicial: "2026-05-01",
      data_final: "2026-05-31",
    };
    const r = mapReinfEventoRow(raw);
    expect(r.odooId).toBe(5);
    expect(r.tipo).toBe("R-4020");
    expect(r.situacao).toBe("enviado");
    expect(r.protocoloTransmissao).toBe("1.2.202605.0000001");
    expect(r.empresaId).toBe(1);
    expect(r.empresaCnpjRaiz).toBe("12345678");
    expect(r.dataEvento).toEqual(new Date("2026-05-10"));
  });

  it("trata vazios e usa data_hora_evento como fallback", () => {
    const r = mapReinfEventoRow({
      id: 6,
      tipo: false,
      empresa_id: false,
      data_hora_evento: "2026-05-11 09:00:00",
    } as Record<string, unknown>);
    expect(r.tipo).toBeNull();
    expect(r.empresaId).toBeNull();
    expect(r.dataEvento).toEqual(new Date("2026-05-11T09:00:00"));
  });
});
