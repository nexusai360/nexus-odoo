# MCP SDK — Notas de Viabilidade (Task 4a.1)

## Versão instalada

`@modelcontextprotocol/sdk@1.29.0`

## Transporte: `StreamableHTTPServerTransport`

Localizado em `dist/cjs/server/streamableHttp.js`.

**Assinatura principal:**

```ts
class StreamableHTTPServerTransport implements Transport {
  constructor(options?: StreamableHTTPServerTransportOptions);
  get sessionId(): string | undefined;
  handleRequest(
    req: IncomingMessage & { auth?: AuthInfo },
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}
```

O transport é wrapper thin sobre `WebStandardStreamableHTTPServerTransport` com compatibilidade Node.js.

## Pré-auth por middleware HTTP (interceptar antes do transport)

**Confirmado viável.** O handler do `http.Server` é totalmente controlado por nós. O fluxo:

```
http.Server.on('request', handler) → nós validamos o service token ANTES de
chamar transport.handleRequest(req, res, body). Se inválido, respondemos 401
sem passar para o transport.
```

Implementação em `mcp/server.ts`: criamos `http.createServer(requestHandler)`
onde `requestHandler` é:
1. Validar `Authorization: Bearer <token>` via `validateServiceToken`.
2. Se inválido → `res.writeHead(401); res.end();`
3. Se válido → resolver sessão/usuário → `transport.handleRequest(req, res, body)`.

## `UserContext` de sessão — mecanismo escolhido

**Opção: `AsyncLocalStorage` + Map em memória.**

O `StreamableHTTPServerTransport` gera `sessionId` via `sessionIdGenerator`. O
`McpServer` passa o `sessionId` para os handlers via o campo `_meta` da requisição
ou via contexto — mas a forma mais robusta e sem dependência interna do SDK é:

1. No middleware de abertura de sessão (POST com `initialize`), detectamos que é
   a requisição de inicialização pelo header `Mcp-Session-Id` ausente (primeira
   requisição) ou pelo corpo JSON-RPC (método `initialize`).
2. Lemos `X-Mcp-User-Id` do header HTTP nessa requisição.
3. Resolvemos `UserContext` via `resolveUserContext(prisma, userId)`.
4. Gravamos no `session-store` (Map em memória) sob o `sessionId` que o transport
   retorna no response header `Mcp-Session-Id`.

Para acessar o `UserContext` no handler de tool:
- Usamos `AsyncLocalStorage<UserContext>` — a função `handleToolCall` roda dentro
  de um `als.run(userCtx, ...)` para que o handler de tool possa ler via
  `als.getStore()`, OU
- **Mais simples e sem dependência de ALS:** o `handleToolCall` recebe `sessionId`
  como parâmetro, lê do `session-store` e passa como argumento para o handler.

**Decisão final: passar `sessionId` → `session-store.get(sessionId)` → `UserContext`
diretamente no pipeline de `tools/call`.** Sem `AsyncLocalStorage` — mais
testável e explícito.

## Registro de tools — `McpServer`

```ts
class McpServer {
  registerTool<O, I>(
    name: string,
    config: { description?: string; inputSchema?: I; outputSchema?: O },
    cb: ToolCallback<I>,
  ): RegisteredTool;
}
```

Tools são registradas por nome. Para RBAC por sessão, **não registramos tools
por sessão** (causaria memória crescente). Abordagem:

- Registramos **todas** as tools no `McpServer` uma única vez na inicialização.
- O filtro de visibilidade (`visibleTools`) é aplicado em `tools/list` via handler
  customizado no `server.setRequestHandler(ListToolsRequestSchema, ...)`.
- O gate de autorização (`assertToolAllowed`) é aplicado no pipeline `tools/call`
  antes de executar o handler.

## `tools/list` filtrado por usuário

O `McpServer` expõe `server` (instância de `Server`) que permite sobrescrever
handlers via `server.setRequestHandler(...)`. Assim podemos interceptar
`tools/list` e filtrar por `UserContext` da sessão.

## Divergências em relação à spec 3.3.1

- A spec presumia que o SDK oferecia um hook de sessão nativo — não há. A
  abordagem adotada (Map em memória + sessionId no header) é equivalente em
  segurança e mais simples.
- O `McpServer.registerTool` não aceita `ZodType` genérico diretamente — aceita
  `ZodRawShapeCompat | AnySchema`. Para manter nosso `ToolEntry` com `ZodType<I>`,
  o pipeline de `tools/call` **não usa o handler interno do McpServer** para
  executar; ele intercepta via `server.setRequestHandler(CallToolRequestSchema)`
  para ter controle total (RBAC, audit, `handleToolCall`). O `registerTool` é
  usado apenas para popular `tools/list`.

## Impacto em tasks dependentes

- **4a.5/4a.14/4a.15/4a.16/4a.17:** seguem o fluxo descrito acima.
- **4a.16:** `McpServer` registra todas as tools via `registerTool` (somente para
  `tools/list`); `tools/call` interceptado via `server.setRequestHandler`.
- **4a.17:** `handleToolCall(tool, rawInput, sessionId, deps)` lê `UserContext`
  do session-store.
