"use server";

/**
 * Server actions de leitura para o drill-down da tabela de decisoes do Router.
 * Gate super_admin (alinhado com a pagina /agente/monitoramento/router).
 */

import { getCurrentUser } from "@/lib/auth";
import {
  getRouterDecisionDetail,
  type RouterDecisionDetail,
} from "@/lib/agent/router/queries";

async function gate() {
  const user = await getCurrentUser();
  if (!user || user.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
}

export async function fetchRouterDecisionDetail(
  id: string,
): Promise<RouterDecisionDetail | null> {
  await gate();
  return getRouterDecisionDetail(id);
}
