export const meta = {
  id: "rate-limits",
  title: "Rate Limits",
  description: "Limites de chamadas por minuto e como lidar com 429.",
  order: 6,
};

export const content = `
# Rate Limits

Cada chave de API tem um **rate limit independente** configurado em chamadas por minuto.

---

## Configuração

O limite é definido ao criar ou editar a chave em **Integrações → Servidor MCP → Chaves de Acesso** (campo **Rate limit**).

- **Mínimo:** 1 chamada/min
- **Máximo:** 600 chamadas/min
- **Padrão:** 60 chamadas/min

---

## Quando o limite é atingido

O MCP responde com HTTP **429** e código \`rate_limit_exceeded\`:

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "rate_limit_exceeded",
    "data": {
      "errorCode": "rate_limit_exceeded",
      "errorMessage": "Limite de 60 chamadas/min atingido. Aguarde e tente novamente.",
      "retryAfterMs": 12000
    }
  }
}
\`\`\`

O campo \`retryAfterMs\` indica quantos milissegundos aguardar antes de retentar.

---

## Estratégia de retry recomendada

\`\`\`javascript
// Exponential backoff com jitter
async function callMcpWithRetry(payload, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const data = await res.json();
      const waitMs = data?.error?.data?.retryAfterMs ?? (2 ** attempt * 1000);
      const jitter = Math.random() * 500;
      await new Promise(r => setTimeout(r, waitMs + jitter));
      continue;
    }

    return res.json();
  }
  throw new Error('Max retries atingido');
}
\`\`\`

---

## Monitoramento

O painel **Logs / Audit** filtrável por status \`rate_limit_exceeded\` permite identificar chaves que estão atingindo o limite com frequência. Se necessário, eleve o rate limit ou distribua carga entre múltiplas chaves.

---

## Boas práticas

- Use **paginação** em tools que retornam listas — não faça polling em loop apertado
- Implemente **exponential backoff** com jitter em automações
- Distribua chamadas em janelas de tempo quando possível
- Para cargas altas, considere aumentar o rate limit ou falar com o administrador
`;
