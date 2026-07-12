// mcp/tools/fora-do-catalogo/bi-consulta-avancada.ts
// Tool MCP: bi_consulta_avancada (Caminho 3c , executor SQL read-only)
//
// Recebe um SQL pronto do agente e o executa sob o role nexus_mcp_bi (read-only).
// O text-to-SQL é responsabilidade do agente da F5 , esta tool apenas executa.
//
// Gate: só super_admin e admin veem e invocam esta tool.
// sempreVisivel: true , visibilidade não depende de domínio, apenas de role.
//
// Nota de auditoria (achado R2-I4):
//   O audit de params é automático , o pipeline do server.ts grava o rawInput
//   ({ sql }) em McpAuditLog.params antes mesmo de chamar o handler. Nenhum
//   código de audit é necessário aqui.
//
// Nota de outputSchema (achado R2-I6):
//   O outputSchema tem SOMENTE a forma tabular de sucesso , sem variante de erro.
//   Os caminhos de recusa (guard) e indisponibilidade (pool null) LANÇAM exceções,
//   que o pipeline do server.ts captura e mapeia para o outcome correto.
//   Isso é intencional e diferente das tools de freshness (que retornam { estado }).
//
// DATA DE INICIO DAS ANALISES (2026-07-12) , LIMITE CONHECIDO E DECLARADO:
//   O SQL chega PRONTO do agente. Nao existe forma segura de reescrever um SELECT arbitrario
//   (CTE, subquery, UNION, join de N fatos) para injetar `WHERE <coluna_de_data> >= corte`
//   sem risco de alterar a semantica da consulta. Entao esta tool NAO grampeia o SQL: ela
//   DECLARA o corte, no `aviso` e na descricao, para o agente (a) gerar o SQL ja com o piso e
//   (b) jamais apresentar como verdade da plataforma um numero que inclui periodo fora da
//   janela de analise.
//   A regra dura (obrigar o WHERE de piso) pertence ao PROMPT do BI e ao schema reference
//   (src/lib/agent/bi-schema-reference.ts + src/lib/agent/prompt/identity-base.ts), que sao
//   de outro dono. A defesa estrutural definitiva seria expor VIEWs ja filtradas pelo corte
//   ao role nexus_mcp_bi , decisao de produto/infra, fora do escopo desta tool.
import { z } from "zod";
import type { ToolEntry } from "../../catalog/types.js";
import { getBiPool } from "./bi-pool.js";
import { validarSqlSelect, normalizarSql } from "./sql-guard.js";
import { SqlGuardError } from "../../lib/failure.js";
import { avisoCorte, corteAtual, corteLabel } from "@/lib/corte-dados.js";
// Caminho definitivo (achado R2-M2): de mcp/tools/fora-do-catalogo/ para mcp/lib/ é ../../lib/failure.js

const CAP_LINHAS = 1000;

const inputSchema = z.object({
  sql: z.string().min(1),
});

const outputSchema = z.object({
  // Contrato de lista (Fase B): a ordenacao e definida pelo ORDER BY do SQL recebido.
  ordenadoPor: z.string().optional(),
  colunas: z.array(z.string()),
  linhas: z.array(z.record(z.string(), z.unknown())),
  // linhasRetornadas: quantidade efetivamente retornada (≤ 1000).
  // Quando truncado=true, este número NÃO representa o total real da query ,
  // apenas o que foi devolvido após o cap. O agente deve informar o usuário disso.
  linhasRetornadas: z.number().int(),
  truncado: z.boolean(),
  aviso: z.string(),
  /** Data de inicio das analises vigente (AAAA-MM-DD), para o agente conferir o SQL gerado. */
  dataInicioAnalises: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

export const biConsultaAvancada: ToolEntry<Input, Output> = {
  id: "bi_consulta_avancada",
  // dominio ausente intencionalmente , tool de domínio-neutro (sempreVisivel: true).
  sempreVisivel: true,
  gatedRoles: ["super_admin", "admin"],
  descricao:
    "Modo BI avançado (Caminho 3c): executa um SQL SELECT pronto sob o role " +
    "read-only nexus_mcp_bi. O SQL deve ser gerado pelo agente (F5); esta tool " +
    "apenas executa. Restrito a admin/super_admin. AVISO: consulta dinâmica, " +
    "resultados não são filtrados pelo RBAC semântico das tools de domínio. " +
    "IMPORTANTE: a plataforma só considera documentos a partir da data de início das " +
    "análises. Toda consulta a tabela de histórico (fato_nota_fiscal.data_emissao, " +
    "fato_pedido.data_orcamento, fato_financeiro_titulo.data_documento, " +
    "fato_estoque_movimento.data, fato_contabil_lancamento_item.data_lancamento, " +
    "fato_dfe.data_emissao...) DEVE trazer o piso `WHERE <coluna_de_data> >= '<data de " +
    "início das análises>'` , sem isso o número contradiz o dashboard e as demais tools. " +
    "A tool devolve a data vigente em `dataInicioAnalises`.",
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
    //
    //     Estratégia de cap (I-3):
    //     - Queries sem CTE: envelopar em subquery com LIMIT , forma canônica.
    //     - Queries com CTE (WITH ...): o PostgreSQL não aceita CTE dentro de subquery
    //       aninhada (`SELECT * FROM (WITH ... SELECT ...) AS x`). Nesse caso, executar
    //       o SQL diretamente e cortar o resultado em memória.
    const { sql: sqlNormalizado, temCte } = normalizarSql(input.sql);
    const sqlParaExecutar = temCte
      ? sqlNormalizado
      : `SELECT * FROM (${sqlNormalizado}) AS _bi_subquery LIMIT ${CAP_LINHAS + 1}`;
    const result = await pool.query(sqlParaExecutar);

    const truncado = result.rows.length > CAP_LINHAS;
    const linhas = truncado ? result.rows.slice(0, CAP_LINHAS) : result.rows;
    const colunas = (result.fields ?? []).map(
      (f: { name: string }) => f.name,
    );

    // (4) Retornar output validado pelo outputSchema (achado R2-I6).
    //     O aviso carrega a data de inicio das analises: o SQL nao e reescrito aqui (ver nota
    //     no topo), entao o agente PRECISA conferir se pos o piso de data , caso contrario o
    //     numero devolvido inclui periodo que a plataforma declara nao analisar.
    return outputSchema.parse({
      colunas,
      linhas,
      // Contrato de lista (Fase B): a ordem e a do SQL recebido do agente.
      ordenadoPor: "definida pelo ORDER BY do SQL da consulta",
      linhasRetornadas: linhas.length,
      truncado,
      dataInicioAnalises: corteAtual(),
      aviso:
        "Consulta dinâmica não auditada como tool semântica. " +
        "Resultados não são filtrados pelo RBAC de domínio. " +
        `${avisoCorte()} Este executor NÃO injeta o filtro no SQL: se a consulta tocou tabela ` +
        `de histórico sem o piso \`>= '${corteAtual()}'\`, o resultado inclui documentos ` +
        `anteriores a ${corteLabel()} e NÃO pode ser apresentado como número da plataforma ` +
        "(refaça a consulta com o piso de data).",
    });
  },
};
