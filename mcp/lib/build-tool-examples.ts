// mcp/lib/build-tool-examples.ts
// Gerador de exemplos de uso (curl, n8n, python, javascript) para tools MCP.
//
// Uso na entry de uma tool:
//   examples: buildExamples({
//     toolId: "cadastros.res_partner.update",
//     sampleInput: { id: 123, phone: "(11) 99999-0000" },
//   })
//
// Garantia: sampleInput sempre passa por JSON.stringify(..., null, 2), o que
// escapa aspas/backslash corretamente. Os templates injetam dentro de strings
// com aspas duplas (curl/python/js) ou em literal JS (n8n), nunca dentro de
// single-quotes.

import type { ToolEntryExample } from "../catalog/types.js";

export interface BuildExamplesArgs {
  toolId: string;
  sampleInput: Record<string, unknown>;
  /** URL publica do MCP. Default: "https://mcp.exemplo.com.br/mcp" */
  mcpUrl?: string;
}

const DEFAULT_MCP_URL = "https://mcp.exemplo.com.br/mcp";

export function buildExamples({
  toolId,
  sampleInput,
  mcpUrl = DEFAULT_MCP_URL,
}: BuildExamplesArgs): ToolEntryExample[] {
  const inputJson = JSON.stringify(sampleInput, null, 2);
  const inputJsonIndented = inputJson
    .split("\n")
    .map((line, i) => (i === 0 ? line : "        " + line))
    .join("\n");

  const curlBody = JSON.stringify(
    {
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolId, arguments: sampleInput },
    },
    null,
    2,
  );

  return [
    {
      language: "curl" as const,
      description: "Invocacao direta via curl",
      code: `curl -X POST ${mcpUrl} \\
  -H "Authorization: Bearer <SERVICE_TOKEN>" \\
  -H "X-Mcp-User-Id: <USER_ID>" \\
  -H "X-Api-Key: <API_KEY>" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '${curlBody.replace(/'/g, "'\\''")}'`,
    },
    {
      language: "n8n" as const,
      description: "Node HTTP Request no n8n",
      code: `// Node: HTTP Request
// Method: POST
// URL: {{ $env.MCP_URL }}
// Headers:
//   Authorization: Bearer {{ $env.MCP_SERVICE_TOKEN }}
//   X-Mcp-User-Id: {{ $env.MCP_USER_ID }}
//   X-Api-Key: {{ $env.MCP_API_KEY }}
//   Idempotency-Key: {{ $json.idempotencyKey }}
// Body (JSON):
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "${toolId}",
    "arguments": ${inputJsonIndented}
  }
}`,
    },
    {
      language: "python" as const,
      description: "Chamada via requests",
      code: `import requests, uuid

response = requests.post(
    "${mcpUrl}",
    headers={
        "Authorization": "Bearer <SERVICE_TOKEN>",
        "X-Mcp-User-Id": "<USER_ID>",
        "X-Api-Key": "<API_KEY>",
        "Idempotency-Key": str(uuid.uuid4()),
        "Content-Type": "application/json",
    },
    json={
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": "${toolId}",
            "arguments": ${inputJsonIndented},
        },
    },
)
data = response.json()
print(data.get("result"))`,
    },
    {
      language: "javascript" as const,
      description: "Chamada via fetch",
      code: `const response = await fetch("${mcpUrl}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <SERVICE_TOKEN>",
    "X-Mcp-User-Id": "<USER_ID>",
    "X-Api-Key": "<API_KEY>",
    "Idempotency-Key": crypto.randomUUID(),
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "${toolId}",
      arguments: ${inputJsonIndented},
    },
  }),
});
const { result } = await response.json();
console.log(result);`,
    },
  ];
}
