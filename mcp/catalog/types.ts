// mcp/catalog/types.ts
// Tipos do catálogo de tools do MCP semântico.
// PrismaClient tipado como tipo nominal (M1) — não como typeof prisma (singleton).
// sempreVisivel? nasce aqui na onda 4a (N9).
// WriteToolEntry + ToolEntryExample adicionados no Bloco F (F4 onda 2).
import type { z } from "zod";
import type { PrismaClient, ReportDomain } from "@/generated/prisma/client";
import type { UserContext } from "../auth/user-context.js";
import type { OdooClient } from "@/worker/odoo/client.js";

/** Contexto injetado em todo handler de tool. */
export interface ToolHandlerCtx {
  prisma: PrismaClient;
  user: UserContext;
}

/**
 * ZodRawShape — o objeto passado a z.object({...}).
 * É o formato que o McpServer.tool / registerTool do SDK aceita como inputSchema.
 */
export type ZodRawShape = Record<string, z.ZodTypeAny>;

/** Exemplo de uso da tool para documentação externa / AI hints. */
export interface ToolEntryExample {
  language: "curl" | "n8n" | "python" | "javascript";
  description?: string;
  code: string;
}

/** Entrada de tool no catálogo. */
export interface ToolEntry<I = unknown, O = unknown> {
  /** Identificador único da tool (snake_case, ex.: "saldo_produto"). */
  id: string;
  /**
   * Domínio de negócio ao qual a tool pertence.
   * Ausente em tools de domínio-neutro (ex.: `registrar_lacuna`,
   * `bi_consulta_avancada`) que usam `sempreVisivel: true` — nesses casos a
   * visibilidade não depende de domínio, então forçar um domínio seria falso.
   * `visibleTools` e `assertToolAllowed` tratam entry sem domínio como
   * sempre-coerente-de-domínio (o gate de `sempreVisivel` já garante isso).
   */
  dominio?: ReportDomain;
  /** Descrição legível para o agente. */
  descricao: string;
  /**
   * Raw shape Zod (objeto passado a z.object({...})) — publicado em tools/list
   * como inputSchema do protocolo MCP e aceito pelo SDK.
   * Deve ser consistente com `inputSchema` abaixo.
   */
  inputSchemaShape: ZodRawShape;
  /** Schema de validação do input (derivado de z.object(inputSchemaShape)). */
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
  /**
   * Versão (inteiro monotônico) em que a tool foi adicionada.
   * Usado por capability-check: chaves com capabilitiesVersion menor
   * não enxergam tools adicionadas após sua criação.
   */
  addedInVersion?: number;
  /** Exemplos de uso para documentação / AI hints. */
  examples?: ReadonlyArray<ToolEntryExample>;
  /** Requer autenticação externa (API key) para ser invocada. */
  requiresExternalAuth?: boolean;
  /** Handler da tool — recebe input validado e o contexto de execução. */
  handler: (input: I, ctx: ToolHandlerCtx) => Promise<O>;
}

// ---------------------------------------------------------------------------
// Write tools
// ---------------------------------------------------------------------------

/** Contexto injetado em handlers de tools de escrita. */
export interface WriteToolHandlerCtx extends ToolHandlerCtx {
  odoo: OdooClient;
  requestId: string;
  idempotencyKey: string;
}

/** Resultado padronizado de uma tool de escrita. */
export interface WriteToolResult<O = unknown> {
  id: number | number[];
  data: O;
  snapshotBefore: object | null;
  snapshotAfter: object | null;
}

/**
 * Entrada de tool de ESCRITA no catálogo.
 * Sempre requer auth externa (`requiresExternalAuth: true` é literal, não opcional).
 * Nunca aparece via auth interna (userId/service token).
 */
export interface WriteToolEntry<I = unknown, O = unknown> {
  /** Identificador único da tool (snake_case). */
  id: string;
  /** Discriminante de tipo — sempre "write". */
  operation: "write";
  /** Módulo/domínio de negócio desta tool (usado em capability check). */
  module: string;
  /** Descrição legível para o agente. */
  descricao: string;
  /** Raw shape Zod para publicação no protocolo MCP. */
  inputSchemaShape: ZodRawShape;
  /** Schema de validação do input. */
  inputSchema: z.ZodType<I>;
  /** Schema de validação do output. */
  outputSchema: z.ZodType<O>;
  /** Capability necessária para invocar esta tool. */
  capability: { module: string; action: string };
  /** Se true, a tool opera sobre dados sensíveis e gera auditoria extra. */
  sensitive: boolean;
  /** Modelo Odoo afetado diretamente. */
  odooModel: string;
  /** Modelos Odoo cujo cache pode ser invalidado como efeito colateral. */
  affectsModels?: ReadonlyArray<string>;
  /** Nome do evento emitido após execução bem-sucedida. */
  eventName: string;
  /** Versão (inteiro monotônico) em que a tool foi adicionada. */
  addedInVersion?: number;
  /** Sempre true — tools de escrita nunca aceitam auth interna. */
  requiresExternalAuth: true;
  /** Exemplos de uso para documentação / AI hints. */
  examples?: ReadonlyArray<ToolEntryExample>;
  /** Handler da tool — recebe input validado e o contexto de execução. */
  handler: (input: I, ctx: WriteToolHandlerCtx) => Promise<WriteToolResult<O>>;
}

/**
 * Type guard: retorna true se a entry for uma WriteToolEntry.
 * Discriminante: campo `operation === "write"`.
 */
export function isWriteToolEntry(entry: unknown): entry is WriteToolEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    (entry as { operation?: string }).operation === "write"
  );
}
