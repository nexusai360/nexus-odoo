// Fase E (Nex Especialista) , gate deterministico do golden, roda no jest e
// no pre-push. Nao chama LLM: valida a HIGIENE do dataset (o benchmark real
// e o ab-cerebro). Mata as regressoes que ja custaram rodadas de pericia:
// placeholder "Consulta: ...", tool renomeada orfa, pergunta pre-corte
// classificada como prosseguir.

import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { GoldenSchema } from "../golden-schema";

// Caminhos relativos ao cwd do jest (raiz do repo); import.meta nao existe no
// transform CJS do jest.
const golden = GoldenSchema.parse(
  JSON.parse(readFileSync("src/lib/agent/evals/golden/golden-nex.json", "utf8")),
);

// Snapshot do catalogo (mantido por mcp/__tests__/snapshot): evita importar o
// catalogo ESM real dentro do jest do raiz.
const catalogo = (
  JSON.parse(readFileSync("src/lib/mcp-catalog-snapshot.json", "utf8")) as {
    tools: { id: string }[];
  }
).tools;

describe("golden gate (deterministico, pre-push)", () => {
  it("schema valido e ids unicos", () => {
    const ids = golden.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ZERO pergunta placeholder 'Consulta: ...' (regressao dos cov-*)", () => {
    const placeholders = golden.filter((e) => /^Consulta:\s/i.test(e.pergunta));
    expect(placeholders.map((e) => e.id)).toEqual([]);
  });

  it("toda toolEsperada/toolsAceitas de caso prosseguir existe no catalogo MCP", () => {
    const nomes = new Set(catalogo.map((t) => t.id));
    // nomes saneados tambem sao validos (a OpenAI proibe ponto em function name)
    for (const t of catalogo) nomes.add(t.id.replace(/[^a-zA-Z0-9_-]/g, "_"));
    const orfas: string[] = [];
    for (const e of golden) {
      if (e.classe !== "prosseguir") continue;
      for (const t of [e.toolEsperada, ...(e.toolsAceitas ?? [])]) {
        if (t && !nomes.has(t)) orfas.push(`${e.id}:${t}`);
      }
    }
    expect(orfas).toEqual([]);
  });

  it("pergunta pinando periodo pre-2026 nao pode ser classe prosseguir (Limpa 2026+)", () => {
    // Pega "de 2025", "em 2024", "dezembro de 2024", "ano passado"... mas nao
    // identificadores tipo "pedido 2025" (raros; ajustar se aparecer).
    const RE = /\b(em|de|durante)\s+(20(1\d|2[0-5]))\b|ano passado/i;
    const errados = golden.filter((e) => RE.test(e.pergunta) && e.classe === "prosseguir");
    expect(errados.map((e) => e.id)).toEqual([]);
  });
});
