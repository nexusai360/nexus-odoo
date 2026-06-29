"use server";

// Server actions do construtor modular: salvar/restaurar layout de uma tela.
// Layout duplo: "oficial" (global, só admin/super_admin) e "pessoal" (qualquer
// usuário com acesso à área). Posição/tamanho persistem via layout-repo.

import { prisma } from "@/lib/prisma";
import { requireDiretoriaArea } from "@/lib/diretoria/access";
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";
import { salvarLayout, excluirLayoutPessoal } from "@/lib/diretoria/builder/layout-repo";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

function podeOficial(role: string): boolean {
  return role === "super_admin" || role === "admin";
}

/** A `tela` pode ser a área ("estoque") ou área:aba ("estoque:visao"); o guard
 *  de permissão usa só a área (prefixo). */
function areaDe(tela: string): DiretoriaArea {
  return tela.split(":")[0] as DiretoriaArea;
}

export async function salvarLayoutAction(
  tela: string,
  blocos: BlocoLayout[],
  escopo: "pessoal" | "oficial",
): Promise<{ ok: boolean; erro?: string }> {
  const user = await requireDiretoriaArea(areaDe(tela));
  if (escopo === "oficial" && !podeOficial(user.platformRole)) {
    return { ok: false, erro: "Sem permissão para salvar o layout oficial." };
  }
  await salvarLayout(prisma, {
    tela,
    donoUserId: escopo === "pessoal" ? user.id : null,
    isPadrao: escopo === "oficial",
    blocos,
  });
  return { ok: true };
}

export async function restaurarLayoutPessoalAction(
  tela: string,
): Promise<{ ok: boolean }> {
  const user = await requireDiretoriaArea(areaDe(tela));
  await excluirLayoutPessoal(prisma, tela, user.id);
  return { ok: true };
}
