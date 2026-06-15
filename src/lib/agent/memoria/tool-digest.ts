// src/lib/agent/memoria/tool-digest.ts
// Onda M (Arquitetura 3.0) , T1.2.
//
// Deriva o toolDigest de um turno: 1 linha por tool call com tool, dominio,
// args-chave e os numeros do _DESTAQUE/_agregado. O digest e o que SOBREVIVE
// no historico quando o payload bruto sai do contexto , e a memoria de longo
// prazo do agente. Deterministico, barato, sem LLM.
//
// Plan: docs/superpowers/plans/2026-06-12-nex-arq3-onda-m-plan.md (T1.2)
import type { ToolCall } from "../llm/types";
import catalogSnapshot from "@/lib/mcp-catalog-snapshot.json";

const CAP_POR_CALL = 400;

// id da tool -> module (dominio). Snapshot é a fonte (gerado por gen:mcp-catalog).
const DOMINIO_POR_TOOL = new Map<string, string>(
  (catalogSnapshot as { tools: { id: string; module?: string }[] }).tools.map(
    (t) => [t.id, t.module ?? "?"],
  ),
);

// Args que identificam o recorte da consulta (entram no digest quando presentes).
const ARGS_CHAVE = [
  "periodoDe", "periodoAte", "empresaRef", "termo", "vendedor", "documento",
  "uf", "operacao", "tipo", "agruparPor", "locais", "familia", "status",
];

function numerosDoEnvelope(raw: string): string {
  try {
    const env = JSON.parse(raw) as {
      estado?: string;
      dados?: {
        _DESTAQUE?: Record<string, unknown>;
        _agregado?: Record<string, unknown>;
      };
    };
    if (!env || typeof env !== "object") return "sem resultado";
    const partes: string[] = [];
    const destaque = env.dados?._DESTAQUE ?? {};
    for (const [k, v] of Object.entries(destaque)) {
      if (typeof v === "number" && v !== 0) partes.push(`${k}=${v}`);
      else if (typeof v === "string" && v && v.length <= 60) partes.push(`${k}=${v}`);
    }
    if (partes.length === 0 && env.dados?._agregado) {
      for (const [k, v] of Object.entries(env.dados._agregado)) {
        if (typeof v === "number") partes.push(`${k}=${v}`);
      }
    }
    if (partes.length === 0) {
      return env.estado === "ok" || env.estado === "vazio"
        ? `estado=${env.estado}`
        : "sem resultado";
    }
    return partes.join(" ");
  } catch {
    return "sem resultado";
  }
}

function argsChave(args: object): string {
  const a = args as Record<string, unknown>;
  const partes: string[] = [];
  for (const k of ARGS_CHAVE) {
    const v = a[k];
    if (v === undefined || v === null || v === "") continue;
    const s = Array.isArray(v) ? v.join("|") : String(v);
    if (s.length <= 50) partes.push(`${k}=${s}`);
  }
  return partes.join(" ");
}

/**
 * Digest do turno: uma linha por call, "[tool dominio=X] args; numeros".
 * Retorna null quando nao ha call com resultado (turno sem tools).
 */
export function derivarToolDigest(
  toolCalls: ToolCall[],
  resultados: Record<string, string>,
): string | null {
  if (!toolCalls.length || Object.keys(resultados).length === 0) return null;
  const linhas: string[] = [];
  for (const call of toolCalls) {
    const raw = resultados[call.id];
    if (raw === undefined) continue;
    const dominio = DOMINIO_POR_TOOL.get(call.name) ?? "?";
    const args = argsChave(call.arguments ?? {});
    const nums = numerosDoEnvelope(raw);
    let linha = `[${call.name} dominio=${dominio}]${args ? ` ${args};` : ""} ${nums}`;
    if (linha.length > CAP_POR_CALL) linha = linha.slice(0, CAP_POR_CALL - 3) + "...";
    linhas.push(linha);
  }
  return linhas.length ? linhas.join("\n") : null;
}
