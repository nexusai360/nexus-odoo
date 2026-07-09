import {
  criarRascunho,
  obterRascunho,
  atualizarRascunho,
  listarMeus,
  EtagConflitoError,
} from "./saved-report-repo";

const create = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();
const findMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    savedReport: {
      create: (...a: unknown[]) => create(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));

const fichaMinima = {
  id: "draft-1",
  titulo: "Saldo por produto",
  dominio: "estoque",
  schemaVersion: 1,
  tipo: "tela_cheia",
  parametros: [],
  secoes: [
    {
      id: "s1",
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
      filtros: [],
    },
  ],
};

beforeEach(() => {
  create.mockReset();
  findUnique.mockReset();
  update.mockReset();
  findMany.mockReset();
});

describe("saved-report-repo", () => {
  it("criarRascunho grava entry validado com o criador", async () => {
    create.mockResolvedValue({ id: "x", etag: "e1" });
    await criarRascunho("user-1", fichaMinima);
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0];
    expect(arg.data.criadoPor).toBe("user-1");
    expect(arg.data.titulo).toBe("Saldo por produto");
  });

  it("atualizarRascunho lanca EtagConflitoError quando o etag diverge", async () => {
    findUnique.mockResolvedValue({ id: "x", criadoPor: "user-1", etag: "ATUAL" });
    await expect(
      atualizarRascunho("x", "user-1", fichaMinima, "ANTIGO"),
    ).rejects.toBeInstanceOf(EtagConflitoError);
    expect(update).not.toHaveBeenCalled();
  });

  it("obterRascunho libera super_admin a ver ficha de outro dono", async () => {
    findUnique.mockResolvedValue({ id: "x", criadoPor: "outro" });
    const r = await obterRascunho("x", { userId: "eu", role: "super_admin" });
    expect(r).not.toBeNull();
  });

  it("obterRascunho nega admin comum a ver ficha de outro dono", async () => {
    findUnique.mockResolvedValue({ id: "x", criadoPor: "outro" });
    const r = await obterRascunho("x", { userId: "eu", role: "admin" });
    expect(r).toBeNull();
  });

  it("listarMeus filtra por criador quando nao e super_admin", async () => {
    findMany.mockResolvedValue([]);
    await listarMeus({ userId: "user-1", role: "admin" });
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.criadoPor).toBe("user-1");
  });
});
