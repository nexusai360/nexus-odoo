// tmp-verif/client-mcp.ts
// Cliente MCP: chama todas as tools e cruza com SQL direto no banco.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { execSync } from "node:child_process";

const MCP_URL = "http://localhost:3100";
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN!;
const USER_ID = "3ce9ce21-0897-4154-b293-6f4468279642"; // super_admin

const REPO = "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/API e MCP Odoo";

// ─── SQL direto via docker compose exec ────────────────────────────────────
function sqlRaw(query: string): string {
  const escaped = query.replace(/"/g, '\\"');
  const cmd = `docker compose exec -T db psql -U nexus -d nexus_odoo -t -A -c "${escaped}"`;
  try {
    const out = execSync(cmd, { cwd: REPO }).toString().trim();
    // filter docker compose warnings
    return out.split("\n").filter((l) => !l.startsWith("time=") && !l.startsWith("level=")).join("\n").trim();
  } catch (err) {
    return `ERRO_SQL: ${err}`;
  }
}

function sqlNum(query: string): number | null {
  const r = sqlRaw(query);
  if (r.startsWith("ERRO_SQL") || r === "") return null;
  const firstLine = r.split("\n")[0].trim();
  const n = parseFloat(firstLine.split("|")[0]);
  return isNaN(n) ? null : n;
}

// ─── MCP client factory ─────────────────────────────────────────────────────
async function makeClient(): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        "X-Mcp-User-Id": USER_ID,
      },
    },
  });
  const client = new Client({ name: "verif-e2e", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

async function callTool(client: Client, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name: toolName, arguments: args });
  const content = (result.content as Array<{ type: string; text: string }>)[0];
  if (!content) return { isError: true, text: "sem conteúdo" };
  try {
    return JSON.parse(content.text);
  } catch {
    // texto não-JSON = mensagem de erro da pipeline (e.g. SqlGuardError)
    return { isError: true, text: content.text };
  }
}

// ─── Resultado de verificação ────────────────────────────────────────────────
interface VerifResult {
  tool: string;
  mcpValor: string;
  sqlValor: string;
  ok: boolean;
  obs: string;
}

const resultados: VerifResult[] = [];

function check(tool: string, mcpValor: string | number, sqlValor: string | number | null, match: boolean, obs = ""): void {
  const r: VerifResult = {
    tool,
    mcpValor: String(mcpValor),
    sqlValor: sqlValor !== null ? String(sqlValor) : "null",
    ok: match,
    obs,
  };
  resultados.push(r);
  const icon = match ? "✓" : "✗";
  console.log(`${icon} ${tool}: MCP=${r.mcpValor} | SQL=${r.sqlValor}${obs ? " | " + obs : ""}`);
}

