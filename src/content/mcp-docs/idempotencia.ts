export const meta = {
  id: "idempotencia",
  title: "Idempotência",
  description: "Como usar Idempotency-Key para evitar duplicação em operações de escrita.",
  order: 4,
};

export const content = `
# Idempotência

Operações de **escrita** (write tools) são protegidas por idempotência — reenviar a mesma requisição retorna o resultado original sem reexecutar a operação.

---

## Como funciona

1. Envie o header \`Idempotency-Key\` com um UUID v4 único por operação
2. Na primeira chamada, o MCP executa a operação e armazena o resultado
3. Em reenvios (mesmo token + mesma chave de idempotência), o resultado cacheado é devolvido imediatamente
4. Após **24 horas**, o registro expira e a operação pode ser reexecutada

---

## Usando o header

\`\`\`bash
curl -X POST https://seu-dominio.com/api/mcp \\
  -H "Authorization: Bearer mcp_live_SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "crm_res_partner_create",
      "arguments": {
        "name": "Academia Alpha",
        "email": "alpha@exemplo.com"
      }
    }
  }'
\`\`\`

---

## Escopo da chave

O par **(apiKeyId, Idempotency-Key)** forma o identificador único. Chaves de idempotência de tokens diferentes **não colidem** — cada canal tem seu espaço isolado.

---

## Erros relacionados

| Código | HTTP | Causa |
|---|---|---|
| \`idempotency_key_required\` | 400 | Write tool invocada sem o header \`Idempotency-Key\` |
| \`idempotency_conflict\` | 409 | Mesma chave usada para payload diferente (hash diverge) |

---

## Boas práticas

- Gere um UUID v4 por operação de negócio — nunca reutilize entre operações distintas
- Em automações (n8n, etc.), use o ID do item do workflow como semente do UUID
- Nunca use timestamps como Idempotency-Key — risco de colisão em alta frequência

\`\`\`javascript
// Exemplo n8n — Expression para gerar Idempotency-Key
{{ $workflow.id + '-' + $itemIndex + '-' + $runIndex }}
\`\`\`
`;
