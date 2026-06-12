// Onda M (Arquitetura 3.0) T2.1/T2.2 , janela por TURNOS com síntese textual.
import { agruparEmTurnosComSintese } from "./janela-turnos";
import {
  CONVERSA_30_TURNOS,
  NUMERO_TURNO_3,
  NUMERO_TURNO_12,
  NUMERO_TURNO_21,
} from "./__fixtures__/conversa-30-turnos";

describe("agruparEmTurnosComSintese", () => {
  it("retorna só os últimos K TURNOS como mensagens (não linhas)", () => {
    const j = agruparEmTurnosComSintese(CONVERSA_30_TURNOS, 10);
    // 10 turnos = 20 mensagens (user+assistant)
    expect(j.mensagens).toHaveLength(20);
    expect(j.mensagens[0].role).toBe("user");
    expect(j.mensagens[0].id).toBe("u21"); // janela começa no turno 21
  });

  it("assistant com toolCalls vira síntese textual SEM toolCalls órfãos", () => {
    const j = agruparEmTurnosComSintese(CONVERSA_30_TURNOS, 10);
    for (const m of j.mensagens) {
      expect(m.toolCalls).toBeNull(); // garantia multi-provider: nunca órfãos
    }
    // o turno 21 (com tool) está na janela: o digest entra no content
    const a21 = j.mensagens.find((m) => m.id === "a21")!;
    expect(a21.content).toContain("consultas do turno");
    expect(a21.content).toContain(NUMERO_TURNO_21);
  });

  it("digests de turnos FORA da janela são preservados em digestsAnteriores (cronológico)", () => {
    const j = agruparEmTurnosComSintese(CONVERSA_30_TURNOS, 10);
    // turnos 3 e 12 estão fora da janela de 10; seus digests sobrevivem
    expect(j.digestsAnteriores).toHaveLength(2);
    expect(j.digestsAnteriores[0]).toContain(NUMERO_TURNO_3);
    expect(j.digestsAnteriores[1]).toContain(NUMERO_TURNO_12);
  });

  it("cap de digests antigos: mantém os MAIS RECENTES", () => {
    const j = agruparEmTurnosComSintese(CONVERSA_30_TURNOS, 10, 1);
    expect(j.digestsAnteriores).toHaveLength(1);
    expect(j.digestsAnteriores[0]).toContain(NUMERO_TURNO_12);
  });

  it("conversa menor que a janela: tudo verbatim, sem digests anteriores", () => {
    const curta = CONVERSA_30_TURNOS.slice(0, 8); // turnos 1-4
    const j = agruparEmTurnosComSintese(curta, 10);
    expect(j.mensagens).toHaveLength(8);
    expect(j.digestsAnteriores).toHaveLength(0);
  });

  it("assistant com toolCalls mas SEM digest (pré-backfill): content original, sem órfãos", () => {
    const msgs = [
      { id: "u1", role: "user" as const, content: "pergunta", toolCalls: null, toolDigest: null },
      {
        id: "a1",
        role: "assistant" as const,
        content: "resposta com dados",
        toolCalls: [{ id: "c1", name: "x", arguments: {} }],
        toolDigest: null,
      },
    ];
    const j = agruparEmTurnosComSintese(msgs, 10);
    expect(j.mensagens[1].toolCalls).toBeNull();
    expect(j.mensagens[1].content).toBe("resposta com dados");
  });

  it("mensagens role=tool de dados antigos são descartadas do replay", () => {
    const msgs = [
      { id: "u1", role: "user" as const, content: "p", toolCalls: null, toolDigest: null },
      { id: "t1", role: "tool" as const, content: "{...}", toolCalls: null, toolDigest: null },
      { id: "a1", role: "assistant" as const, content: "r", toolCalls: null, toolDigest: null },
    ];
    const j = agruparEmTurnosComSintese(msgs as never, 10);
    expect(j.mensagens.map((m) => m.id)).toEqual(["u1", "a1"]);
  });
});
