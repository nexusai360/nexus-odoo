// src/lib/agent/memoria/foco-atual.ts
// Onda M (Arquitetura 3.0) T3.2 , working memory estruturada e determinística.
//
// O focoAtual é "do que a conversa está falando AGORA": métrica (tool), período,
// entidades em foco e o último resultado-chave. Extraído por regra (sem LLM)
// dos argumentos e resultados das tool calls do turno; herda do foco anterior
// o que o turno não redefiniu. Injetado como bloco curto no fim do prompt (L4)
// e usado pelo R2-ctx como fonte canônica de anáfora.
//
// Plan: docs/superpowers/plans/2026-06-12-nex-arq3-onda-m-plan.md (M.3)
import type { ToolCall } from "../llm/types";

export interface FocoAtual {
  metrica?: { nome: string; toolUsada: string };
  periodo?: { inicio: string; fim: string; rotulo?: string };
  entidades?: { tipo: string; rotulo: string }[];
  ultimoResultado?: { resumo: string; valorChave?: string; messageId: string };
  turnoAtualizado: number;
}

export interface TurnoParaFoco {
  pergunta: string;
  toolCalls: ToolCall[];
  toolResults: Record<string, string>;
  respostaFinal: string;
  messageId: string;
  turno: number;
}

const ARG_ENTIDADE: Record<string, string> = {
  termo: "produto",
  vendedor: "vendedor",
  empresaRef: "empresa",
  documento: "cliente",
  familia: "familia",
  uf: "uf",
};

function headlineDoEnvelope(raw: string): string | undefined {
  try {
    const env = JSON.parse(raw) as { dados?: { _DESTAQUE?: Record<string, unknown> } };
    const d = env.dados?._DESTAQUE ?? {};
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (typeof v === "number" && Math.abs(v) > 0) return `${k}=${v}`;
    }
  } catch {
    /* envelope invalido: sem headline */
  }
  return undefined;
}

/** Entidades citadas nos args das tool calls do turno (mesma extração do foco). */
export function extrairEntidadesDoTurno(
  toolCalls: ToolCall[],
): { tipo: string; rotulo: string }[] {
  const entidades: { tipo: string; rotulo: string }[] = [];
  for (const call of toolCalls) {
    const args = (call.arguments ?? {}) as Record<string, unknown>;
    for (const [arg, tipo] of Object.entries(ARG_ENTIDADE)) {
      const v = args[arg];
      if (typeof v === "string" && v.trim()) entidades.push({ tipo, rotulo: v.trim() });
    }
  }
  return entidades;
}

export function derivarFocoAtual(prev: FocoAtual | null, turno: TurnoParaFoco): FocoAtual {
  const foco: FocoAtual = {
    metrica: prev?.metrica,
    periodo: prev?.periodo,
    entidades: prev?.entidades,
    ultimoResultado: prev?.ultimoResultado,
    turnoAtualizado: turno.turno,
  };

  const entidadesNovas = extrairEntidadesDoTurno(turno.toolCalls);
  for (const call of turno.toolCalls) {
    foco.metrica = { nome: call.name.replace(/_/g, " "), toolUsada: call.name };
    const args = (call.arguments ?? {}) as Record<string, unknown>;
    const de = args.periodoDe, ate = args.periodoAte;
    if (typeof de === "string" && typeof ate === "string") {
      foco.periodo = { inicio: de, fim: ate };
    }
    const raw = turno.toolResults[call.id];
    if (raw) {
      const headline = headlineDoEnvelope(raw);
      foco.ultimoResultado = {
        resumo: turno.respostaFinal.slice(0, 160),
        valorChave: headline,
        messageId: turno.messageId,
      };
    }
  }
  if (entidadesNovas.length) {
    // novas primeiro; mantem as anteriores que nao colidem (mesmo tipo+rotulo)
    const chaves = new Set(entidadesNovas.map((e) => `${e.tipo}:${e.rotulo}`));
    foco.entidades = [
      ...entidadesNovas,
      ...(prev?.entidades ?? []).filter((e) => !chaves.has(`${e.tipo}:${e.rotulo}`)),
    ].slice(0, 6);
  }
  return foco;
}

/** Bloco curto para o prompt (L4). Cap natural < 600 chars. */
export function formatarFocoAtual(f: FocoAtual): string {
  const partes: string[] = [];
  if (f.metrica) partes.push(`assunto atual: ${f.metrica.nome} (tool ${f.metrica.toolUsada})`);
  if (f.periodo) partes.push(`período em foco: ${f.periodo.inicio} a ${f.periodo.fim}`);
  if (f.entidades?.length)
    partes.push(`entidades em foco: ${f.entidades.map((e) => `${e.tipo}=${e.rotulo}`).join(", ")}`);
  if (f.ultimoResultado?.valorChave)
    partes.push(`último resultado: ${f.ultimoResultado.valorChave}`);
  return partes.join("; ").slice(0, 590);
}
