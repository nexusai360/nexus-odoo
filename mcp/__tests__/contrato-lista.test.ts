// mcp/__tests__/contrato-lista.test.ts
// Fase B (Nex Especialista) , gate de progresso do CONTRATO DE LISTA.
//
// Caso forense #1 do laudo 2026-06-11: tool devolvia lista em ordem arbitraria
// e o agente rotulava as primeiras N de "maiores". O contrato exige que toda
// tool com lista declare `ordenadoPor` no envelope (e, nas monetarias, exponha
// `topMaiores`). Migracao INCREMENTAL: tools ainda nao migradas vivem na
// allowlist TOOLS_SEM_CONTRATO_DE_LISTA, que precisa ESVAZIAR ate o fim da
// Fase B (mesmo padrao do gate TOOLS_SEM_FORMATADOR_REAL da F4).
//
// Deteccao estatica por leitura do fonte (mesma heuristica da auditoria
// 2026-06-11-auditoria-contrato-lista.md): tool com `z.array(` em campo de
// lista no schema de dados; migrada = fonte contem `ordenadoPor`.

import { describe, it, expect } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOOLS_SEM_CONTRATO_DE_LISTA } from "../lib/contrato-lista.data";

const ROOT = join(__dirname, "..", "tools");
const IGNORA_CAMPO = new Set([
  "guardrails",
  "topPorParticipante",
  "sugestoesRelacionadas",
  "topMaiores",
  "_AVISO",
  "candidatos",
]);

interface ToolFonte {
  id: string;
  arquivo: string;
  temLista: boolean;
  declaraOrdenacao: boolean;
}

function varrerTools(): ToolFonte[] {
  const out: ToolFonte[] = [];
  for (const dom of readdirSync(ROOT)) {
    const dir = join(ROOT, dom);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts") || f === "index.ts") continue;
      const src = readFileSync(join(dir, f), "utf8");
      // Write tools ficam fora do contrato de lista: o array delas e input/
      // confirmacao de escrita, nao lista consultavel que o agente enquadra.
      if (src.includes("WriteToolEntry")) continue;
      const ids = [...src.matchAll(/id:\s*"([a-z0-9_.]+)"/g)].map((m) => m[1]);
      const listas = [...src.matchAll(/(\w+):\s*z\s*\.array\(/g)]
        .map((m) => m[1])
        .filter((c) => !IGNORA_CAMPO.has(c));
      const declara = src.includes("ordenadoPor");
      for (const id of ids) {
        out.push({ id, arquivo: `${dom}/${f}`, temLista: listas.length > 0, declaraOrdenacao: declara });
      }
    }
  }
  return out;
}

const tools = varrerTools();
const comLista = tools.filter((t) => t.temLista);
const allow = new Set(TOOLS_SEM_CONTRATO_DE_LISTA);

describe("contrato de lista , gate incremental (Fase B)", () => {
  it("toda tool com lista fora da allowlist declara ordenadoPor", () => {
    const violando = comLista
      .filter((t) => !allow.has(t.id))
      .filter((t) => !t.declaraOrdenacao)
      .map((t) => `${t.id} (${t.arquivo})`);
    expect(violando).toEqual([]);
  });

  it("allowlist sem id stale: tool migrada (declara ordenadoPor) DEVE sair da lista", () => {
    const migradaAindaListada = comLista
      .filter((t) => allow.has(t.id))
      .filter((t) => t.declaraOrdenacao)
      .map((t) => t.id);
    expect(migradaAindaListada).toEqual([]);
  });

  it("allowlist so contem tools que existem e tem lista", () => {
    const idsComLista = new Set(comLista.map((t) => t.id));
    const fantasmas = TOOLS_SEM_CONTRATO_DE_LISTA.filter((id) => !idsComLista.has(id));
    expect(fantasmas).toEqual([]);
  });

  it("allowlist sem duplicatas", () => {
    expect(TOOLS_SEM_CONTRATO_DE_LISTA.length).toBe(new Set(TOOLS_SEM_CONTRATO_DE_LISTA).size);
  });
});
