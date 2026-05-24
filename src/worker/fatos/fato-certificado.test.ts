import { mapCertificadoRow } from "./fato-certificado";

describe("mapCertificadoRow", () => {
  it("mapeia o JSONB do raw para a linha tipada do fato", () => {
    const raw = {
      id: 25,
      tipo: "A1",
      numero_serie: "7286666072932397959",
      proprietario: "JMF COMERCIO",
      cnpj_cpf: "45.424.185/0001-08",
      data_inicio_validade: "2026-05-12 12:16:06",
      data_fim_validade: "2027-05-12 12:16:06",
      data_vencimento_util: "2027-05-12",
      nome_arquivo: "JMF.pfx",
    };
    const linha = mapCertificadoRow(raw);
    expect(linha.odooId).toBe(25);
    expect(linha.tipo).toBe("A1");
    expect(linha.numeroSerie).toBe("7286666072932397959");
    expect(linha.cnpjCpf).toBe("45.424.185/0001-08");
    expect(linha.dataFimValidade?.toISOString().slice(0, 10)).toBe("2027-05-12");
    expect(linha.nomeArquivo).toBe("JMF.pfx");
  });

  it("tolera campos ausentes (null)", () => {
    const linha = mapCertificadoRow({ id: 1 });
    expect(linha.odooId).toBe(1);
    expect(linha.tipo).toBeNull();
    expect(linha.dataFimValidade).toBeNull();
  });
});
