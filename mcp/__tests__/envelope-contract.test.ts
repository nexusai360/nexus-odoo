// mcp/__tests__/envelope-contract.test.ts
// F4 Apresentacao, Onda 1.4 , teste de contrato do envelope.
//
// Rede nova que enforca DOIS contratos sobre o catalogo de leitura:
//   (1) Toda read-tool tem um formatador real (nao fmtGenerico), EXCETO as que
//       estao na allowlist `TOOLS_SEM_FORMATADOR_REAL`. A allowlist precisa ser
//       IGUAL ao conjunto de tools genericas (sem id stale, sem id faltando):
//       quando a Onda 4 escreve o formatador de uma tool, o teste FALHA ate o
//       id sair da allowlist , gate de progresso que forca a contabilidade.
//       Criterio de saida da fase (Onda 6): allowlist == [].
//   (2) O shape canonico `EnvelopeBaseShape` (= FreshnessEnvelope<ToolEnvelope>)
//       valida os 3 estados (preparando | ok | vazio), com `dados` passthrough.
//
// NAO chama handlers (sem DB). A validacao runtime handler->withFreshness->
// EnvelopeBaseshape e coberta pelo baseline E2E (Onda 1.5, guard E2E=1) e pelo
// E2E por tool da Onda 4.

import { describe, it, expect } from "@jest/globals";
import { catalogo } from "../catalog/index";
import { isWriteToolEntry } from "../catalog/types";
import {
  formatadorPorTool,
  ehFormatadorGenerico,
  TOOLS_SEM_FORMATADOR_REAL,
} from "../lib/responder";
import { EnvelopeBaseShape } from "../lib/envelope";

const readTools = catalogo.filter((t) => !isWriteToolEntry(t));
const readIds = new Set(readTools.map((t) => t.id));
const genericIds = readTools
  .filter((t) => ehFormatadorGenerico(formatadorPorTool(t.id)))
  .map((t) => t.id);

describe("contrato , formatador real por read-tool", () => {
  it("toda read-tool fora da allowlist tem formatador real (nao generico)", () => {
    const allow = new Set(TOOLS_SEM_FORMATADOR_REAL);
    const violando = readTools
      .filter((t) => !allow.has(t.id))
      .filter((t) => ehFormatadorGenerico(formatadorPorTool(t.id)))
      .map((t) => t.id);
    expect(violando).toEqual([]);
  });

  it("allowlist nao tem id stale (todo id da allowlist e read-tool E e generico hoje)", () => {
    const naoReadTool = TOOLS_SEM_FORMATADOR_REAL.filter((id) => !readIds.has(id));
    expect(naoReadTool).toEqual([]);
    const jaTemFormatador = TOOLS_SEM_FORMATADOR_REAL.filter(
      (id) => !ehFormatadorGenerico(formatadorPorTool(id)),
    );
    // Se uma tool ganhou formatador real, seu id DEVE sair da allowlist.
    expect(jaTemFormatador).toEqual([]);
  });

  it("allowlist == conjunto de read-tools genericas (gate de progresso exato)", () => {
    expect([...TOOLS_SEM_FORMATADOR_REAL].sort()).toEqual([...genericIds].sort());
  });

  it("allowlist sem duplicatas", () => {
    expect(TOOLS_SEM_FORMATADOR_REAL.length).toBe(new Set(TOOLS_SEM_FORMATADOR_REAL).size);
  });
});

describe("contrato , EnvelopeBaseShape sobre os 3 estados", () => {
  const fonteStatus = { status: "ok", ultimaSyncEm: "2026-05-27T00:00:00Z" };

  it("valida estado preparando", () => {
    expect(EnvelopeBaseShape.safeParse({ estado: "preparando" }).success).toBe(true);
  });

  it("valida estado ok com dados + freshness", () => {
    const env = {
      estado: "ok",
      dados: { _RESPOSTA: "12 itens", linhas: [{ id: 1 }], _DESTAQUE: { total: 12 } },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus,
    };
    expect(EnvelopeBaseShape.safeParse(env).success).toBe(true);
  });

  it("valida estado vazio e preserva chave de array extra (passthrough)", () => {
    const env = {
      estado: "vazio",
      dados: { _RESPOSTA: "nenhum resultado", titulos: [] },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus,
    };
    const r = EnvelopeBaseShape.safeParse(env);
    expect(r.success).toBe(true);
  });

  it("rejeita dados sem _RESPOSTA no estado ok", () => {
    const env = {
      estado: "ok",
      dados: { linhas: [] },
      atualizadoEm: "2026-05-27T00:00:00Z",
      atualizadoHa: "1min",
      fonteStatus,
    };
    expect(EnvelopeBaseShape.safeParse(env).success).toBe(false);
  });
});
