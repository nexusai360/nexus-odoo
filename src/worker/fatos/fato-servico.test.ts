// src/worker/fatos/fato-servico.test.ts
import { mapServicoRow } from "./fato-servico";

describe("mapServicoRow", () => {
  it("mapeia os campos do serviço", () => {
    const row = mapServicoRow({
      id: 1,
      codigo: "0101",
      codigo_formatado: "01.01",
      descricao: "Análise e desenvolvimento de sistemas",
      codigo_tributacao: "010101",
      al_inss_retido: 11,
    });
    expect(row).toEqual({
      odooId: 1,
      codigo: "0101",
      codigoFormatado: "01.01",
      descricao: "Análise e desenvolvimento de sistemas",
      codigoTributacao: "010101",
      alInssRetido: 11,
    });
  });

  it("trata campos ausentes ou false com defaults seguros", () => {
    const row = mapServicoRow({ id: 2, codigo: "0102", descricao: "Programação" });
    expect(row.codigoFormatado).toBeNull();
    expect(row.codigoTributacao).toBeNull();
    expect(row.alInssRetido).toBe(0);
  });

  it("converte false do Odoo em string vazia para campos obrigatórios", () => {
    const row = mapServicoRow({ id: 3, codigo: false, descricao: false });
    expect(row.codigo).toBe("");
    expect(row.descricao).toBe("");
  });
});
