// mcp/sync/__tests__/queue.test.ts
// Testa getDirectedSyncQueue , singleton, nome da fila, tipagem do job.

import { Queue } from "bullmq";

// Mocka bullmq e ioredis antes de importar o módulo
jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({ name: "odoo-sync-directed" })),
}));
jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({})),
);

import { getDirectedSyncQueue, DIRECTED_SYNC_QUEUE_NAME } from "../queue";
import type { DirectedSyncJob } from "../queue";

describe("getDirectedSyncQueue", () => {
  beforeEach(() => {
    // Reseta o singleton entre testes
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Queue as unknown as jest.Mock<any, any>).mockClear();
  });

  it("deve exportar DIRECTED_SYNC_QUEUE_NAME correto", () => {
    expect(DIRECTED_SYNC_QUEUE_NAME).toBe("odoo-sync-directed");
  });

  it("deve instanciar Queue com o nome correto", () => {
    const q = getDirectedSyncQueue();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(Queue as unknown as jest.Mock<any, any>).toHaveBeenCalledWith(
      "odoo-sync-directed",
      expect.objectContaining({ connection: expect.anything() }),
    );
    expect(q).toBeDefined();
  });

  it("deve retornar singleton , Queue instanciada apenas uma vez por módulo", () => {
    getDirectedSyncQueue();
    getDirectedSyncQueue();
    // Como o singleton está em memória do módulo já carregado (não resetamos
    // o módulo no beforeEach aqui), Queue pode ter sido chamado 1x de um teste anterior.
    // O que verificamos é que chamadas repetidas na mesma instância de módulo
    // não constroem um novo Queue.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (Queue as unknown as jest.Mock<any, any>).mock.calls.length;
    // Deve ter sido chamado no máximo 1x neste bloco de teste
    expect(calls).toBeLessThanOrEqual(1);
  });
});

describe("DirectedSyncJob type", () => {
  it("deve aceitar job de create com snapshotAfter", () => {
    const job: DirectedSyncJob = {
      model: "res.partner",
      ids: [1, 2],
      operation: "create",
      snapshotAfter: { id: 1, name: "Acme" },
      requestId: "req-001",
      apiKeyId: "key-uuid",
    };
    expect(job.operation).toBe("create");
    expect(job.snapshotAfter).toBeDefined();
  });

  it("deve aceitar job de delete sem snapshotAfter", () => {
    const job: DirectedSyncJob = {
      model: "res.partner",
      ids: [5],
      operation: "delete",
      requestId: "req-002",
      apiKeyId: "key-uuid",
    };
    expect(job.operation).toBe("delete");
    expect(job.snapshotAfter).toBeUndefined();
  });
});
