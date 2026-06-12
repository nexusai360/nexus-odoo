// Onda M (Arquitetura 3.0) T4.2 , testes da memoria de entidades.
import { extrairEntidadesDoTurno } from "./foco-atual";
import { upsertEntidadesDoTurno } from "./entidades";
import type { ToolCall } from "../llm/types";

function call(name: string, args: object): ToolCall {
  return { id: `c-${name}`, name, arguments: args };
}

describe("extrairEntidadesDoTurno", () => {
  test("extrai entidades dos args mapeados (termo/vendedor/empresaRef)", () => {
    const ents = extrairEntidadesDoTurno([
      call("estoque_saldo_produto", { termo: "Esteira T600X" }),
      call("fiscal_faturamento_por_vendedor", { vendedor: "Weverton" }),
    ]);
    expect(ents).toEqual([
      { tipo: "produto", rotulo: "Esteira T600X" },
      { tipo: "vendedor", rotulo: "Weverton" },
    ]);
  });

  test("ignora args vazios e nao mapeados", () => {
    const ents = extrairEntidadesDoTurno([
      call("faturamento_periodo", { periodoDe: "2026-06-01", termo: "  " }),
    ]);
    expect(ents).toEqual([]);
  });
});

describe("upsertEntidadesDoTurno", () => {
  function mockPrisma() {
    return {
      conversationEntity: { upsert: jest.fn().mockResolvedValue({}) },
    } as never;
  }

  test("upsert por entidade do turno com chave canonica lowercase e recencia do turno", async () => {
    const prisma = mockPrisma();
    await upsertEntidadesDoTurno(
      prisma,
      "conv-1",
      [{ tipo: "produto", rotulo: "Esteira T600X" }],
      7,
    );
    const upsert = (prisma as { conversationEntity: { upsert: jest.Mock } })
      .conversationEntity.upsert;
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.conversationId_tipo_chaveCanonica).toEqual({
      conversationId: "conv-1",
      tipo: "produto",
      chaveCanonica: "esteira t600x",
    });
    expect(arg.create.ultimoTurno).toBe(7);
    expect(arg.update.ultimoTurno).toBe(7);
    expect(arg.update.mencoes).toEqual({ increment: 1 });
  });

  test("rotulo vazio e pulado; erro de upsert nao lanca (best-effort)", async () => {
    const prisma = {
      conversationEntity: {
        upsert: jest.fn().mockRejectedValue(new Error("db down")),
      },
    } as never;
    await expect(
      upsertEntidadesDoTurno(
        prisma,
        "conv-1",
        [
          { tipo: "produto", rotulo: "   " },
          { tipo: "vendedor", rotulo: "Weverton" },
        ],
        3,
      ),
    ).resolves.toBeUndefined();
    const upsert = (prisma as { conversationEntity: { upsert: jest.Mock } })
      .conversationEntity.upsert;
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
