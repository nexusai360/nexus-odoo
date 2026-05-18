// mcp/catalog/types.ts
// Tipos do catálogo de tools do MCP semântico.
// PrismaClient tipado como tipo nominal (M1) — não como typeof prisma (singleton).
// sempreVisivel? nasce aqui na onda 4a (N9) — nenhuma onda posterior reabre este arquivo.
import type { z } from "zod";
import type { PrismaClient, ReportDomain } from "@/generated/prisma/client";
import type { UserContext } from "../auth/user-context.js";

/** Contexto injetado em todo handler de tool. */
export interface ToolHandlerCtx {
  prisma: PrismaClient;
  user: UserContext;
}

/** Entrada de tool no catálogo. */
export interface ToolEntry<I = unknown, O = unknown> {
  /** Identificador único da tool (snake_case, ex.: "saldo_produto"). */
  id: string;
  /** Domínio de negócio ao qual a tool pertence. */
  dominio: ReportDomain;
  /** Descrição legível para o agente. */
  descricao: string;
  /** Schema de validação do input. */
  inputSchema: z.ZodType<I>;
  /** Schema de validação do output. */
  outputSchema: z.ZodType<O>;
  /**
   * Roles que podem ver/invocar a tool (gate por role).
   * Ausente = sem gate de role (qualquer role pode).
   */
  gatedRoles?: ReadonlyArray<"super_admin" | "admin">;
  /**
   * Quando true, a tool aparece em tools/list para qualquer usuário,
   * independentemente de `dominio` (mas ainda sujeita a `gatedRoles`).
   * Usada por tools de domínio-neutro do Caminho 3 (registrar_lacuna,
   * bi_consulta_avancada). Ver Task 4a.13 e 4c.11.
   */
  sempreVisivel?: boolean;
  /** Handler da tool — recebe input validado e o contexto de execução. */
  handler: (input: I, ctx: ToolHandlerCtx) => Promise<O>;
}
