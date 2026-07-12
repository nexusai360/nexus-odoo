import {
  SO_VENDA_EXTERNA,
  buildVendaExternaWhere,
  buildVendaOperacaoWhereItem,
  buildVendaOperacaoWhereNota,
  contarNotasSemOperacao,
} from "./venda";
import { buildPeriodoWhere } from "./periodo";
import type { PrismaClient } from "../../../generated/prisma/client";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

const CORTE = new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`);

function mockPrisma(notas: { vrNf: number }[]) {
  const findMany = jest.fn().mockResolvedValue(notas);
  const prisma = { fatoNotaFiscal: { findMany } } as unknown as PrismaClient;
  return { prisma, findMany };
}

/** Lista de wheres do AND (o piso do corte vive la, fora do alcance do recorte do chamador). */
function ands(findMany: jest.Mock): Record<string, unknown>[] {
  return findMany.mock.calls[0][0].where.AND as Record<string, unknown>[];
}

describe("recortes de venda", () => {
  it("SO_VENDA_EXTERNA e buildVendaExternaWhere leem a coluna materializada", () => {
    expect(SO_VENDA_EXTERNA).toEqual({ isVendaExterna: true });
    expect(buildVendaExternaWhere()).toEqual({ isVendaExterna: true });
  });

  it("o recorte no grao de item exige saida autorizada e operacao de venda", () => {
    const w = buildVendaOperacaoWhereItem();
    expect(w.entradaSaida).toBe("1");
    expect(w.situacaoNfe).toBe("autorizada");
    expect(w.AND).toHaveLength(4); // venda, nao interna, nao imobilizado, sem devolucao
  });

  it("o recorte no grao de nota tambem prende o modelo (55/65)", () => {
    expect(buildVendaOperacaoWhereNota().modelo).toEqual({ in: ["55", "65"] });
  });
});

// O parametro `recorte` tinha default {}: quem chamasse sem recorte varria as notas de saida
// autorizada de TODO o historico. Nota fiscal e documento com data, entao o piso da data de
// inicio das analises vale sempre , e agora nao depende de o chamador lembrar de mandar periodo.
describe("contarNotasSemOperacao , data de inicio das analises", () => {
  it("sem recorte: aplica o piso do corte (nao varre o historico)", async () => {
    const { prisma, findMany } = mockPrisma([{ vrNf: 100.005 }, { vrNf: 50 }]);

    const r = await contarNotasSemOperacao(prisma);

    const where = findMany.mock.calls[0][0].where;
    expect(where.operacaoNome).toBeNull();
    expect(where.modelo).toEqual({ in: ["55", "65"] });
    expect(ands(findMany)).toContainEqual({ dataEmissao: { gte: CORTE } });
    expect(r.totalNotas).toBe(2);
    expect(r.valor).toBe(150.01); // arredondado em centavos
  });

  it("com recorte de periodo: mantem o recorte E o piso (o piso nao pode ser sobrescrito)", async () => {
    const { prisma, findMany } = mockPrisma([]);

    await contarNotasSemOperacao(prisma, buildPeriodoWhere("2026-05-01", "2026-05-31"));

    const where = findMany.mock.calls[0][0].where;
    expect(where.dataEmissao).toEqual({
      gte: new Date("2026-05-01T00:00:00Z"),
      lt: new Date("2026-06-01T00:00:00Z"),
    });
    expect(ands(findMany)).toContainEqual({ dataEmissao: { gte: CORTE } });
  });

  it("recorte pre-corte (vindo cru de um chamador distraido) nao derruba o piso", async () => {
    const { prisma, findMany } = mockPrisma([]);

    await contarNotasSemOperacao(prisma, { dataEmissao: { gte: new Date("2020-01-01T00:00:00Z") } });

    // O AND com o piso continua la: a intersecao no Prisma barra o que e anterior ao corte.
    expect(ands(findMany)).toContainEqual({ dataEmissao: { gte: CORTE } });
  });

  it("recorte que ja traz AND proprio (ex.: empresa) e preservado junto do piso", async () => {
    const { prisma, findMany } = mockPrisma([]);

    await contarNotasSemOperacao(prisma, { AND: [{ empresaId: 7 }] });

    expect(ands(findMany)).toEqual([{ empresaId: 7 }, { dataEmissao: { gte: CORTE } }]);
  });
});
