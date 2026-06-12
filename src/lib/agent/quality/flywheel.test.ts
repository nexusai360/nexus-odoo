// Onda P (Arquitetura 3.0) P.5 , testes do flywheel manual (parte pura).
import { montarCandidatosGolden, type FalhaProducao } from "./flywheel";

const FALHAS: FalhaProducao[] = [
  {
    origem: "quality_eval",
    conversationId: "c1",
    pergunta: "Qual o faturamento de junho?",
    resposta: "Foi R$ 999.999,99 (numero errado).",
    motivo: "ERRADO: numero divergente da tool",
    criadoEm: "2026-06-11T10:00:00Z",
  },
  {
    origem: "feedback_usuario",
    conversationId: "c2",
    pergunta: "qual o faturamento de junho ?",
    resposta: "outra resposta",
    motivo: "ALUCINOU",
    criadoEm: "2026-06-11T11:00:00Z",
  },
  {
    origem: "validador_retry",
    conversationId: "c3",
    pergunta: "Quantos pedidos por UF?",
    resposta: "resposta",
    motivo: "V2:numero_nao_derivado",
    criadoEm: "2026-06-11T12:00:00Z",
  },
];

describe("montarCandidatosGolden", () => {
  test("dedup por pergunta normalizada (mantem a primeira, agrega motivos)", () => {
    const out = montarCandidatosGolden(FALHAS, []);
    expect(out).toHaveLength(2);
    expect(out[0].motivos).toHaveLength(2);
    expect(out[0].motivos.join(" ")).toContain("ALUCINOU");
  });

  test("pergunta ja coberta pelo golden e excluida", () => {
    const out = montarCandidatosGolden(FALHAS, ["Quantos pedidos por UF?"]);
    expect(out).toHaveLength(1);
    expect(out[0].pergunta).toBe("Qual o faturamento de junho?");
  });

  test("esqueleto de caso golden pronto para revisao", () => {
    const out = montarCandidatosGolden([FALHAS[2]], []);
    expect(out[0].casoGolden).toMatchObject({
      id: expect.stringMatching(/^flywheel-/),
      pergunta: "Quantos pedidos por UF?",
      classe: "prosseguir",
    });
    expect(out[0].casoGolden.toolEsperada).toBe("?");
  });
});
