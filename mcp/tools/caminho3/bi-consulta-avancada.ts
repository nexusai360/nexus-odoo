// mcp/tools/caminho3/bi-consulta-avancada.ts
// Tool MCP: bi_consulta_avancada (Caminho 3c — executor SQL read-only)
//
// Recebe um SQL pronto do agente e o executa sob o role nexus_mcp_bi (read-only).
// O text-to-SQL é responsabilidade do agente da F5 — esta tool apenas executa.
//
// Gate: só super_admin e admin veem e invocam esta tool.
// sempreVisivel: true — visibilidade não depende de domínio, apenas de role.
//
// Nota de auditoria (achado R2-I4):
//   O audit de params é automático — o pipeline do server.ts grava o rawInput
//   ({ sql }) em McpAuditLog.params antes mesmo de chamar o handler. Nenhum
//   código de audit é necessário aqui.
//
// Nota de outputSchema (achado R2-I6):
//   O outputSchema tem SOMENTE a forma tabular de sucesso — sem variante de erro.
//   Os caminhos de recusa (guard) e indisponibilidade (pool null) LANÇAM exceções,
//   que o pipeline do server.ts captura e mapeia para o outcome correto.
//   Isso é intencional e diferente das tools de freshness (que retornam { estado }).
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { getBiPool } from "./bi-pool.js";
import { validarSqlSelect } from "./sql-guard.js";
import { SqlGuardError } from "../../lib/failure.js";
// Caminho definitivo (achado R2-M2): de mcp/tools/caminho3/ para mcp/lib/ é ../../lib/failure.js

const CAP_LINHAS = 1000;

const inputSchema = z.object({
  sql: z.string().min(1),
});

const outputSchema = z.object({
  colunas: z.array(z.string()),
  linhas: z.array(z.record(z.string(), z.unknown())),
  totalLinhas: z.number().int(),
  truncado: z.boolean(),
  aviso: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const biConsultaAvancada: ToolEntry<Input, Output> = {
  id: "bi_consulta_avancada",
  // dominio ausente intencionalmente — tool de domínio-neutro (sempreVisivel: true).
  sempreVisivel: true,
  gatedRoles: ["super_admin", "admin"],
  descricao:
    "Modo BI avançado (Caminho 3c): executa um SQL SELECT pronto sob o role " +
    "read-only nexus_mcp_bi. O SQL deve ser gerado pelo agente (F5); esta tool " +
    "apenas executa. Restrito a admin/super_admin. AVISO: consulta dinâmica — " +
    "resultados não são filtrados pelo RBAC semântico das tools de domínio.",
  inputSchemaShape: inputSchema.shape,
  inputSchema,
  outputSchema,
  handler: async (input, _ctx): Promise<Output> => {
    // (1) Verificação estrutural do SQL via AST (defesa-em-profundidade).
    //     Falha → lança SqlGuardError → pipeline mapeia para outcome="invalid_input".
    const guardResult = await validarSqlSelect(input.sql);
    if (!guardResult.ok) {
      throw new SqlGuardError(guardResult.motivo);
    }

    // (2) Obter pool dedicado do Caminho 3c.
    //     Pool null → MCP_BI_DATABASE_URL não configurada → lança Error comum → outcome="error".
    const pool = getBiPool();
    if (!pool) {
      throw new Error(
        "Modo BI não configurado: MCP_BI_DATABASE_URL não definida. " +
          "Configure a variável de ambiente e reinicie o servidor MCP.",
      );
    }

    // (3) Executar com cap de 1001 linhas para detectar truncamento.
    //     O pool já tem default_transaction_read_only=on e statement_timeout=5s
    //     configurados no handler de connect (bi-pool.ts).
    //     SQL executado via pg cru (pool.query), não $queryRawUnsafe.
    const sqlComCap = `SELECT * FROM (${input.sql}) AS _bi_subquery LIMIT ${CAP_LINHAS + 1}`;
    const result = await pool.query(sqlComCap);

    const truncado = result.rows.length > CAP_LINHAS;
    const linhas = truncado ? result.rows.slice(0, CAP_LINHAS) : result.rows;
    const colunas = (result.fields ?? []).map(
      (f: { name: string }) => f.name,
    );

    // (4) Retornar output validado pelo outputSchema (achado R2-I6).
    return outputSchema.parse({
      colunas,
      linhas,
      totalLinhas: linhas.length,
      truncado,
      aviso:
        "Consulta dinâmica não auditada como tool semântica. " +
        "Resultados não são filtrados pelo RBAC de domínio.",
    });
  },
};
