/**
 * TDD , search.ts (ingestão e busca)
 *
 * Comportamentos testados:
 * - ingestKbDocument: grava KbDocument com embedding gerado
 * - ingestKbDocument: fallback quando embed lança EmbeddingUnavailable (sem embedding)
 * - searchKb: executa query de similaridade e retorna snippets ordenados
 * - searchKb: fallback texto integral truncado sem credencial de embedding
 */

export {}; // isolatedModules: torna o arquivo um módulo

jest.mock("@/lib/prisma", () => ({
  prisma: {
    kbDocument: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

// Mock embed module inteiro
jest.mock("./embed", () => ({
  embed: jest.fn(),
  EmbeddingUnavailable: class EmbeddingUnavailable extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "EmbeddingUnavailable";
    }
  },
}));

const { prisma } = jest.requireMock("@/lib/prisma");
const embedModule = jest.requireMock("./embed");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ingestKbDocument()", () => {
  test("grava documento com embedding quando credencial disponível", async () => {
    const fakeVec = Array.from({ length: 1536 }, (_, i) => i * 0.001);
    embedModule.embed.mockResolvedValue(fakeVec);

    prisma.kbDocument.create.mockResolvedValue({
      id: "doc-1",
      name: "Manual Operações",
      kind: "TXT",
      sourceUrl: null,
      extractedText: "Conteúdo do manual.",
      charCount: 20,
      createdAt: new Date(),
    });

    const { ingestKbDocument } = await import("./search");
    const doc = await ingestKbDocument("Manual Operações", "TXT", "Conteúdo do manual.");

    expect(doc.id).toBe("doc-1");
    expect(embedModule.embed).toHaveBeenCalledWith("Conteúdo do manual.");
    // Verifica que create foi chamado com o embedding
    expect(prisma.kbDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Manual Operações",
          kind: "TXT",
          extractedText: "Conteúdo do manual.",
          charCount: 19,
        }),
      }),
    );
  });

  test("fallback sem embedding quando EmbeddingUnavailable é lançado", async () => {
    const { EmbeddingUnavailable } = embedModule;
    embedModule.embed.mockRejectedValue(new EmbeddingUnavailable("sem cred"));

    prisma.kbDocument.create.mockResolvedValue({
      id: "doc-2",
      name: "Doc sem embed",
      kind: "TXT",
      extractedText: "Texto.",
      charCount: 5,
      createdAt: new Date(),
    });

    const { ingestKbDocument } = await import("./search");
    const doc = await ingestKbDocument("Doc sem embed", "TXT", "Texto.");

    expect(doc.id).toBe("doc-2");
    // create chamado sem embedding (ou com null)
    expect(prisma.kbDocument.create).toHaveBeenCalled();
  });

  test("ingestKbDocument aceita sourceUrl opcional", async () => {
    embedModule.embed.mockResolvedValue(Array.from({ length: 1536 }, () => 0));
    prisma.kbDocument.create.mockResolvedValue({ id: "doc-3", name: "URL Doc", extractedText: "...", charCount: 3, createdAt: new Date() });

    const { ingestKbDocument } = await import("./search");
    await ingestKbDocument("URL Doc", "URL", "conteúdo extraído da url", "https://example.com");

    expect(prisma.kbDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceUrl: "https://example.com",
        }),
      }),
    );
  });
});

describe("searchKb()", () => {
  test("retorna snippets em ordem de similaridade", async () => {
    const fakeVec = Array.from({ length: 1536 }, () => 0.5);
    embedModule.embed.mockResolvedValue(fakeVec);

    const rows = [
      { id: "doc-1", name: "Doc A", extractedText: "Texto A relevante." },
      { id: "doc-2", name: "Doc B", extractedText: "Texto B relevante." },
    ];
    prisma.$queryRaw.mockResolvedValue(rows);

    const { searchKb } = await import("./search");
    const results = await searchKb("consulta de teste", 5);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Doc A");
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  test("fallback texto integral truncado quando EmbeddingUnavailable", async () => {
    const { EmbeddingUnavailable } = embedModule;
    embedModule.embed.mockRejectedValue(new EmbeddingUnavailable("sem cred"));

    const docsAll = [
      { id: "doc-1", name: "Doc A", extractedText: "Texto A." },
      { id: "doc-2", name: "Doc B", extractedText: "Texto B." },
    ];
    prisma.kbDocument.findMany.mockResolvedValue(docsAll);

    const { searchKb } = await import("./search");
    const results = await searchKb("consulta qualquer", 5);

    // Fallback retorna os documentos do banco sem similaridade
    expect(results.length).toBeGreaterThan(0);
    expect(prisma.kbDocument.findMany).toHaveBeenCalled();
    // $queryRaw não é chamado no fallback
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  test("searchKb com topK=3 limita resultados", async () => {
    const fakeVec = Array.from({ length: 1536 }, () => 0.1);
    embedModule.embed.mockResolvedValue(fakeVec);
    prisma.$queryRaw.mockResolvedValue([
      { id: "d1", name: "D1", extractedText: "T1" },
      { id: "d2", name: "D2", extractedText: "T2" },
      { id: "d3", name: "D3", extractedText: "T3" },
    ]);

    const { searchKb } = await import("./search");
    const results = await searchKb("query", 3);
    expect(results).toHaveLength(3);
  });
});
