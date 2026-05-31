import { mapMdfeRow } from "./fato-mdfe";

describe("mapMdfeRow", () => {
  it("mapeia campos reais do MDF-e (numero float, M2O municipio, monetarios)", () => {
    const raw = {
      id: 10,
      chave: "52250100000000000000580010000000011000000017",
      numero: 11, // float no Odoo
      situacao_mdfe: "autorizado",
      situacao_fiscal: "regular",
      tipo_emissao_mdfe: "normal",
      empresa_id: [1, "Matrix"],
      empresa_cnpj_cpf: "12.345.678/0001-90",
      data_emissao: "2026-05-01",
      data_autorizacao: "2026-05-01 10:00:00",
      protocolo_autorizacao: "352260000000017",
      municipio_carregamento_id: [3550308, "São Paulo"],
      municipio_descarregamento_id: [3304557, "Rio de Janeiro"],
      peso_bruto: 1500.5,
      peso_carga: 25000,
      vr_nf: 30000,
    };
    const r = mapMdfeRow(raw);
    expect(r.odooId).toBe(10);
    expect(r.numero).toBe("11");
    expect(r.situacaoMdfe).toBe("autorizado");
    expect(r.empresaId).toBe(1);
    expect(r.municipioCarregamento).toBe("São Paulo");
    expect(r.municipioDescarregamento).toBe("Rio de Janeiro");
    expect(r.pesoBruto).toBe(1500.5);
    expect(r.vrNf).toBe(30000);
    expect(r.dataAutorizacao).toEqual(new Date("2026-05-01T10:00:00"));
  });

  it("trata false/ausente como null/0 e usa data_hora como fallback", () => {
    const r = mapMdfeRow({
      id: 2,
      chave: false,
      numero: false,
      empresa_id: false,
      municipio_carregamento_id: false,
      peso_bruto: false,
      vr_nf: false,
      data_hora_emissao: "2026-05-02 08:00:00",
    } as Record<string, unknown>);
    expect(r.chave).toBeNull();
    expect(r.numero).toBeNull();
    expect(r.empresaId).toBeNull();
    expect(r.municipioCarregamento).toBeNull();
    expect(r.pesoBruto).toBe(0);
    expect(r.vrNf).toBe(0);
    expect(r.dataEmissao).toEqual(new Date("2026-05-02T08:00:00"));
  });
});
