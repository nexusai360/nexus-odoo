// Testes do texto canonico de embedding por tool (F3 onda 3a).
import { catalogo } from "../index.js";
import { isWriteToolEntry } from "../types.js";
import {
  embeddingTextFor,
  assertEmbeddingTextCoverage,
  TOOL_TRIGGERS,
  MIN_EMBEDDING_TEXT,
} from "../embedding-text.js";

const readTools = catalogo.filter((t) => !isWriteToolEntry(t));

describe("embeddingTextFor", () => {
  it("combina descricao + triggers do tool.id", () => {
    const fake = { id: "x_demo", descricao: "Descricao base." } as never;
    // sem triggers cadastrados => so a descricao
    expect(embeddingTextFor(fake)).toBe("Descricao base.");
  });

  it("inclui os triggers quando existem para o id", () => {
    const id = Object.keys(TOOL_TRIGGERS)[0];
    if (!id) return; // tolerante enquanto TOOL_TRIGGERS vazio (3a.1a)
    const fake = { id, descricao: "Base." } as never;
    const txt = embeddingTextFor(fake);
    for (const trg of TOOL_TRIGGERS[id]!) expect(txt).toContain(trg);
  });
});

describe("assertEmbeddingTextCoverage", () => {
  it("toda read-tool do catalogo produz embeddingText >= piso anti-trivial", () => {
    for (const t of readTools) {
      expect(embeddingTextFor(t).length).toBeGreaterThanOrEqual(MIN_EMBEDDING_TEXT);
    }
  });

  it("nao lanca com o catalogo atual", () => {
    expect(() => assertEmbeddingTextCoverage(catalogo)).not.toThrow();
  });

  it("LANCA quando uma tool tem texto curto (< 40 chars) , teste negativo", () => {
    const curto = [{ id: "y_curta", descricao: "curta" }] as never;
    expect(() => assertEmbeddingTextCoverage(curto)).toThrow(/y_curta/);
  });
});
