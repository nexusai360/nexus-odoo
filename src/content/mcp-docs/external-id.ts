export const meta = {
  id: "external-id",
  title: "External ID",
  description: "Como usar IDs externos para referenciar registros entre sistemas.",
  order: 5,
};

export const content = `
# External ID

O MCP suporta **External ID** para referenciar registros do Odoo a partir de sistemas externos, sem precisar conhecer o ID interno do Postgres.

---

## O que é External ID?

No Odoo, cada registro pode ter um **xmlid** (External ID) — um identificador textual único no formato \`modulo.referencia\`. O MCP expõe esse campo em todas as tools que retornam entidades do Odoo.

---

## Usando External ID em consultas

Algumas tools aceitam \`externalId\` como alternativa ao \`id\` numérico:

\`\`\`bash
curl -X POST https://seu-dominio.com/api/mcp \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "estoque_saldo_produto",
      "arguments": {
        "externalId": "product.product_template_1"
      }
    }
  }'
\`\`\`

---

## External ID em operações de escrita

Ao criar um registro via write tool, você pode fornecer um \`externalId\` para facilitar referência futura:

\`\`\`json
{
  "name": "Academia Beta",
  "email": "beta@exemplo.com",
  "externalId": "meu_sistema.academia_beta_001"
}
\`\`\`

O Odoo registra esse xmlid e o MCP devolve no campo \`externalId\` da resposta.

---

## Formato válido

- Prefixo: letras, números e underscores (\`[a-z0-9_]+\`)
- Separador: ponto (\`.\`)
- Referência: letras, números, underscores e hífens

Exemplos válidos:
- \`meu_erp.cliente_1234\`
- \`integracao_n8n.pedido_abc-456\`

Exemplos inválidos:
- \`1234.cliente\` (prefixo numérico)
- \`erp/cliente\` (barra não permitida)

---

## Dicas

- Prefixe External IDs com o nome do seu sistema para evitar colisões: \`n8n_producao.xxx\`
- External IDs são imutáveis após criação — escolha-os com cuidado
- Use External IDs ao integrar múltiplos sistemas que precisam referenciar o mesmo registro
`;
