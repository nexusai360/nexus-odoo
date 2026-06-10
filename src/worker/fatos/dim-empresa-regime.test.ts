import { mapearRegimePorRaiz } from "./dim-empresa-regime";

// Linhas no shape do Odoo (company_id = [id, label] com CNPJ no label).
const row = (id: number, regime: string | false, label: string | false) => ({
  id,
  regime_tributario: regime,
  company_id: label === false ? (false as const) : ([id, label] as [number, string]),
});

describe("mapearRegimePorRaiz", () => {
  it("mapeia raiz->regime com o dado real da discovery", () => {
    const regs = [
      row(4, "3.1", "Jds Comércio - Matriz DF 18.282.961/0001-00"),
      row(6, "3.1", "Jds Comércio - Filial SE 18.282.961/0004-44"), // filial herda
      row(8, "3.1", "Jht SP Comércio - Matriz DF 34.161.829/0001-98"),
      row(2, "3", "Jht DF Comércio - Matriz DF 10.557.556/0001-37"),
      row(14, "3", "Cs Comércio - Matriz DF 35.156.509/0001-02"),
      row(17, "3", "Ijht Premium Car - Matriz DF 62.673.999/0001-97"),
      row(1, "1", "JHT Brasília - Matriz DF 07.390.039/0001-01"),
      row(7, "1", "Jib DF Comércio - Matriz DF 33.718.546/0001-31"),
      row(16, "1", "Jmf Comércio - Matriz DF 45.424.185/0001-08"),
      row(13, "1", "Ks Comércio - Matriz DF 34.461.908/0001-14"),
    ];
    const m = mapearRegimePorRaiz(regs);
    expect(m.get("18282961")).toBe("3.1"); // Jds = Lucro Real
    expect(m.get("34161829")).toBe("3.1"); // Jht SP = Lucro Real
    expect(m.get("10557556")).toBe("3"); // Jht DF = Presumido
    expect(m.get("62673999")).toBe("3"); // Ijht = Presumido
    expect(m.get("07390039")).toBe("1"); // JHT Brasília = Simples
    expect(m.get("45424185")).toBe("1"); // Jmf = Simples
    expect(m.size).toBe(9); // 9 raizes distintas
  });

  it("GOLDEN: Cs Comércio => Presumido (3), apesar de ter anexo Simples preenchido", () => {
    // Regressao: confiar em regime_tributario, NUNCA inferir Simples pelo anexo.
    const m = mapearRegimePorRaiz([row(14, "3", "Cs Comércio - Matriz DF 35.156.509/0001-02")]);
    expect(m.get("35156509")).toBe("3");
  });

  it("filiais de uma raiz herdam o mesmo regime (sem colisao)", () => {
    const m = mapearRegimePorRaiz([
      row(2, "3", "Jht DF Comércio - Matriz DF 10.557.556/0001-37"),
      row(3, "3", "Jht DF Comércio - Filial SE 10.557.556/0003-07"),
    ]);
    expect(m.get("10557556")).toBe("3");
    expect(m.size).toBe(1);
  });

  it("FALHA ALTO se a mesma raiz tem regimes divergentes", () => {
    expect(() =>
      mapearRegimePorRaiz([
        row(2, "3", "Jht DF Comércio - Matriz DF 10.557.556/0001-37"),
        row(3, "1", "Jht DF Comércio - Filial SE 10.557.556/0003-07"),
      ]),
    ).toThrow(/regimes divergentes/);
  });

  it("ignora linha sem regime, sem company_id, ou com CNPJ nao parseavel", () => {
    const m = mapearRegimePorRaiz([
      row(1, false, "JHT Brasília - Matriz DF 07.390.039/0001-01"), // sem regime
      row(2, "3", false), // sem company_id
      row(3, "3", "Razao sem padrao de nota"), // nao parseavel
    ]);
    expect(m.size).toBe(0);
  });
});
