import { construirRelatorio, previsualizarSecoes } from "./builder";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";

const getCurrentUser = jest.fn();
const runBuilder = jest.fn();
const criarRascunho = jest.fn();
const atualizarRascunho = jest.fn();
const logAudit = jest.fn();
const resolveSecao = jest.fn();

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
jest.mock("@/lib/reports/builder/agent/run-builder", () => ({
  runBuilder: (...a: unknown[]) => runBuilder(...a),
}));
jest.mock("@/lib/reports/builder/saved-report-repo", () => ({
  criarRascunho: (...a: unknown[]) => criarRascunho(...a),
  atualizarRascunho: (...a: unknown[]) => atualizarRascunho(...a),
}));
jest.mock("@/lib/audit", () => ({ logAudit: (...a: unknown[]) => logAudit(...a) }));
jest.mock("@/lib/reports/builder/resolve-source", () => ({
  resolveSecao: (...a: unknown[]) => resolveSecao(...a),
}));

const ADMIN = { id: "11111111-1111-1111-1111-111111111111", platformRole: "admin" };
const VIEWER = { id: "22222222-2222-2222-2222-222222222222", platformRole: "viewer" };

const FICHA_VALIDA: BuilderReportEntry = {
  id: "rascunho",
  titulo: "Estoque por armazem",
  dominio: "estoque",
  schemaVersion: 1,
  tipo: "tela_cheia",
  parametros: [],
  secoes: [
    {
      id: "secao-1",
      template: "DataTable",
      fato: "fato_estoque_saldo",
      shapeDerivado: "tabela",
      config: {},
      filtros: [],
    },
  ],
};

beforeEach(() => {
  getCurrentUser.mockReset();
  runBuilder.mockReset();
  criarRascunho.mockReset();
  atualizarRascunho.mockReset();
  logAudit.mockReset();
  resolveSecao.mockReset();
});

describe("construirRelatorio , gate", () => {
  it("nega quem nao e admin/super_admin e nao roda o agente", async () => {
    getCurrentUser.mockResolvedValue(VIEWER);
    const r = await construirRelatorio({ prompt: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/negado/i);
    expect(runBuilder).not.toHaveBeenCalled();
  });
});

describe("construirRelatorio , caminho feliz", () => {
  it("admin gera ficha, persiste rascunho novo e registra auditoria", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    runBuilder.mockResolvedValue({ ficha: FICHA_VALIDA, mensagem: "Pronto." });
    criarRascunho.mockResolvedValue({ id: "sr1", etag: "e1" });
    const r = await construirRelatorio({ prompt: "estoque por armazem" });
    expect(r.ok).toBe(true);
    expect(r.savedId).toBe("sr1");
    expect(r.etag).toBe("e1");
    expect(r.mensagem).toBe("Pronto.");
    expect(criarRascunho).toHaveBeenCalledWith(ADMIN.id, FICHA_VALIDA);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect((logAudit.mock.calls[0][0] as { action: string }).action).toBe("report_preset_created");
  });

  it("atualiza um rascunho existente quando recebe savedId+etag", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    runBuilder.mockResolvedValue({ ficha: FICHA_VALIDA, mensagem: "Atualizado." });
    atualizarRascunho.mockResolvedValue({ id: "sr1", etag: "e2" });
    const r = await construirRelatorio({ prompt: "muda", savedId: "sr1", etag: "e1" });
    expect(r.ok).toBe(true);
    expect(r.savedId).toBe("sr1");
    expect(r.etag).toBe("e2");
    expect(atualizarRascunho).toHaveBeenCalledWith("sr1", ADMIN.id, FICHA_VALIDA, "e1");
    expect(criarRascunho).not.toHaveBeenCalled();
  });
});

describe("construirRelatorio , recusa e bloqueio nao persistem", () => {
  it("recusa honesta devolve recusa e nao persiste", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    runBuilder.mockResolvedValue({ ficha: null, mensagem: "Sem fonte.", recusa: true });
    const r = await construirRelatorio({ prompt: "faturamento por vendedor" });
    expect(r.recusa).toBe(true);
    expect(criarRascunho).not.toHaveBeenCalled();
  });

  it("teto de quota devolve bloqueado e nao persiste", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    runBuilder.mockResolvedValue({ ficha: null, mensagem: "Teto atingido.", bloqueado: true });
    const r = await construirRelatorio({ prompt: "x" });
    expect(r.bloqueado).toBe(true);
    expect(r.ok).toBe(false);
    expect(criarRascunho).not.toHaveBeenCalled();
  });
});

describe("previsualizarSecoes", () => {
  it("nega quem nao e admin/super_admin", async () => {
    getCurrentUser.mockResolvedValue(VIEWER);
    const r = await previsualizarSecoes(FICHA_VALIDA);
    expect(r.tipo).toBe("negado");
    expect(resolveSecao).not.toHaveBeenCalled();
  });

  it("resolve cada secao de uma ficha valida sem persistir", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    resolveSecao.mockResolvedValue({ estado: "ok", dado: { colunas: [], linhas: [] } });
    const r = await previsualizarSecoes(FICHA_VALIDA);
    expect(r.tipo).toBe("ok");
    if (r.tipo === "ok") expect(r.dados["secao-1"].estado).toBe("ok");
    expect(resolveSecao).toHaveBeenCalledTimes(1);
  });

  it("sinaliza ficha invalida", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    const r = await previsualizarSecoes({ ...FICHA_VALIDA, titulo: "" });
    expect(r.tipo).toBe("invalida");
  });
});
