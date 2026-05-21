export const meta = {
  id: "changelog",
  title: "Changelog",
  description: "Histórico de versões e mudanças do MCP semântico.",
  order: 7,
};

export const content = `
# Changelog

Histórico de versões do MCP semântico. Versões seguem **versionamento monotônico** (inteiro incremental) alinhado ao campo \`addedInVersion\` do catálogo de tools.

---

## Versão 7 — 2026-05

**Onda E — Contábil**
- Nova tool: \`contabil_balancete\` — balancete analítico por conta e período
- Nova tool: \`contabil_dre_sintetico\` — DRE sintético por período

---

## Versão 6 — 2026-05

**Onda D — Cadastros**
- Nova tool: \`cadastros_parceiros\` — listagem de parceiros (clientes/fornecedores)
- Nova tool: \`cadastros_produtos\` — catálogo de produtos
- Nova tool: \`cadastros_armazens\` — armazéns e localizações

---

## Versão 5 — 2026-05

**Onda C — Fiscal**
- Nova tool: \`fiscal_nfes_emitidas\` — NF-es emitidas no período
- Nova tool: \`fiscal_nfes_recebidas\` — NF-es recebidas no período
- Nova tool: \`fiscal_impostos_apurados\` — impostos apurados
- Nova tool: \`fiscal_cfop_distribuicao\` — distribuição por CFOP
- Nova tool: \`fiscal_retencoes\` — retenções de impostos
- Nova tool: \`fiscal_resumo_sped\` — resumo SPED fiscal

---

## Versão 4 — 2026-05

**Onda B — Comercial**
- Nova tool: \`comercial_pedidos_venda\` — pedidos de venda no período
- Nova tool: \`comercial_faturamento_cliente\` — faturamento por cliente
- Nova tool: \`comercial_mix_produtos\` — mix de produtos vendidos
- Nova tool: \`comercial_ticket_medio\` — ticket médio por período
- Nova tool: \`comercial_pipeline\` — pipeline de vendas

**Write tools — CRM (Bloco J)**
- Nova write tool: \`crm_res_partner_create\` — cria parceiro no Odoo (requer \`Idempotency-Key\`)

---

## Versão 3 — 2026-05

**Onda 1 — Financeiro**
- Nova tool: \`financeiro_contas_receber\` — contas a receber
- Nova tool: \`financeiro_contas_pagar\` — contas a pagar
- Nova tool: \`financeiro_fluxo_caixa\` — fluxo de caixa por período
- Nova tool: \`financeiro_inadimplencia\` — análise de inadimplência
- Nova tool: \`financeiro_faturamento_periodo\` — faturamento por período
- Nova tool: \`financeiro_margem_bruta\` — margem bruta

---

## Versão 2 — 2026-04

**Onda 1 — Estoque**
- Nova tool: \`estoque_saldo_produto\` — saldo e valorização
- Nova tool: \`estoque_valor_armazem\` — valor por armazém
- Nova tool: \`estoque_entradas_saidas\` — movimentações
- Nova tool: \`estoque_top_movimentados\` — top produtos movimentados
- Nova tool: \`estoque_produtos_parados\` — produtos sem movimentação
- Nova tool: \`estoque_concentracao\` — concentração de valor

**Caminho 3**
- Nova tool: \`registrar_lacuna\` — registra pergunta fora do catálogo (Caminho 3a)
- Nova tool: \`bi_consulta_avancada\` — executor SQL seguro (Caminho 3c, admin/super_admin)

---

## Versão 1 — 2026-04

- Servidor MCP semântico inicial
- Transporte: Streamable HTTP (protocolo 2025-06-18)
- RBAC 7 camadas implementado
- Suporte a autenticação por API Key e service token
- Audit log em \`mcp_audit_log\`
`;
