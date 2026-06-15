jest.mock("./faturamento-autorizado");
import { faturamentoAutorizado } from "./faturamento-autorizado";
import { faturamentoSaida } from "./faturamento-saida";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoSaida", () => {
  it("delega para faturamentoAutorizado com os mesmos argumentos", async () => {
    (faturamentoAutorizado as jest.Mock).mockResolvedValue({ totalNotas: 5, valor: 999 });
    const prisma = {} as unknown as PrismaClient;
    const input = { periodoDe: "2026-01-01", periodoAte: "2026-01-31" };

    const r = await faturamentoSaida(prisma, input);

    expect(faturamentoAutorizado).toHaveBeenCalledWith(prisma, input);
    expect(r).toEqual({ totalNotas: 5, valor: 999 });
  });
});
