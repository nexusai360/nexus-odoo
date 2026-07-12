// src/lib/corte-app.ts
//
// Hidratacao da data de inicio das analises no processo do APP (Next).
//
// `corteAtual()` e sincrono porque vive no caminho quente dos wheres, e por isso le um cache
// EM MEMORIA. Esse cache so existe depois que alguem chama `getCorteDados(prisma)` , e cada
// processo tem o seu (app, MCP e worker sao processos diferentes). Sem hidratar, o processo
// usa o valor PADRAO e mudar a data na tela nao muda nada na leitura.
//
// Por isso todo PONTO DE ENTRADA que le historico (page RSC, route handler, server action)
// chama `aquecerCorte()` antes de consultar. E ~1 SELECT por minuto (TTL de 60s), nao por
// request. No MCP a hidratacao acontece no pipeline de tools (mcp/server.ts e o dispatcher
// externo); no worker, no inicio do ciclo.

import { prisma } from "@/lib/prisma";
import { getCorteDados } from "@/lib/corte-dados";

/** Garante que este processo conhece a data configurada. Devolve o ISO vigente. */
export async function aquecerCorte(): Promise<string> {
  return getCorteDados(prisma);
}
