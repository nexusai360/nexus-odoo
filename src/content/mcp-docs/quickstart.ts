/**
 * Conteúdo da seção Quickstart da documentação do MCP semântico.
 * Abordagem: string markdown (sem setup MDX/pesado).
 * Renderizado por McpDocsRenderer usando react-markdown (se disponível) ou <pre>.
 */
export const meta = {
  id: "quickstart",
  title: "Quickstart",
  description: "Comece a usar o MCP semântico em 3 passos.",
  order: 1,
};

export const content = `
# Quickstart

Coloque o MCP semântico em uso em **3 passos**.

---

## Passo 1 — Criar uma chave de API

Acesse **Integrações → Servidor MCP → Chaves de Acesso** e clique em **Nova Chave**.

Preencha:
- **Label** — nome descritivo (ex.: \`n8n-producao\`)
- **Capabilities** — módulos e ações autorizadas (ex.: \`estoque: read\`, \`financeiro: read\`)
- **Rate limit** — chamadas por minuto (padrão: 60)
- **Expiração** — opcional; deixe em branco para chave permanente

Ao criar, o token completo é exibido **uma única vez** no formato:

\`\`\`
mcp_live_<32-bytes-base64url>
\`\`\`

Guarde em segredo. Após fechar o modal, apenas os últimos 4 caracteres ficam visíveis.

---

## Passo 2 — Invocar uma tool via HTTP

Todas as chamadas usam **Streamable HTTP** no endpoint:

\`\`\`
POST https://seu-dominio.com/api/mcp
Content-Type: application/json
Authorization: Bearer mcp_live_<sua-chave>
X-MCP-Request-ID: <uuid-v4-opcional>
Idempotency-Key: <chave-idempotencia-para-writes>
\`\`\`

Exemplo — consultar saldo de estoque:

\`\`\`bash
curl -X POST https://seu-dominio.com/api/mcp \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Idempotency-Key: req-$(date +%s)" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "estoque_saldo_produto",
      "arguments": {
        "armazemId": 1
      }
    }
  }'
\`\`\`

Resposta de sucesso:

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\\"kpis\\":{\\"totalProdutos\\":42,\\"produtosNegativos\\":0,\\"valorTotal\\":198750.00},\\"linhas\\":[...]}"
      }
    ]
  }
}
\`\`\`

---

## Passo 3 — Verificar no Log de Audit

Acesse **Integrações → Servidor MCP → Logs** para ver todas as chamadas registradas.

Cada linha mostra:
- **Timestamp** — data/hora da chamada
- **Chave** — últimos 4 dígitos do token usado
- **Tool** — nome da tool invocada
- **Status** — \`success\`, \`error\` ou \`denied\`
- **Duração** — tempo de resposta em ms

Clique em qualquer linha para ver payload completo, resultado e snapshots.

> **Dica**: Use o botão **CSV** para exportar logs filtrados para auditoria ou análise.
`;
