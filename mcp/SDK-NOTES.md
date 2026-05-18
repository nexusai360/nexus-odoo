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
  tool<S extends ZodRawShape>(
    name: string,
    description: string,
    inputSchema: S,
    cb: ToolCallback<S>,
  ): RegisteredTool;
}
```

Tools são registradas por nome com o `inputSchemaShape` real (objeto passado a
`z.object(...)`). O SDK usa esse shape para validar o input e para publicar o
schema em `tools/list`.

## `tools/list` filtrado por usuário (Camada 1 do RBAC)

**Abordagem adotada: McpServer por sessão (Opção A).**

Cada sessão (`initialize`) cria um par `McpServer` + `StreamableHTTPServerTransport`
próprio. No momento da criação, `visibleTools(catalogo, userCtx)` é chamado para
filtrar o catálogo e registrar **apenas** as tools autorizadas ao usuário. Assim
`tools/list` devolve naturalmente o catálogo filtrado — sem necessidade de
sobrescrever handlers.

**Teste empírico realizado (review 2026-05-18):** `setRequestHandler(ListToolsRequestSchema)`
aceito normalmente após `McpServer.tool(...)`. O erro `assertRequestHandlerCapability`
ocorre por **capability `tools` ausente**, não por handler duplicado. Registrar ao
menos uma tool (ou `registerCapabilities({tools:{}})`) habilita a capability e
permite a sobrescrita. A Opção B (handler global com `setRequestHandler`) é
viável, mas a Opção A foi escolhida por isolamento limpo por sessão.

**Limpeza de sessão:** `transport.onclose` dispara `sessionMap.delete` e
`sessionStore.delete` ao fechar o transport, evitando vazamento de memória.

## Divergências em relação à spec 3.3.1

- A spec presumia que o SDK oferecia um hook de sessão nativo — não há. A
  abordagem adotada (McpServer por sessão + sessionId do transport) resolve
  o isolamento por usuário de forma limpa e sem dependência de `AsyncLocalStorage`.
- O `ToolEntry` expõe `inputSchemaShape` (raw shape Zod) além de `inputSchema`
  (`ZodType<I>`): o shape é registrado no SDK (visível em `tools/list`); o
  `ZodType` é usado no pipeline `handleToolCall` para validação completa.

---

## pgsql-parser v17.9.15 (H.4)

Instalado na raiz do monorepo. Consumido por `mcp/tools/caminho3/sql-guard.ts`.

### API

```ts
import { parse, loadModule } from "pgsql-parser";

// IMPORTANTE: loadModule() inicializa o WASM — chamar UMA VEZ no startup.
await loadModule();

// parse é assíncrono e retorna Promise<any>.
const result = await parse(sql);
```

### Estrutura do resultado

```ts
result = {
  version: 170004,
  stmts: [
    { stmt: { SelectStmt: { ... } } },  // ou DeleteStmt, InsertStmt, etc.
  ]
}
```

### Como obter número de statements e nó-raiz

```ts
const stmts: unknown[] = result.stmts ?? [];
stmts.length;                            // 1 para single-statement
const rootKey = Object.keys((stmts[0] as any).stmt)[0];
rootKey === "SelectStmt";               // true para SELECT e WITH...SELECT (CTE)
```

### Como detectar `intoClause` (SELECT INTO)

```ts
const selectStmt = (stmts[0] as any).stmt.SelectStmt;
!!selectStmt.intoClause;               // true para "SELECT * INTO nova_tabela FROM ..."
```

### Comportamento verificado (confirmado em H.4)

| SQL | `stmts.length` | nó-raiz | Guard aprova? |
|---|---|---|---|
| `SELECT * FROM fato_pedido` | 1 | `SelectStmt` | SIM |
| `WITH x AS (SELECT 1) SELECT * FROM x` | 1 | `SelectStmt` | SIM |
| `DELETE FROM fato_pedido` | 1 | `DeleteStmt` | NÃO |
| `SELECT 1; DROP TABLE fato_pedido` | 2 | — | NÃO (multi) |
| `INSERT INTO x VALUES(1)` | 1 | `InsertStmt` | NÃO |
| `SELECT * INTO nova_tabela FROM fato_pedido` | 1 | `SelectStmt` (c/ `intoClause`) | NÃO |
| `SELCT * FRM` | — | — | NÃO (lança) |

### Testes Jest

Chamar `loadModule()` em `beforeAll` nos testes de `sql-guard.test.ts`.
O `sql-guard.ts` chama `parse` apenas dentro de `validarSqlSelect` (nunca no nível de módulo),
portanto não requer `loadModule` antes do `import`.

---

## Impacto em tasks dependentes

- **4a.14/4a.15:** middlewares HTTP (service token + X-Mcp-User-Id) — sem mudança.
- **4a.16:** `createMcpServerForUser(userCtx)` registra `visibleTools` com
  `inputSchemaShape` real. `createHttpServer` cria par por sessão no `initialize`.
- **4a.17:** `handleToolCall(tool, rawInput, userId, deps)` pipeline de RBAC
  camada 2+6+7 e audit — sem mudança estrutural.
