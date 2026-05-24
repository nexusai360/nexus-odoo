// src/worker/sync/directed.test.ts

import type { Job } from "bullmq";
import { mockPrisma } from "../../../mcp/__tests__/mocks/prisma";
import { createMockRedis } from "../../../mcp/__tests__/mocks/redis";
import { processDirectedSync, lockKey } from "./directed";
import type { DirectedSyncJob } from "../../../mcp/sync/queue";
import type { DirectedSyncDeps } from "./directed";

// Silencia pino-pretty em testes
jest.mock("../../../mcp/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mocka field-selection
jest.mock("../odoo/field-selection", () => ({
  getModelFields: jest.fn().mockResolvedValue(["id", "name", "write_date"]),
}));

function makeJob(data: DirectedSyncJob): Job<DirectedSyncJob> {
  return { id: "test-job-1", data } as unknown as Job<DirectedSyncJob>;
}

function makeDeps(overrides: Partial<DirectedSyncDeps> = {}): DirectedSyncDeps {
  const prisma = mockPrisma({
    rawResPartner: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  });
  const odoo = {
    read: jest.fn().mockResolvedValue([{ id: 1, name: "Acme", write_date: "2025-01-01 00:00:00" }]),
  } as unknown as DirectedSyncDeps["odoo"];
  const redis = createMockRedis();
  return { prisma, odoo, redis, ...overrides };
}

describe("lockKey", () => {
  it("deve gerar chave no formato correto", () => {
    expect(lockKey("res.partner", 42)).toBe("mcp:sync:res.partner:42");
  });
});

describe("processDirectedSync", () => {
  describe("modelo não suportado", () => {
    it("deve retornar ok=true e processed=0 para modelo desconhecido", async () => {
      const deps = makeDeps();
      const job = makeJob({
        model: "account.move",
        ids: [1],
        operation: "create",
        requestId: "r1",
        apiKeyId: "k1",
      });
      const result = await processDirectedSync(job, deps);
      expect(result).toEqual({ ok: true, processed: 0 });
    });
  });

  describe("res.partner , create com snapshotAfter", () => {
    it("deve fazer upsert com o snapshotAfter fornecido", async () => {
      const deps = makeDeps();
      const snapshot = { id: 1, name: "Acme", write_date: "2025-01-01 00:00:00" };
      const job = makeJob({
        model: "res.partner",
        ids: [1],
        operation: "create",
        snapshotAfter: snapshot,
        requestId: "r2",
        apiKeyId: "k2",
      });
      const result = await processDirectedSync(job, deps);
      expect(result).toEqual({ ok: true, processed: 1 });
      expect((deps.prisma.rawResPartner.upsert as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { odooId: 1 },
          create: expect.objectContaining({ odooId: 1, data: snapshot }),
        }),
      );
      // Não deve ter chamado odoo.read
      expect((deps.odoo.read as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe("res.partner , update sem snapshotAfter (fallback Odoo)", () => {
    it("deve buscar campos do Odoo e fazer upsert", async () => {
      const deps = makeDeps();
      const job = makeJob({
        model: "res.partner",
        ids: [5],
        operation: "update",
        requestId: "r3",
        apiKeyId: "k3",
      });
      const result = await processDirectedSync(job, deps);
      expect(result).toEqual({ ok: true, processed: 1 });
      expect((deps.odoo.read as jest.Mock)).toHaveBeenCalledWith("res.partner", [5], expect.any(Array));
      expect((deps.prisma.rawResPartner.upsert as jest.Mock)).toHaveBeenCalled();
    });
  });

  describe("res.partner , delete", () => {
    it("deve chamar update com rawDeleted=true", async () => {
      const deps = makeDeps();
      const job = makeJob({
        model: "res.partner",
        ids: [10],
        operation: "delete",
        requestId: "r4",
        apiKeyId: "k4",
      });
      const result = await processDirectedSync(job, deps);
      expect(result).toEqual({ ok: true, processed: 1 });
      expect((deps.prisma.rawResPartner.update as jest.Mock)).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { odooId: 10 },
          data: expect.objectContaining({ rawDeleted: true }),
        }),
      );
    });

    it("deve ignorar P2025 (registro não existe no cache)", async () => {
      const prismaErr = Object.assign(new Error("Not found"), { code: "P2025" });
      const deps = makeDeps({
        prisma: mockPrisma({
          rawResPartner: {
            update: jest.fn().mockRejectedValue(prismaErr),
          },
        }),
      });
      const job = makeJob({
        model: "res.partner",
        ids: [99],
        operation: "delete",
        requestId: "r5",
        apiKeyId: "k5",
      });
      // Não deve lançar , P2025 é ignorado graciosamente
      await expect(processDirectedSync(job, deps)).resolves.toEqual({ ok: true, processed: 1 });
    });
  });

  describe("res.partner , fallback quando Odoo retorna vazio", () => {
    it("deve pular o registro sem erro quando Odoo.read retorna []", async () => {
      const deps = makeDeps({
        odoo: { read: jest.fn().mockResolvedValue([]) } as unknown as DirectedSyncDeps["odoo"],
      });
      const job = makeJob({
        model: "res.partner",
        ids: [7],
        operation: "update",
        requestId: "r6",
        apiKeyId: "k6",
      });
      const result = await processDirectedSync(job, deps);
      expect(result).toEqual({ ok: true, processed: 1 });
      expect((deps.prisma.rawResPartner.upsert as jest.Mock)).not.toHaveBeenCalled();
    });
  });

  describe("lock Redis", () => {
    it("deve adquirir e liberar lock ao processar upsert", async () => {
      const redis = createMockRedis();
      const setSpy = jest.spyOn(redis, "set");
      const delSpy = jest.spyOn(redis, "del");
      const deps = makeDeps({ redis });
      const job = makeJob({
        model: "res.partner",
        ids: [3],
        operation: "update",
        requestId: "r7",
        apiKeyId: "k7",
      });
      await processDirectedSync(job, deps);
      expect(setSpy).toHaveBeenCalledWith(
        "mcp:sync:res.partner:3",
        "1",
        "EX",
        30,
        "NX",
      );
      expect(delSpy).toHaveBeenCalledWith("mcp:sync:res.partner:3");
    });
  });
});
