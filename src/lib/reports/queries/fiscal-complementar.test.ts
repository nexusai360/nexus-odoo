// src/lib/reports/queries/fiscal-complementar.test.ts
import {
  queryCertificados,
  queryApuracaoFiscal,
  queryCartaCorrecao,
  queryMdfeManifestos,
  queryReinfEventos,
} from "./fiscal-complementar";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

/** Piso vigente nos testes: ninguem chama getCorteDados, entao vale o padrao em memoria. */
const PISO = new Date(`${CORTE_DADOS_PADRAO}T00:00:00Z`);

describe("queryCertificados", () => {
  it("lista certificados ordenados por validade (mais próximo de vencer primeiro)", async () => {
    const mockPrisma = {
      fatoCertificado: {
        findMany: jest.fn().mockResolvedValue([
          {
            odooId: 25,
            tipo: "A1",
            numeroSerie: "72866",
            proprietario: "JMF",
            cnpjCpf: "45.424.185/0001-08",
            dataInicioValidade: new Date("2026-05-12T12:16:06"),
            dataFimValidade: new Date("2027-05-12T12:16:06"),
            dataVencimentoUtil: new Date("2027-05-12T00:00:00"),
            nomeArquivo: "JMF.pfx",
            atualizadoEm: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Parameters<typeof queryCertificados>[0];

    const result = await queryCertificados(mockPrisma);
    expect(result.total).toBe(1);
    expect(result.linhas[0]?.proprietario).toBe("JMF");
    expect(result.linhas[0]?.dataFimValidade).toBe("2027-05-12");
    const call = (mockPrisma.fatoCertificado.findMany as jest.Mock).mock.calls[0][0];
    // Alavanca 2b: orderBy estavel com desempate por odooId.
    expect(call.orderBy).toEqual([{ dataFimValidade: "asc" }, { odooId: "asc" }]);
  });

  it("tolera datas nulas", async () => {
    const mockPrisma = {
      fatoCertificado: {
        findMany: jest.fn().mockResolvedValue([
          {
            odooId: 1, tipo: null, numeroSerie: null, proprietario: null,
            cnpjCpf: null, dataInicioValidade: null, dataFimValidade: null,
            dataVencimentoUtil: null, nomeArquivo: null, atualizadoEm: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as unknown as Parameters<typeof queryCertificados>[0];

    const result = await queryCertificados(mockPrisma);
    expect(result.linhas[0]?.dataFimValidade).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Data de inicio das analises (AppSetting sync.corte_dados)
//
// Apuracao, carta de correcao, MDF-e e REINF sao documentos/eventos fiscais datados:
// HISTORICO, respeitam o piso. Certificado digital e CADASTRO (credencial vigente): nao filtra.
// ---------------------------------------------------------------------------

describe("fiscal-complementar , data de inicio das analises", () => {
  it("queryApuracaoFiscal sem periodo aplica o piso do corte (antes: NENHUM filtro de data)", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoApuracao: { findMany, count } } as unknown as Parameters<typeof queryApuracaoFiscal>[0];

    await queryApuracaoFiscal(prisma, {});
    // O piso incide em dataFinal: a competencia que CRUZA o corte continua aparecendo,
    // e as competencias inteiramente anteriores ficam de fora.
    expect(findMany.mock.calls[0][0].where.dataFinal.gte).toEqual(PISO);
    expect(count.mock.calls[0][0].where.dataFinal.gte).toEqual(PISO);
  });

  it("queryApuracaoFiscal preserva o filtro de tipo junto com o piso", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoApuracao: { findMany, count } } as unknown as Parameters<typeof queryApuracaoFiscal>[0];

    await queryApuracaoFiscal(prisma, { tipo: "ICMS-IPI", periodoDe: "2019-01-01", periodoAte: "2026-06-30" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.tipo).toBe("ICMS-IPI");
    expect(where.dataFinal).toEqual({ gte: PISO, lt: new Date("2026-07-01T00:00:00Z") });
  });

  it("queryCartaCorrecao sem documentoId (lista historica) aplica o piso do corte", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoCartaCorrecao: { findMany, count } } as unknown as Parameters<typeof queryCartaCorrecao>[0];

    await queryCartaCorrecao(prisma, {});
    expect(findMany.mock.calls[0][0].where.dataAutorizacao.gte).toEqual(PISO);
  });

  it("queryCartaCorrecao com documentoId e drill-down: nao filtra por data", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoCartaCorrecao: { findMany, count } } as unknown as Parameters<typeof queryCartaCorrecao>[0];

    await queryCartaCorrecao(prisma, { documentoId: 77 });
    const where = findMany.mock.calls[0][0].where;
    expect(where.documentoId).toBe(77);
    expect(where.dataAutorizacao).toBeUndefined();
  });

  it("queryMdfeManifestos sem periodo aplica o piso do corte", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoMdfe: { findMany, count } } as unknown as Parameters<typeof queryMdfeManifestos>[0];

    await queryMdfeManifestos(prisma, {});
    expect(findMany.mock.calls[0][0].where.dataEmissao.gte).toEqual(PISO);
  });

  it("queryMdfeManifestos grampeia periodo anterior ao corte e preserva situacao", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoMdfe: { findMany, count } } as unknown as Parameters<typeof queryMdfeManifestos>[0];

    await queryMdfeManifestos(prisma, { periodoDe: "2024-01-01", periodoAte: "2026-05-31", situacao: "autorizado" });
    const where = findMany.mock.calls[0][0].where;
    expect(where.situacaoMdfe).toBe("autorizado");
    expect(where.dataEmissao).toEqual({ gte: PISO, lt: new Date("2026-06-01T00:00:00Z") });
  });

  it("queryReinfEventos sem periodo aplica o piso do corte", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoReinfEvento: { findMany, count } } as unknown as Parameters<typeof queryReinfEventos>[0];

    await queryReinfEventos(prisma, {});
    expect(findMany.mock.calls[0][0].where.dataEvento.gte).toEqual(PISO);
  });

  it("queryCertificados NAO filtra por data (certificado e cadastro)", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = { fatoCertificado: { findMany, count } } as unknown as Parameters<typeof queryCertificados>[0];

    await queryCertificados(prisma, {});
    expect(findMany.mock.calls[0][0].where).toBeUndefined();
  });
});
