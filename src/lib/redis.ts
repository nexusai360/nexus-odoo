import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: IORedis | undefined;
};

function createRedisClient(): IORedis {
  const url = process.env.REDIS_URL;
  // lazyConnect evita conexão durante `next build`/import , só conecta no
  // primeiro comando efetivo (rate-limit, pub/sub).
  const client = url
    ? new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true })
    : new IORedis({ lazyConnect: true });
  // Handler de erro: sem ele, IORedis emite "Unhandled error event" e um
  // event 'error' sem listener pode derrubar o processo Node.
  client.on("error", (err: Error) => {
    console.error("[redis] erro de conexão:", err.message);
  });
  return client;
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
