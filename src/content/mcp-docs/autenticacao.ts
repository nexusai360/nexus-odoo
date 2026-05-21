export const meta = {
  id: "autenticacao",
  title: "Autenticação",
  description: "Bearer token, headers obrigatórios e modos de autenticação.",
  order: 2,
};

export const content = `
# Autenticação

O MCP semântico usa **Bearer Token** via API Key. Não há sessão — cada request é autenticado independentemente.

---

## Header obrigatório

\`\`\`
Authorization: Bearer mcp_live_<token>
\`\`\`

O token é gerado ao criar a chave em **Integrações → Servidor MCP → Chaves de Acesso**.
Formato: \`mcp_live_\` + 32 bytes em base64url (total ~47 caracteres).

---

## Headers recomendados

| Header | Obrigatório | Descrição |
|---|---|---|
| \`Authorization\` | Sim | Bearer token da chave de API |
| \`Content-Type\` | Sim | \`application/json\` |
| \`Idempotency-Key\` | Sim para writes | Chave única por operação (UUID v4 recomendado) |
| \`X-MCP-Request-ID\` | Não | UUID para rastreio end-to-end nos logs |

---

## Modos de autenticação

### Modo externo (padrão para integrações)

Autenticação via **API Key** (\`authMode: api_key\`). A chave carrega:
- **Tenant ID** — escopo de dados (opcional)
- **Capabilities** — módulos e ações autorizados
- **Rate limit** — chamadas por minuto
- **Expiração** — data de vencimento (opcional)

### Modo interno (service token)

Para chamadas internas (ex.: worker, cron), o MCP aceita **service tokens** (\`authMode: service\`).
Esses tokens têm acesso total e nunca chegam ao MCP via usuário — são configurados no ambiente.

---

## Ciclo de vida da chave

1. **Ativa** — aceita chamadas normalmente
2. **Expirada** — rejeitada com \`unauthorized\` (campo \`expiresAt\` no passado)
3. **Revogada** — rejeitada com \`unauthorized\` (ação manual ou rotação)
4. **Rotacionada** — nova chave gerada; antiga revogada com TTL de 24h para transição

---

## Erros de autenticação

| Código | HTTP | Causa |
|---|---|---|
| \`unauthorized\` | 401 | Token ausente, inválido, expirado ou revogado |
| \`capability_missing\` | 403 | Token válido, mas sem capability para a tool |
| \`rate_limit_exceeded\` | 429 | Limite de chamadas por minuto atingido |

Exemplo de resposta de erro:

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "unauthorized",
    "data": {
      "errorCode": "unauthorized",
      "errorMessage": "Token expirado ou revogado."
    }
  }
}
\`\`\`

---

## Segurança

- Trafegue o token **apenas via HTTPS** — nunca em texto claro.
- **Nunca comite** a chave em repositórios.
- Use variáveis de ambiente (ex.: \`MCP_API_KEY\` no n8n ou no ambiente da sua app).
- Rotacione chaves regularmente via painel.
- Chaves com scope mínimo — conceda apenas os módulos que a integração realmente usa.
`;
