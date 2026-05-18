// mcp/tools/caminho3/bi-pool.test.ts
// Testa o módulo bi-pool usando jest.isolateModules para controlar a env por caso.
// O pool é eager (criado na carga do módulo), portanto re-importar via isolateModules
// é obrigatório para testar os dois caminhos (URL presente vs. ausente).

jest.mock("pg", () => {
  const mockOn = jest.fn();
  const MockPool = jest.fn().mockImplementation(() => ({ on: mockOn }));
  return { Pool: MockPool, __mockOn: mockOn };
});

const ENV_KEY = "MCP_BI_DATABASE_URL";
const TEST_URL = "postgresql://nexus_mcp_bi:pw@localhost:5436/nexus_odoo";

describe("bi-pool — MCP_BI_DATABASE_URL presente", () => {
  let getBiPool: () => unknown;
  let MockPool: jest.Mock;
  let mockOn: jest.Mock;

  beforeEach(() => {
    jest.isolateModules(() => {
      process.env[ENV_KEY] = TEST_URL;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pg = require("pg") as { Pool: jest.Mock; __mockOn: jest.Mock };
      MockPool = pg.Pool;
      mockOn = pg.__mockOn;
      mockOn.mockClear();
      MockPool.mockClear();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./bi-pool") as { getBiPool: () => unknown };
      getBiPool = mod.getBiPool;
    });
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it("getBiPool() retorna um Pool (não null)", () => {
    expect(getBiPool()).not.toBeNull();
  });

  it("Pool é instanciado com a connectionString correta", () => {
    expect(MockPool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: TEST_URL }),
    );
  });

  it("pool.on('connect') é registrado", () => {
    expect(mockOn).toHaveBeenCalledWith("connect", expect.any(Function));
  });

  it("handler de connect executa SET default_transaction_read_only = on", () => {
    const connectHandler = mockOn.mock.calls.find(
      ([event]: [string]) => event === "connect",
    )?.[1] as ((client: { query: jest.Mock }) => Promise<void>) | undefined;
    expect(connectHandler).toBeDefined();
    const mockQuery = jest.fn().mockResolvedValue(undefined);
    connectHandler!({ query: mockQuery });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("default_transaction_read_only"),
    );
  });

  it("handler de connect executa SET statement_timeout", () => {
    const connectHandler = mockOn.mock.calls.find(
      ([event]: [string]) => event === "connect",
    )?.[1] as ((client: { query: jest.Mock }) => Promise<void>) | undefined;
    expect(connectHandler).toBeDefined();
    const mockQuery = jest.fn().mockResolvedValue(undefined);
    connectHandler!({ query: mockQuery });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("statement_timeout"),
    );
  });

  it("chamadas repetidas a getBiPool() devolvem a mesma instância", () => {
    expect(getBiPool()).toBe(getBiPool());
  });
});

describe("bi-pool — MCP_BI_DATABASE_URL ausente", () => {
  let getBiPool: () => unknown;

  beforeEach(() => {
    jest.isolateModules(() => {
      delete process.env[ENV_KEY];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./bi-pool") as { getBiPool: () => unknown };
      getBiPool = mod.getBiPool;
    });
  });

  it("getBiPool() retorna null sem lançar", () => {
    expect(() => getBiPool()).not.toThrow();
    expect(getBiPool()).toBeNull();
  });

  it("o módulo carrega sem lançar mesmo sem URL", () => {
    expect(getBiPool).toBeDefined();
  });
});
