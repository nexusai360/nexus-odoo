// mcp/lib/redis.ts
// Client IORedis para o servidor MCP (rate limiter, 4f-3).
// Lê REDIS_URL do ambiente; sem variável, usa localhost:6379 (dev).
import IORedis from "ioredis";

function createMcpRedis(): IORedis {
  const url = process.env.REDIS_URL;
  const client = url
    ? new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true })
    : new IORedis({ lazyConnect: true });

  client.on("error", (err: Error) => {
    console.error("[mcp:redis] erro de conexão:", err.message);
  });

  return client;
}

export const mcpRedis = createMcpRedis();
