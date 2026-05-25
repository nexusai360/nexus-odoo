import { formatCompactCount } from "./format";

describe("formatCompactCount", () => {
  it("retorna ',' para valor nulo ou invalido", () => {
    expect(formatCompactCount(null)).toBe(",");
    expect(formatCompactCount(undefined)).toBe(",");
    expect(formatCompactCount(Number.NaN)).toBe(",");
  });

  it("usa formato normal abaixo de 1 milhao", () => {
    expect(formatCompactCount(0)).toBe("0");
    expect(formatCompactCount(999_999)).toBe("999.999");
    expect(formatCompactCount(83_421)).toBe("83.421");
  });

  it("compacta com sufixo  Mi a partir de 1 milhao", () => {
    expect(formatCompactCount(1_000_000)).toBe("1,0  Mi");
    expect(formatCompactCount(83_900_000)).toBe("83,9  Mi");
    expect(formatCompactCount(83_999_999)).toBe("83,9  Mi");
    expect(formatCompactCount(999_999_999)).toBe("999,9  Mi");
  });

  it("compacta com sufixo  Bi/TRI/QUA acima de 1 bilhao", () => {
    expect(formatCompactCount(1_000_000_000)).toBe("1,0  Bi");
    expect(formatCompactCount(2_500_000_000)).toBe("2,5  Bi");
    expect(formatCompactCount(1_000_000_000_000)).toBe("1,0  Tri");
    expect(formatCompactCount(1_000_000_000_000_000)).toBe("1,0  Qua");
  });

  it("trunca em vez de arredondar para nao 'subir' a marca", () => {
    expect(formatCompactCount(1_990_000)).toBe("1,9  Mi");
    expect(formatCompactCount(1_999_999)).toBe("1,9  Mi");
  });
});
