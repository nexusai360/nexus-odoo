"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDiretoria } from "@/lib/diretoria/access";
import type { DiretoriaEventoTipo } from "@/generated/prisma/client";

export interface EventoInput {
  titulo: string;
  tipo: DiretoriaEventoTipo;
  inicio: string; // ISO
  fim?: string | null;
  diaInteiro?: boolean;
  descricao?: string | null;
  local?: string | null;
}

export interface EventoResumo {
  id: string;
  titulo: string;
  tipo: DiretoriaEventoTipo;
  inicio: string;
  fim: string | null;
  diaInteiro: boolean;
  descricao: string | null;
  local: string | null;
}

const TIPOS: DiretoriaEventoTipo[] = [
  "reuniao",
  "entrega",
  "inventario",
  "prospeccao",
  "carregamento",
  "organizacao_estoque",
  "assembleia",
  "visita",
];

/** Lista os eventos de um intervalo (gated por diretoria.agenda.view). */
export async function listarEventos(
  deIso: string,
  ateIso: string,
): Promise<EventoResumo[]> {
  const user = await getCurrentUser();
  if (!user || !(await canDiretoria(user, "diretoria.agenda.view"))) return [];

  const eventos = await prisma.diretoriaEvento.findMany({
    where: { inicio: { gte: new Date(deIso), lte: new Date(ateIso) } },
    orderBy: { inicio: "asc" },
  });
  return eventos.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    inicio: e.inicio.toISOString(),
    fim: e.fim ? e.fim.toISOString() : null,
    diaInteiro: e.diaInteiro,
    descricao: e.descricao,
    local: e.local,
  }));
}

function validar(input: EventoInput): string | null {
  if (!input.titulo?.trim()) return "Informe o título";
  if (!TIPOS.includes(input.tipo)) return "Tipo inválido";
  if (!input.inicio || Number.isNaN(Date.parse(input.inicio))) return "Data de início inválida";
  if (input.fim && Number.isNaN(Date.parse(input.fim))) return "Data de fim inválida";
  return null;
}

/** Cria um evento (gated por diretoria.agenda.manage). */
export async function criarEvento(
  input: EventoInput,
): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: "Não autenticado" };
  if (!(await canDiretoria(user, "diretoria.agenda.manage"))) {
    return { ok: false, erro: "Sem permissão para gerenciar a agenda" };
  }
  const erro = validar(input);
  if (erro) return { ok: false, erro };

  const ev = await prisma.diretoriaEvento.create({
    data: {
      titulo: input.titulo.trim(),
      tipo: input.tipo,
      inicio: new Date(input.inicio),
      fim: input.fim ? new Date(input.fim) : null,
      diaInteiro: input.diaInteiro ?? false,
      descricao: input.descricao?.trim() || null,
      local: input.local?.trim() || null,
      criadoPorId: user.id,
    },
  });
  revalidatePath("/diretoria/agenda");
  return { ok: true, id: ev.id };
}

/** Exclui um evento (gated por diretoria.agenda.manage). */
export async function excluirEvento(
  id: string,
): Promise<{ ok: boolean; erro?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: "Não autenticado" };
  if (!(await canDiretoria(user, "diretoria.agenda.manage"))) {
    return { ok: false, erro: "Sem permissão para gerenciar a agenda" };
  }
  await prisma.diretoriaEvento.delete({ where: { id } });
  revalidatePath("/diretoria/agenda");
  return { ok: true };
}
