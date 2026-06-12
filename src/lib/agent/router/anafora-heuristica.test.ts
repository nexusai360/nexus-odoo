// Onda M (Arquitetura 3.0) T4.3 , heuristica deterministica de anafora.
import { resolverAnaforaDeterministica } from "./anafora-heuristica";
import type { FocoAtual } from "@/lib/agent/memoria/foco-atual";

const FOCO_BASE: FocoAtual = {
  metrica: { nome: "fiscal faturamento periodo", toolUsada: "fiscal_faturamento_periodo" },
  periodo: { inicio: "2026-06-01", fim: "2026-06-30" },
  entidades: [{ tipo: "empresa", rotulo: "Matrix" }],
  turnoAtualizado: 4,
};

describe("resolverAnaforaDeterministica , pronome tipado", () => {
  test("'esse produto' resolve para a entidade mais recente do tipo", () => {
    const r = resolverAnaforaDeterministica("qual o estoque desse produto?", null, [
      { tipo: "produto", rotulo: "Esteira T600X", ultimoTurno: 5 },
      { tipo: "produto", rotulo: "Bike S400", ultimoTurno: 2 },
    ]);
    expect(r.status).toBe("resolvida");
    if (r.status === "resolvida") {
      expect(r.reformulada).toContain('produto "Esteira T600X"');
      expect(r.reformulada).not.toMatch(/desse produto/i);
    }
  });

  test("preposicao preservada com concordancia ('dessa empresa' -> 'da empresa')", () => {
    const r = resolverAnaforaDeterministica(
      "e o faturamento dessa empresa?",
      FOCO_BASE,
      [],
    );
    expect(r.status).toBe("resolvida");
    if (r.status === "resolvida") {
      expect(r.reformulada).toContain('da empresa "Matrix"');
    }
  });

  test("empate de recencia no mesmo tipo -> ambigua (deixa a regra 12b clarificar)", () => {
    const r = resolverAnaforaDeterministica("qual o estoque desse produto?", null, [
      { tipo: "produto", rotulo: "Esteira T600X", ultimoTurno: 5 },
      { tipo: "produto", rotulo: "Bike S400", ultimoTurno: 5 },
    ]);
    expect(r.status).toBe("ambigua");
  });

  test("pronome tipado sem entidade do tipo -> nao-anaforica (cai no CQR)", () => {
    const r = resolverAnaforaDeterministica("qual o estoque desse produto?", FOCO_BASE, []);
    expect(r.status).toBe("nao-anaforica");
  });
});

describe("resolverAnaforaDeterministica , pronome generico", () => {
  test("'ela' com exatamente 1 entidade em foco resolve por anexo", () => {
    const r = resolverAnaforaDeterministica("quanto ela faturou em maio?", FOCO_BASE, []);
    expect(r.status).toBe("resolvida");
    if (r.status === "resolvida") {
      expect(r.reformulada).toContain("quanto ela faturou em maio?");
      expect(r.reformulada).toContain("Matrix");
    }
  });

  test("'dele' com 2+ entidades em foco -> ambigua", () => {
    const foco: FocoAtual = {
      ...FOCO_BASE,
      entidades: [
        { tipo: "vendedor", rotulo: "Weverton" },
        { tipo: "cliente", rotulo: "Johnson" },
      ],
    };
    const r = resolverAnaforaDeterministica("qual o total dele?", foco, []);
    expect(r.status).toBe("ambigua");
  });

  test("'ele' sem nenhuma entidade -> nao-anaforica", () => {
    const r = resolverAnaforaDeterministica(
      "qual o total dele?",
      { turnoAtualizado: 1 },
      [],
    );
    expect(r.status).toBe("nao-anaforica");
  });
});

describe("resolverAnaforaDeterministica , elipse 'e ...?'", () => {
  test("'e em maio?' herda metrica e entidades do foco, sem o periodo antigo", () => {
    const r = resolverAnaforaDeterministica("e em maio?", FOCO_BASE, []);
    expect(r.status).toBe("resolvida");
    if (r.status === "resolvida") {
      expect(r.reformulada).toContain("e em maio?");
      expect(r.reformulada).toContain("fiscal faturamento periodo");
      expect(r.reformulada).not.toContain("2026-06-01");
    }
  });

  test("'e o total?' sem periodo novo herda o periodo do foco", () => {
    const r = resolverAnaforaDeterministica("e o total?", FOCO_BASE, []);
    expect(r.status).toBe("resolvida");
    if (r.status === "resolvida") {
      expect(r.reformulada).toContain("2026-06-01");
    }
  });

  test("elipse sem foco de metrica -> nao-anaforica", () => {
    const r = resolverAnaforaDeterministica("e em maio?", null, []);
    expect(r.status).toBe("nao-anaforica");
  });
});

describe("resolverAnaforaDeterministica , pergunta autossuficiente", () => {
  test("pergunta completa nao e tocada", () => {
    const r = resolverAnaforaDeterministica(
      "faturamento de junho da Matrix por empresa",
      FOCO_BASE,
      [{ tipo: "produto", rotulo: "Esteira T600X", ultimoTurno: 5 }],
    );
    expect(r.status).toBe("nao-anaforica");
  });
});
