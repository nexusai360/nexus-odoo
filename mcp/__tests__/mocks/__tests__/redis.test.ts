// mcp/__tests__/mocks/__tests__/redis.test.ts
// Testes da factory createMockRedis , verifica compatibilidade com RateLimitRedis
// (pipeline INCR+EXPIRE) e com SET NX usado no distributed lock do Bloco E.

import { createMockRedis } from "../redis.js";

describe("createMockRedis()", () => {
  // ioredis-mock usa store singleton , limpar entre testes para evitar vazamento de estado
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    redis = createMockRedis();
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.flushall();
  });
  it("retorna instância com o método pipeline() e seus sub-métodos (incr, expire, exec)", () => {
    const redis = createMockRedis();

    expect(typeof redis.pipeline).toBe("function");

    const pipe = redis.pipeline();
    expect(typeof pipe.incr).toBe("function");
    expect(typeof pipe.expire).toBe("function");
    expect(typeof pipe.exec).toBe("function");
  });

  it("INCR + EXPIRE via pipeline: primeiro INCR retorna 1, EXPIRE retorna 1", async () => {
    const redis = createMockRedis();
    const pipe = redis.pipeline();
    pipe.incr("mcp:rate:user-test");
    pipe.expire("mcp:rate:user-test", 60);
    const results = await pipe.exec();

    // ioredis-mock retorna [[err, value], ...] igual ao ioredis real
    expect(results).not.toBeNull();
    const [[incrErr, incrVal], [expireErr, expireVal]] = results!;
    expect(incrErr).toBeNull();
    expect(incrVal).toBe(1);
    expect(expireErr).toBeNull();
    expect(expireVal).toBe(1);
  });

  it("INCR acumulado: segunda pipeline na mesma instância retorna count=2", async () => {
    const redis = createMockRedis();

    // Primeira chamada
    const pipe1 = redis.pipeline();
    pipe1.incr("mcp:rate:user-acc");
    pipe1.expire("mcp:rate:user-acc", 60);
    await pipe1.exec();

    // Segunda chamada , mesmo redis, mesmo key
    const pipe2 = redis.pipeline();
    pipe2.incr("mcp:rate:user-acc");
    pipe2.expire("mcp:rate:user-acc", 60);
    const results2 = await pipe2.exec();

    const [[, incrVal2]] = results2!;
    expect(incrVal2).toBe(2);
  });

  it("instâncias diferentes compartilham o mesmo store in-memory (comportamento ioredis-mock)", async () => {
    // ioredis-mock usa um store singleton por módulo , duas instâncias veem as mesmas chaves.
    // Isso é esperado e documentado: em testes de integração usar flushall() entre suites.
    const redisA = createMockRedis();
    const redisB = createMockRedis();

    // Incrementa em A
    const pipeA = redisA.pipeline();
    pipeA.incr("mcp:rate:user-shared");
    await pipeA.exec();

    // B vê a chave do A (estado compartilhado = 2 após novo INCR)
    const pipeB = redisB.pipeline();
    pipeB.incr("mcp:rate:user-shared");
    const resultsB = await pipeB.exec();

    const [[, incrValB]] = resultsB!;
    expect(incrValB).toBe(2); // estado compartilhado , comportamento documentado

    // Limpar com flushall para não vazar para outros testes
    await redisA.flushall();
  });

  it("SET com flag NX: primeira chamada define o valor, segunda é ignorada (lock semântico)", async () => {
    // SET NX , cria a chave
    const first = await redis.set("lock:resource-x", "owner-1", "NX");
    expect(first).toBe("OK");

    // SET NX , chave já existe, deve retornar null
    const second = await redis.set("lock:resource-x", "owner-2", "NX");
    expect(second).toBeNull();

    // O valor armazenado deve ser do primeiro dono
    const val = await redis.get("lock:resource-x");
    expect(val).toBe("owner-1");
  });

  it("SET com PX+NX (TTL em ms): comportamento idêntico ao lock com expiração", async () => {
    // Assinatura correta do ioredis v5: set(key, value, "PX", ms, "NX")
    const result = await redis.set("lock:timed", "owner", "PX", 5000, "NX");
    expect(result).toBe("OK");

    // Segunda tentativa , deve falhar
    const second = await redis.set("lock:timed", "other", "PX", 5000, "NX");
    expect(second).toBeNull();
  });
});
