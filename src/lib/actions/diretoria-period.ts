"use server";

import { prisma } from "@/lib/prisma";

/**
 * Data mais antiga com dado no cache (primeira nota fiscal emitida). Trava o
 * calendário do período personalizado da Diretoria: nada antes disso pode ser
 * selecionado, porque não existe dado. Retorna `yyyy-mm-dd` (dia local) ou null
 * quando o cache ainda está vazio. Buscada de forma lazy, só ao abrir o picker.
 */
export async function getDiretoriaMinDate(): Promise<string | null> {
  const row = await prisma.fatoNotaFiscal.findFirst({
    where: { dataEmissao: { not: null } },
    orderBy: { dataEmissao: "asc" },
    select: { dataEmissao: true },
  });
  const d = row?.dataEmissao;
  if (!d) return null;
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
