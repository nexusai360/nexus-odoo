/**
 * Testes do endpoint SSE /api/builder/stream (F6, chat = Nex).
 */
jest.mock("server-only", () => ({}));

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    builderConversation: { findUnique: jest.fn(), update: jest.fn() },
    savedReport: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/reports/builder/agent/run-builder", () => ({
  runBuilder: jest.fn(),
}));
jest.mock("@/lib/reports/builder/saved-report-repo", () => ({
  criarRascunho: jest.fn(),
  atualizarRascunho: jest.fn(),
  EtagConflitoError: class EtagConflitoError extends Error {},
}));
jest.mock("@/lib/reports/builder/agent/geracao/pipeline", () => ({
  pipelineGeracao: jest.fn(),
}));
jest.mock("@/lib/reports/builder/agent/quota", () => ({
  verificarQuota: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock("@/lib/reports/builder/builder-conversation-repo", () => ({
  criarBuilderConversa: jest.fn(),
  assertBuilderConversaOwned: jest.fn(),
  persistBuilderMensagem: jest.fn(),
  setBuilderSavedReport: jest.fn(),
  carregarBuilderMensagens: jest.fn(),
}));

const { getCurrentUser } = jest.requireMock("@/lib/auth");
const { prisma } = jest.requireMock("@/lib/prisma");
const { runBuilder } = jest.requireMock("@/lib/reports/builder/agent/run-builder");
const { criarRascunho } = jest.requireMock("@/lib/reports/builder/saved-report-repo");
const { pipelineGeracao } = jest.requireMock("@/lib/reports/builder/agent/geracao/pipeline");
const repo = jest.requireMock("@/lib/reports/builder/builder-conversation-repo");

/** journeyState elegivel por evidencia (intencao cobre o nucleo). */
const JS_ELEGIVEL = {
  fase: "entrevista",
  turnosUsuario: 2,
  dimensoesTocadas: {},
  entendimento: "quero ver o saldo por armazem para repor o estoque",
  dimensoesRelevantes: ["objetivo", "dados", "visualizacao", "indicadores"],
  intencao: {
    secoes: [
      { fato: "fato_estoque_saldo", template: "KPIRow" },
      { fato: "fato_estoque_saldo", template: "BarChart" },
    ],
  },
};
const FICHA_GERADA = {
  id: "g", titulo: "Estoque por armazem", dominio: "estoque", schemaVersion: 1,
  tipo: "tela_cheia", parametros: [],
  secoes: [{ id: "s0", template: "BarChart", fato: "fato_estoque_saldo", shapeDerivado: "agregacaoCategorica", config: {}, filtros: [] }],
};

import { POST } from "./route";

const ADMIN = { id: "u-admin", platformRole: "admin" };

function reqBody(body: unknown) {
  return new Request("http://localhost/api/builder/stream", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function collectSSE(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
  }
  return buf
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

beforeEach(() => {
  jest.clearAllMocks();
  repo.persistBuilderMensagem.mockResolvedValue("msg-id");
  repo.carregarBuilderMensagens.mockResolvedValue([]);
  prisma.builderConversation.update.mockResolvedValue({});
});

describe("POST /api/builder/stream", () => {
  it("401 sem autenticacao", async () => {
    getCurrentUser.mockResolvedValue(null);
    const res = await POST(reqBody({ message: "x" }));
    expect(res.status).toBe(401);
  });

  it("403 para viewer", async () => {
    getCurrentUser.mockResolvedValue({ id: "v", platformRole: "viewer" });
    const res = await POST(reqBody({ message: "x" }));
    expect(res.status).toBe(403);
  });

  it("400 quando message ausente", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    const res = await POST(reqBody({}));
    expect(res.status).toBe(400);
  });

  it("turno de refino: anima tools e emite done com savedId/ficha (trilha re-derivada)", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    // Conversa existente legado (com SavedReport) entra como REFINO , o unico
    // modo que promove a ficha a SavedReport (a jornada so promove no Gerar).
    prisma.builderConversation.findUnique.mockResolvedValue({ savedReportId: "sr-old", journeyState: null });
    prisma.savedReport.findUnique.mockResolvedValue(null); // forca o caminho criarRascunho
    criarRascunho.mockResolvedValue({ id: "sr-1", etag: "etag-1" });
    const ficha = { titulo: "Estoque por armazem", tipo: "tela_cheia", schemaVersion: 1, secoes: [{}] };
    runBuilder.mockImplementation(
      async ({ onEvent }: { onEvent?: (e: unknown) => void }) => {
        onEvent?.({ type: "tool_call", toolName: "criar_relatorio", label: "Criando o relatorio", toolCallId: "a" });
        onEvent?.({ type: "tool_result", toolName: "criar_relatorio", label: "Criando o relatorio", toolCallId: "a" });
        return {
          ficha,
          mensagem: "Pronto, montei.",
          toolsCalled: [{ label: "Criando o relatorio" }],
          reasoningMs: 1234,
        };
      },
    );

    const res = await POST(reqBody({ message: "estoque por armazem", conversationId: "conv-1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const evts = await collectSSE(res.body as ReadableStream<Uint8Array>);
    const types = evts.map((e) => e.type);
    expect(types).toEqual(["status", "tool_call", "tool_result", "done"]);

    const done = evts.find((e) => e.type === "done")!;
    expect(done.conversationId).toBe("conv-1");
    expect(done.message).toBe("Pronto, montei.");
    expect(done.savedId).toBe("sr-1");
    expect(done.etag).toBe("etag-1");
    // A trilha persistida e RE-DERIVADA dos toolNames (dedupe + plural),
    // entao vem com acento do mapa real, mesmo que o mock use label sem acento.
    expect(done.steps).toEqual([{ label: "Criando o relatório" }]);
    expect(done.durationMs).toBe(1234);
    expect((done.ficha as { titulo: string }).titulo).toBe("Estoque por armazem");

    // Persistiu user + assistant; vinculou a ficha a conversa.
    expect(repo.persistBuilderMensagem).toHaveBeenCalledTimes(2);
    expect(repo.setBuilderSavedReport).toHaveBeenCalledWith("conv-1", "sr-1");
  });

  it("recusa honesta: emite done com recusa e NAO persiste ficha", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    repo.criarBuilderConversa.mockResolvedValue({ id: "conv-2" });
    runBuilder.mockResolvedValue({
      ficha: null,
      mensagem: "Esse dado ainda nao tem fonte.",
      recusa: true,
      toolsCalled: [],
      reasoningMs: 50,
    });

    const res = await POST(reqBody({ message: "faturamento por vendedor" }));
    const evts = await collectSSE(res.body as ReadableStream<Uint8Array>);
    const done = evts.find((e) => e.type === "done")!;
    expect(done.recusa).toBe(true);
    expect(done.savedId).toBeUndefined();
    expect(criarRascunho).not.toHaveBeenCalled();
  });

  it("turno de brainstorm (jornada) emite evento roteiro com total/respondidas", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    repo.criarBuilderConversa.mockResolvedValue({ id: "conv-3" });
    runBuilder.mockResolvedValue({
      ficha: null,
      mensagem: "o que voce quer ver?",
      toolsCalled: [],
      reasoningMs: 20,
    });

    const res = await POST(reqBody({ message: "quero um relatorio de estoque" }));
    const evts = await collectSSE(res.body as ReadableStream<Uint8Array>);
    const roteiro = evts.find((e) => e.type === "roteiro");
    expect(roteiro).toBeDefined();
    expect(roteiro!.total).toBeGreaterThanOrEqual(4);
    expect(typeof roteiro!.respondidas).toBe("number");
  });

  it("acao gerar ELEGIVEL roda o pipeline (progress + done com omitidos) e NAO usa runBuilder", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    prisma.builderConversation.findUnique.mockResolvedValue({ savedReportId: null, journeyState: JS_ELEGIVEL });
    criarRascunho.mockResolvedValue({ id: "sr-g", etag: "etag-g" });
    pipelineGeracao.mockImplementation(async (_entrada: unknown, onProgresso: (p: unknown) => void) => {
      onProgresso({ fase: "blueprint", pct: 10, frase: "montando" });
      onProgresso({ fase: "validacao", pct: 100, frase: "finalizando" });
      return { ficha: FICHA_GERADA, omitidos: ["LineChart sobre vendas"], blueprint: { titulo: "t", objetivo: "o", secoes: [] } };
    });

    const res = await POST(reqBody({ message: "gerar", conversationId: "conv-g", acao: "gerar" }));
    const evts = await collectSSE(res.body as ReadableStream<Uint8Array>);

    expect(pipelineGeracao).toHaveBeenCalled();
    expect(runBuilder).not.toHaveBeenCalled();
    expect(evts.some((e) => e.type === "progress")).toBe(true);
    const done = evts.find((e) => e.type === "done")!;
    expect(done.savedId).toBe("sr-g");
    expect(done.omitidos).toEqual(["LineChart sobre vendas"]);
    expect((done.journeyState as { fase: string }).fase).toBe("refino");
  });

  it("acao gerar SEM elegibilidade nao roda o pipeline (cai no turno normal)", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    repo.criarBuilderConversa.mockResolvedValue({ id: "conv-x" });
    runBuilder.mockResolvedValue({ ficha: null, mensagem: "ainda preciso entender", toolsCalled: [], reasoningMs: 10 });

    const res = await POST(reqBody({ message: "gera logo", acao: "gerar" }));
    await collectSSE(res.body as ReadableStream<Uint8Array>);
    expect(pipelineGeracao).not.toHaveBeenCalled();
    expect(runBuilder).toHaveBeenCalled();
  });
});
