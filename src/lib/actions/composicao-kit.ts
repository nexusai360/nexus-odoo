"use server";

// Server Action do painel de Composição de valor dos kits (Diretoria > Estoque).
// Carrega a composição de UM kit sob demanda (o seletor no client dispara isto), gated pela
// capability diretoria.estoque.view. Fonte única: queryComposicaoKit (a mesma do Nex). Não toca
// o Odoo (lê só o cache). Retorna dado plano/serializável (RSC server->client).

import { getCurrentUser } from "@/lib/auth";
import { canDiretoria } from "@/lib/diretoria/access";
import { prisma } from "@/lib/prisma";
import { queryComposicaoKit, type ComposicaoKit } from "@/lib/reports/queries/composicao-kit";

export interface ComposicaoKitResultado {
  ok: boolean;
  composicao?: ComposicaoKit;
  erro?: string;
}

export async function carregarComposicaoKit(
  kitId: number,
  base?: "tabela" | "venda_real",
): Promise<ComposicaoKitResultado> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, erro: "Não autenticado" };
  if (!(await canDiretoria(user, "diretoria.estoque.view"))) {
    return { ok: false, erro: "Sem acesso ao Estoque da Diretoria" };
  }
  if (!Number.isInteger(kitId) || kitId <= 0) {
    return { ok: false, erro: "Kit inválido" };
  }

  const composicao = await queryComposicaoKit(prisma, kitId, base ? { base } : {});
  if (!composicao) return { ok: false, erro: "Kit não encontrado no cache" };
  return { ok: true, composicao };
}
