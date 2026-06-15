import { cadastroBuscarParceiro } from "./buscar-parceiro.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

// buscar-parceiro e a EXCECAO fuzzy: une ids de varios caminhos (nome curto +
// nome completo + documento), ordena estavel por odooId e fatia
// [offset, offset+limit) em memoria. total = tamanho do conjunto encontrado.

type Linha = {
  odooId: number;
  nome: string | null;
  documento: string | null;
  ehCliente: boolean;
  ehFornecedor: boolean;
  uf: string | null;
  cidade: string | null;
};

function makeCtx(opts: { fuzzyIds: number[]; linhas: Linha[] }): ToolHandlerCtx {
  const now = new Date("2026-06-01T12:00:00Z");

  // $queryRawUnsafe e chamado pelo fuzzySearch (camada exata): SQL com "AS id"
  // devolve os ids; SQL com COUNT devolve o total. So a busca por NOME devolve
  // ids (a por nome_completo devolve vazio), para um conjunto deterministico.
  let nameSearchDone = false;
  const queryRawUnsafe = jest.fn(async (sql: string) => {
    if (/COUNT/i.test(sql)) return [{ total: opts.fuzzyIds.length }];
    if (/AS id/i.test(sql)) {
      if (!nameSearchDone) {
        nameSearchDone = true;
        return opts.fuzzyIds.map((id) => ({ id }));
      }
      return [];
    }
    return [];
  });

  const fatoParceiro = {
    findMany: jest.fn((args: { where?: { documento?: unknown; odooId?: { in?: number[] } } }) => {
      if (args.where?.documento) return Promise.resolve([]); // sem match por documento
      const ids = args.where?.odooId?.in;
      if (ids) return Promise.resolve(opts.linhas.filter((l) => ids.includes(l.odooId)));
      return Promise.resolve([]);
    }),
  };

  const prisma = {
    fatoBuildState: {
      findMany: jest.fn().mockResolvedValue([{ fato: "fato_parceiro", ultimoBuildAt: now }]),
    },
    syncState: {
      findMany: jest.fn().mockResolvedValue([
        { model: "res.partner", lastStatus: "ok", lastSnapshotAt: null, lastIncrementalAt: now },
      ]),
    },
    fatoParceiro,
    $queryRawUnsafe: queryRawUnsafe,
  };

  return {
    prisma: prisma as never,
    user: { userId: "u1", role: "admin", domains: ["cadastros"] } as UserContext,
  };
}

function linhasDe(ids: number[]): Linha[] {
  return ids.map((id) => ({
    odooId: id,
    nome: `P${id}`,
    documento: null,
    ehCliente: true,
    ehFornecedor: false,
    uf: null,
    cidade: null,
  }));
}

describe("cadastro_buscar_parceiro , paginacao fuzzy em memoria (alavanca 2b)", () => {
  it("total = conjunto encontrado e fatia a primeira pagina ordenada por odooId", async () => {
    const ids = [30, 10, 50, 20, 40, 60, 5, 70, 15, 80, 25, 90]; // 12 ids
    const ctx = makeCtx({ fuzzyIds: ids, linhas: linhasDe(ids) });

    const r = await cadastroBuscarParceiro.handler(
      { termo: "fitness", limit: 10, offset: 0 } as never,
      ctx,
    );

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(12);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
      // ordem estavel por odooId asc; primeira pagina = 10 menores.
      expect(r.dados.linhas.map((l) => l.odooId)).toEqual([5, 10, 15, 20, 25, 30, 40, 50, 60, 70]);
    }
  });

  it("offset avanca para a segunda pagina sem sobrepor", async () => {
    const ids = [30, 10, 50, 20, 40, 60, 5, 70, 15, 80, 25, 90];
    const ctx = makeCtx({ fuzzyIds: ids, linhas: linhasDe(ids) });

    const r = await cadastroBuscarParceiro.handler(
      { termo: "fitness", limit: 10, offset: 10 } as never,
      ctx,
    );

    if (r.estado !== "preparando") {
      expect(r.dados._PAGINACAO.total).toBe(12);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
      expect(r.dados.linhas.map((l) => l.odooId)).toEqual([80, 90]);
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    const ctx = makeCtx({ fuzzyIds: ids, linhas: linhasDe(ids) });

    const r = await cadastroBuscarParceiro.handler({ termo: "fitness" } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas).toHaveLength(PAGINACAO_LIMIT_DEFAULT);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(PAGINACAO_LIMIT_DEFAULT);
    }
  });
});