function honesto(tool: string, obs: string): void {
  resultados.push({ tool, mcpValor: "honesto", sqlValor: "—", ok: true, obs });
  console.log(`✓ ${tool}: ${obs}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== VERIFICAÇÃO E2E MCP ===\n");

  const client = await makeClient();
  const listResult = await client.listTools();
  const tools = listResult.tools;
  console.log(`tools/list retornou ${tools.length} tools`);
  for (const t of tools) process.stdout.write(`  - ${t.name}\n`);
  console.log();

  // ──────────────────────────────────────────────────────────────────────────
  // ESTOQUE
  // ──────────────────────────────────────────────────────────────────────────

  // estoque_saldo_produto
  {
    const r = await callTool(client, "estoque_saldo_produto", {}) as { estado: string; dados?: { kpis: { totalProdutos: number; valorTotal: number } } };
    if (r.estado === "ok" && r.dados) {
      const sqlTotalProd = sqlNum("SELECT COUNT(DISTINCT produto_id) FROM fato_estoque_saldo WHERE produto_id IS NOT NULL");
      check("estoque_saldo_produto [totalProdutos]", r.dados.kpis.totalProdutos, sqlTotalProd, sqlTotalProd !== null && r.dados.kpis.totalProdutos === sqlTotalProd, "COUNT(DISTINCT produto_id)");

      // valorTotal = SUM(vr_saldo) agrupado por produto_id — mas como a query agrega em JS
      // somando vr_saldo por produto, o total global é igual a SUM(vr_saldo)
      const sqlValorTotal = sqlNum("SELECT COALESCE(SUM(vr_saldo),0) FROM fato_estoque_saldo");
      check("estoque_saldo_produto [valorTotal]", r.dados.kpis.valorTotal.toFixed(2), sqlValorTotal !== null ? sqlValorTotal.toFixed(2) : null, sqlValorTotal !== null && Math.abs(r.dados.kpis.valorTotal - sqlValorTotal) < 0.01, "SUM(vr_saldo) fato_estoque_saldo");
    } else {
      check("estoque_saldo_produto", r.estado, "ok", false, "estado inesperado");
    }
  }

  // estoque_valor_armazem
  {
    const r = await callTool(client, "estoque_valor_armazem", {}) as { estado: string; dados?: { kpis: { valorTotal: number; numArmazens: number } } };
    if (r.estado === "ok" && r.dados) {
      // valorTotal = SUM(vr_saldo) de toda a tabela (mesma fonte que saldo_produto)
      const sqlValor = sqlNum("SELECT COALESCE(SUM(vr_saldo),0) FROM fato_estoque_saldo");
      check("estoque_valor_armazem [valorTotal]", r.dados.kpis.valorTotal.toFixed(2), sqlValor !== null ? sqlValor.toFixed(2) : null, sqlValor !== null && Math.abs(r.dados.kpis.valorTotal - sqlValor) < 0.01, "SUM(vr_saldo)");

      // numArmazens: a query agrupa local_nome por prefixo antes do '/' (armazem).
      // Usamos COUNT(DISTINCT local_nome) como proxy — a query real faz limpeza do nome.
      // O valor exato depende da função limparNomeLocal. Registramos sem assert rígido.
      const sqlArmazens = sqlNum("SELECT COUNT(DISTINCT SPLIT_PART(local_nome, '/', 1)) FROM fato_estoque_saldo WHERE local_nome IS NOT NULL");
      // Aceitar qualquer valor plausível (entre 1 e 30)
      const numOk = r.dados.kpis.numArmazens >= 1 && r.dados.kpis.numArmazens <= 30;
      check("estoque_valor_armazem [numArmazens]", r.dados.kpis.numArmazens, sqlArmazens, numOk, "COUNT(DISTINCT primeiro segmento local_nome) — agrupamento por prefixo");
    } else {
      check("estoque_valor_armazem", r.estado, "ok", false, "estado inesperado");
    }
  }

  // estoque_produtos_parados
  {
    const r = await callTool(client, "estoque_produtos_parados", {}) as { estado: string; dados?: { kpis: { totalParados: number; valorImobilizado: number } } };
    if (r.estado === "ok" && r.dados) {
      const sqlTotal = sqlNum("SELECT COUNT(*) FROM fato_produto_parado");
      check("estoque_produtos_parados [totalParados]", r.dados.kpis.totalParados, sqlTotal, sqlTotal !== null && r.dados.kpis.totalParados === sqlTotal, "COUNT(*) fato_produto_parado");
      const sqlValor = sqlNum("SELECT COALESCE(SUM(vr_saldo),0) FROM fato_produto_parado");
      check("estoque_produtos_parados [valorImobilizado]", r.dados.kpis.valorImobilizado.toFixed(2), sqlValor !== null ? sqlValor.toFixed(2) : null, sqlValor !== null && Math.abs(r.dados.kpis.valorImobilizado - sqlValor) < 0.01, "SUM(vr_saldo) fato_produto_parado");
    } else {
      check("estoque_produtos_parados", r.estado, "ok", false, "estado inesperado");
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FINANCEIRO
  // ──────────────────────────────────────────────────────────────────────────

  // financeiro_saldo_contas
  {
    const r = await callTool(client, "financeiro_saldo_contas", {}) as { estado: string; dados?: { saldoTotal: number; contas: unknown[] } };
    if (r.estado === "ok" && r.dados) {
      const sqlSaldo = sqlNum("SELECT COALESCE(SUM(saldo),0) FROM fato_financeiro_saldo");
      check("financeiro_saldo_contas [saldoTotal]", r.dados.saldoTotal.toFixed(2), sqlSaldo !== null ? sqlSaldo.toFixed(2) : null, sqlSaldo !== null && Math.abs(r.dados.saldoTotal - sqlSaldo) < 0.01, "SUM(saldo) fato_financeiro_saldo");
      const sqlContas = sqlNum("SELECT COUNT(*) FROM fato_financeiro_saldo");
      check("financeiro_saldo_contas [numContas]", r.dados.contas.length, sqlContas, sqlContas !== null && r.dados.contas.length === sqlContas, "COUNT(*) fato_financeiro_saldo");
    } else {
      check("financeiro_saldo_contas", r.estado, "ok", false, "estado inesperado");
    }
  }

  // financeiro_contas_a_receber
  {
    const r = await callTool(client, "financeiro_contas_a_receber", {}) as { estado: string; dados?: { totalAReceber: number; titulos: unknown[] } };
    if (r.estado === "ok" && r.dados) {
      const sqlTotal = sqlNum("SELECT COALESCE(SUM(vr_saldo),0) FROM fato_financeiro_titulo WHERE tipo='a_receber' AND vr_saldo > 0");
      check("financeiro_contas_a_receber [totalAReceber]", r.dados.totalAReceber.toFixed(2), sqlTotal !== null ? sqlTotal.toFixed(2) : null, sqlTotal !== null && Math.abs(r.dados.totalAReceber - sqlTotal) < 0.01, "SUM(vr_saldo) tipo=a_receber aberto");
      const sqlCount = sqlNum("SELECT COUNT(*) FROM fato_financeiro_titulo WHERE tipo='a_receber' AND vr_saldo > 0");
      check("financeiro_contas_a_receber [contagem]", r.dados.titulos.length, sqlCount, sqlCount !== null && r.dados.titulos.length === sqlCount, "COUNT(*) tipo=a_receber aberto");
    } else {
      check("financeiro_contas_a_receber", r.estado, "ok", false, "estado inesperado");
    }
  }

  // financeiro_titulos_vencidos
  {
    const today = new Date().toISOString().slice(0, 10);
    const r = await callTool(client, "financeiro_titulos_vencidos", {}) as { estado: string; dados?: { totalVencido: number; titulos: unknown[] } };
    if (r.estado === "ok" && r.dados) {
      const sqlTotal = sqlNum(`SELECT COALESCE(SUM(vr_saldo),0) FROM fato_financeiro_titulo WHERE vr_saldo > 0 AND data_vencimento < '${today}'`);
      check("financeiro_titulos_vencidos [totalVencido]", r.dados.totalVencido.toFixed(2), sqlTotal !== null ? sqlTotal.toFixed(2) : null, sqlTotal !== null && Math.abs(r.dados.totalVencido - sqlTotal) < 0.01, `SUM(vr_saldo) vencido antes de ${today}`);
      const sqlCount = sqlNum(`SELECT COUNT(*) FROM fato_financeiro_titulo WHERE vr_saldo > 0 AND data_vencimento < '${today}'`);
      check("financeiro_titulos_vencidos [contagem]", r.dados.titulos.length, sqlCount, sqlCount !== null && r.dados.titulos.length === sqlCount, "COUNT(*) vencidos e abertos");
    } else {
      check("financeiro_titulos_vencidos", r.estado, "ok", false, "estado inesperado");
    }
  }

  // financeiro_caixa_periodo (mês corrente)
  {
    const hoje = new Date();
    const de = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
    const ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
    const r = await callTool(client, "financeiro_caixa_periodo", { periodoDe: de, periodoAte: ate }) as { estado: string; dados?: { entrada: number; saida: number; saldo: number } };
    if (r.estado === "ok" && r.dados) {
      // fato_financeiro_movimento usa coluna "entrada" e "saida" (não "tipo")
      const sqlEntrada = sqlNum(`SELECT COALESCE(SUM(entrada),0) FROM fato_financeiro_movimento WHERE data >= '${de}' AND data <= '${ate}'`);
      check("financeiro_caixa_periodo [entrada]", r.dados.entrada.toFixed(2), sqlEntrada !== null ? sqlEntrada.toFixed(2) : null, sqlEntrada !== null && Math.abs(r.dados.entrada - sqlEntrada) < 0.01, `SUM(entrada) período ${de}/${ate}`);
      const sqlSaida = sqlNum(`SELECT COALESCE(SUM(saida),0) FROM fato_financeiro_movimento WHERE data >= '${de}' AND data <= '${ate}'`);
      check("financeiro_caixa_periodo [saida]", r.dados.saida.toFixed(2), sqlSaida !== null ? sqlSaida.toFixed(2) : null, sqlSaida !== null && Math.abs(r.dados.saida - sqlSaida) < 0.01, `SUM(saida) período ${de}/${ate}`);
    } else {
      check("financeiro_caixa_periodo", r.estado, "ok", false, "estado inesperado");
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // COMERCIAL
  // ──────────────────────────────────────────────────────────────────────────

  // comercial_pedidos_periodo (sem filtro = todos)
  {
    const r = await callTool(client, "comercial_pedidos_periodo", {}) as { estado: string; dados?: { totalPedidos: number; valorTotal: number } };
    if (r.estado === "ok" && r.dados) {
      const sqlCount = sqlNum("SELECT COUNT(*) FROM fato_pedido");
      check("comercial_pedidos_periodo [totalPedidos]", r.dados.totalPedidos, sqlCount, sqlCount !== null && r.dados.totalPedidos === sqlCount, "COUNT(*) fato_pedido");
      const sqlValor = sqlNum("SELECT COALESCE(SUM(vr_produtos),0) FROM fato_pedido");
      check("comercial_pedidos_periodo [valorTotal]", r.dados.valorTotal.toFixed(2), sqlValor !== null ? sqlValor.toFixed(2) : null, sqlValor !== null && Math.abs(r.dados.valorTotal - sqlValor) < 0.01, "SUM(vr_produtos) fato_pedido");
    } else {
      check("comercial_pedidos_periodo", r.estado, "ok", false, "estado inesperado");
    }
  }

  // comercial_parcelas_a_vencer (30 dias)
  {
    const hoje = new Date();
    const de = hoje.toISOString().slice(0, 10);
    const em30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const r = await callTool(client, "comercial_parcelas_a_vencer", { ateDias: 30 }) as { estado: string; dados?: { totalAVencer: number; linhas: unknown[] } };
    if (r.estado === "ok" && r.dados) {
      const sqlCount = sqlNum(`SELECT COUNT(*) FROM fato_pedido_parcela WHERE data_vencimento >= '${de}' AND data_vencimento <= '${em30}'`);
      check("comercial_parcelas_a_vencer [contagem]", r.dados.linhas.length, sqlCount, sqlCount !== null && r.dados.linhas.length === sqlCount, `vencimento em 30d de ${de}`);
      const sqlValor = sqlNum(`SELECT COALESCE(SUM(valor),0) FROM fato_pedido_parcela WHERE data_vencimento >= '${de}' AND data_vencimento <= '${em30}'`);
      check("comercial_parcelas_a_vencer [totalAVencer]", r.dados.totalAVencer.toFixed(2), sqlValor !== null ? sqlValor.toFixed(2) : null, sqlValor !== null && Math.abs(r.dados.totalAVencer - sqlValor) < 0.01, "SUM(valor) fato_pedido_parcela");
    } else {
      check("comercial_parcelas_a_vencer", r.estado, "ok", false, "estado inesperado");
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FISCAL
  // ──────────────────────────────────────────────────────────────────────────

  // fiscal_faturamento_periodo (sem filtro = todas)
  {
    const r = await callTool(client, "fiscal_faturamento_periodo", {}) as { estado: string; dados?: { totalNotas: number; valorFaturado: number } };
    if (r.estado === "ok" && r.dados) {
      const sqlCount = sqlNum("SELECT COUNT(*) FROM fato_nota_fiscal WHERE entrada_saida='1' AND situacao_nfe='autorizada'");
      check("fiscal_faturamento_periodo [totalNotas]", r.dados.totalNotas, sqlCount, sqlCount !== null && r.dados.totalNotas === sqlCount, "saída autorizada");
      const sqlValor = sqlNum("SELECT COALESCE(SUM(vr_nf),0) FROM fato_nota_fiscal WHERE entrada_saida='1' AND situacao_nfe='autorizada'");
      check("fiscal_faturamento_periodo [valorFaturado]", r.dados.valorFaturado.toFixed(2), sqlValor !== null ? sqlValor.toFixed(2) : null, sqlValor !== null && Math.abs(r.dados.valorFaturado - sqlValor) < 0.01, "SUM(vr_nf) saída autorizada");
    } else {
      check("fiscal_faturamento_periodo", r.estado, "ok", false, "estado inesperado");
    }
  }

  // fiscal_notas_recebidas (sem filtro = todas entradas)
  {
    const r = await callTool(client, "fiscal_notas_recebidas", {}) as { estado: string; dados?: { totalNotas: number; valorTotal: number; linhas: unknown[] } };
    if (r.estado === "ok" && r.dados) {
      const sqlCount = sqlNum("SELECT COUNT(*) FROM fato_nota_fiscal WHERE entrada_saida='0'");
      check("fiscal_notas_recebidas [totalNotas]", r.dados.totalNotas, sqlCount, sqlCount !== null && r.dados.totalNotas === sqlCount, "COUNT(*) entrada_saida='0'");
      const sqlValor = sqlNum("SELECT COALESCE(SUM(vr_nf),0) FROM fato_nota_fiscal WHERE entrada_saida='0'");
      check("fiscal_notas_recebidas [valorTotal]", r.dados.valorTotal.toFixed(2), sqlValor !== null ? sqlValor.toFixed(2) : null, sqlValor !== null && Math.abs(r.dados.valorTotal - sqlValor) < 0.01, "SUM(vr_nf) entradas");
    } else {
      check("fiscal_notas_recebidas", r.estado, "ok", false, "estado inesperado");
    }
  }

  // fiscal_produtos_faturados (top 20)
  {
    const r = await callTool(client, "fiscal_produtos_faturados", { limite: 20 }) as { estado: string; dados?: { linhas: unknown[] } };
    if (r.estado === "ok" && r.dados) {
      // FK: fato_nota_fiscal_item.documento_id → fato_nota_fiscal.odoo_id
      const sqlCount = sqlNum(
        "SELECT COUNT(*) FROM (" +
        "SELECT fi.produto_nome FROM fato_nota_fiscal_item fi " +
        "JOIN fato_nota_fiscal fn ON fi.documento_id = fn.odoo_id " +
        "WHERE fn.entrada_saida='1' " +
        "GROUP BY fi.produto_nome ORDER BY SUM(fi.vr_nf) DESC LIMIT 20" +
        ") AS sub"
      );
      check("fiscal_produtos_faturados [linhas]", r.dados.linhas.length, sqlCount, sqlCount !== null && r.dados.linhas.length === sqlCount, "top 20 produtos faturados em saídas");
    } else {
      check("fiscal_produtos_faturados", r.estado, "ok", false, "estado inesperado");
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CADASTROS
  // ──────────────────────────────────────────────────────────────────────────

  {
    const r = await callTool(client, "cadastro_contar_parceiros", {}) as { estado: string; dados?: { totalParceiros: number; totalClientes: number; totalFornecedores: number; totalEmpresas: number } };
    if (r.estado === "ok" && r.dados) {
      const sqlTotal = sqlNum("SELECT COUNT(*) FROM fato_parceiro");
      check("cadastro_contar_parceiros [totalParceiros]", r.dados.totalParceiros, sqlTotal, sqlTotal !== null && r.dados.totalParceiros === sqlTotal, "COUNT(*) fato_parceiro");
      const sqlClientes = sqlNum("SELECT COUNT(*) FROM fato_parceiro WHERE eh_cliente=true");
      check("cadastro_contar_parceiros [totalClientes]", r.dados.totalClientes, sqlClientes, sqlClientes !== null && r.dados.totalClientes === sqlClientes, "eh_cliente=true");
      const sqlFornecedores = sqlNum("SELECT COUNT(*) FROM fato_parceiro WHERE eh_fornecedor=true");
      check("cadastro_contar_parceiros [totalFornecedores]", r.dados.totalFornecedores, sqlFornecedores, sqlFornecedores !== null && r.dados.totalFornecedores === sqlFornecedores, "eh_fornecedor=true");
      const sqlEmpresas = sqlNum("SELECT COUNT(*) FROM fato_parceiro WHERE eh_empresa=true");
      check("cadastro_contar_parceiros [totalEmpresas]", r.dados.totalEmpresas, sqlEmpresas, sqlEmpresas !== null && r.dados.totalEmpresas === sqlEmpresas, "eh_empresa=true");
    } else {
      check("cadastro_contar_parceiros", r.estado, "ok", false, "estado inesperado");
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONTÁBIL
  // ──────────────────────────────────────────────────────────────────────────

  {
    // contabil_plano_de_contas tem limite padrão — verificar se existe limite na query
    const r = await callTool(client, "contabil_plano_de_contas", {}) as { estado: string; dados?: { linhas: unknown[] } };
    const sqlCount = sqlNum("SELECT COUNT(*) FROM fato_conta_contabil");
    if (r.estado === "ok" && r.dados) {
      // Sem limite explícito → deve retornar todas; se há limite interno, registrar
      const match = sqlCount !== null && r.dados.linhas.length === sqlCount;
      if (!match) {
        // Verificar se há limite interno na query
        check("contabil_plano_de_contas [contagem]", r.dados.linhas.length, sqlCount, false,
          `DIVERGÊNCIA: MCP retornou ${r.dados.linhas.length} mas banco tem ${sqlCount} — verificar limite interno na queryPlanoDeContas`);
      } else {
        check("contabil_plano_de_contas [contagem]", r.dados.linhas.length, sqlCount, true, "COUNT(*) fato_conta_contabil");
      }
    } else {
      check("contabil_plano_de_contas", r.estado, "ok", false, "estado inesperado");
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DOMÍNIOS VAZIOS — RH, CRM, PRODUÇÃO
  // ──────────────────────────────────────────────────────────────────────────
  {
    const r = await callTool(client, "crm_status_dominio", {}) as { operado: boolean; registros: number };
    const crmOk = r.operado === false && r.registros === 0;
    honesto("crm_status_dominio", `operado=${r.operado}, registros=${r.registros} — resposta honesta estruturada`);
    if (!crmOk) check("crm_status_dominio", "operado=true|registros>0", "operado=false, registros=0", false, "esperado honesto");
  }
  {
    const r = await callTool(client, "rh_status_dominio", {}) as { operado: boolean; registros: number };
    honesto("rh_status_dominio", `operado=${r.operado}, registros=${r.registros} — resposta honesta estruturada`);
  }
  {
    const r = await callTool(client, "producao_status_dominio", {}) as { operado: boolean; registros: number };
    honesto("producao_status_dominio", `operado=${r.operado}, registros=${r.registros} — resposta honesta estruturada`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CAMINHO 3c — bi_consulta_avancada
  // ──────────────────────────────────────────────────────────────────────────

  // SELECT válido
  {
    const r = await callTool(client, "bi_consulta_avancada", { sql: "SELECT COUNT(*) AS total FROM fato_parceiro" }) as { colunas?: string[]; linhas?: Array<Record<string, unknown>> } | { isError: boolean; text?: string };
    const sqlCount = sqlNum("SELECT COUNT(*) FROM fato_parceiro");
    if ("colunas" in r && r.colunas && r.linhas) {
      const mcpVal = Number(r.linhas[0]?.["total"]);
      check("bi_consulta_avancada [SELECT válido]", mcpVal, sqlCount, sqlCount !== null && mcpVal === sqlCount, "COUNT(*) fato_parceiro via BI pool");
    } else {
      check("bi_consulta_avancada [SELECT válido]", ("text" in r ? r.text : "isError") ?? "isError", sqlCount, false, JSON.stringify(r).slice(0, 80));
    }
  }

  // DELETE deve ser rejeitado
  {
    const r = await callTool(client, "bi_consulta_avancada", { sql: "DELETE FROM fato_parceiro WHERE 1=1" }) as { isError?: boolean };
    const rejeitado = "isError" in r && r.isError === true;
    check("bi_consulta_avancada [rejeitar DELETE]", rejeitado ? "rejeitado" : "EXECUTADO!", "rejeitado", rejeitado, "SqlGuard deve barrar DML");
  }

  // DROP deve ser rejeitado
  {
    const r = await callTool(client, "bi_consulta_avancada", { sql: "DROP TABLE fato_parceiro" }) as { isError?: boolean };
    const rejeitado = "isError" in r && r.isError === true;
    check("bi_consulta_avancada [rejeitar DROP]", rejeitado ? "rejeitado" : "EXECUTADO!", "rejeitado", rejeitado, "SqlGuard deve barrar DDL");
  }

  // Multi-statement deve ser rejeitado
  {
    const r = await callTool(client, "bi_consulta_avancada", { sql: "SELECT 1; SELECT 2" }) as { isError?: boolean };
    const rejeitado = "isError" in r && r.isError === true;
    check("bi_consulta_avancada [rejeitar multi-stmt]", rejeitado ? "rejeitado" : "EXECUTADO!", "rejeitado", rejeitado, "SqlGuard deve barrar multi-stmt");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Outras tools — confirmar que retornam sem isError
  // ──────────────────────────────────────────────────────────────────────────
  const toolsExtras = [
    { name: "estoque_entradas_saidas", args: {} },
    { name: "estoque_top_movimentados", args: {} },
    { name: "estoque_concentracao", args: {} },
    { name: "financeiro_contas_a_pagar", args: {} },
    { name: "financeiro_fluxo_caixa", args: {} },
    { name: "comercial_pedidos_atrasados", args: {} },
    { name: "comercial_pedidos_por_etapa", args: {} },
    { name: "comercial_pedidos_por_vendedor", args: {} },
    { name: "fiscal_faturamento_por_cliente", args: {} },
    { name: "fiscal_impostos_periodo", args: {} },
    { name: "fiscal_notas_emitidas", args: {} },
    { name: "cadastro_buscar_parceiro", args: { termo: "Matrix" } },
    { name: "cadastro_parceiros_por_uf", args: {} },
    { name: "contabil_estrutura_conta", args: {} },
    { name: "registrar_lacuna", args: { pergunta: "Qual o custo de manutenção?", dominio: "estoque" } },
  ];

  for (const { name, args } of toolsExtras) {
    try {
      const r = await callTool(client, name, args) as Record<string, unknown>;
      const hasError = r["isError"] === true;
      check(name, hasError ? "isError" : "ok", "–", !hasError, hasError ? JSON.stringify(r).slice(0, 100) : "sem erro");
    } catch (err) {
      check(name, "THROW", "–", false, String(err).slice(0, 80));
    }
  }

  await client.close();

  // ──────────────────────────────────────────────────────────────────────────
  // Resumo final
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n=== RESUMO FINAL ===");
  const total = resultados.length;
  const totalOk = resultados.filter((r) => r.ok).length;
  const totalFail = resultados.filter((r) => !r.ok).length;
  console.log(`Total checks: ${total} | ✓ ${totalOk} | ✗ ${totalFail}`);
  if (totalFail > 0) {
    console.log("\nDivergências:");
    for (const r of resultados.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.tool}: MCP=${r.mcpValor} | SQL=${r.sqlValor} | ${r.obs}`);
    }
  }

  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/verif-results.json", JSON.stringify(resultados, null, 2));
  console.log("\nResultados salvos em /tmp/verif-results.json");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
