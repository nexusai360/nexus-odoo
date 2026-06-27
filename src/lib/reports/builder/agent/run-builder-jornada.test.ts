import { runBuilder, type BuilderRunEvent } from "./run-builder";
import type { ChatRequest, ChatResult, ProviderClient } from "@/lib/agent/llm/types";
import type { RunBuilderDeps } from "./run-builder";
import { journeyStateInicial } from "../journey/state";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const USER = { id: "u1" };

function resultado(parcial: Partial<ChatResult>): ChatResult {
  return {
    message: parcial.message ?? "",
    toolCalls: parcial.toolCalls,
    usage: parcial.usage ?? { tokensInput: 10, tokensOutput: 5, costUsd: 0 },
  };
}

// Cliente fake que CAPTURA as messages enviadas (spy) e devolve respostas em ordem.
function clienteSpy(respostas: ChatResult[]): { cliente: ProviderClient; reqs: ChatRequest[] } {
  const reqs: ChatRequest[] = [];
  let i = 0;
  return {
    reqs,
    cliente: {
      provider: "openai",
      model: "gpt-5-mini",
      chat: async (req: ChatRequest): Promise<ChatResult> => {
        reqs.push(req);
        return respostas[Math.min(i++, respostas.length - 1)];
      },
    },
  };
}

function deps(cliente: ProviderClient): RunBuilderDeps {
  return {
    criarCliente: async () => cliente,
    verificarQuota: async () => ({ ok: true }),
    logUsage: async () => {},
    registrarFeatureRequest: async () => {},
    obterReasoning: async () => ({ ligado: false, effort: null }),
  };
}

const SECOES = [
  { id: "k", name: "adicionar_secao", arguments: { template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: {} } },
  { id: "d", name: "adicionar_secao", arguments: { template: "DataTable", fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] } } },
];

describe("runBuilder modo jornada", () => {
  it("thread o historico nas messages enviadas ao modelo (na ordem)", async () => {
    const { cliente, reqs } = clienteSpy([resultado({ message: "ok" })]);
    await runBuilder(
      {
        prompt: "quero ver o estoque",
        fichaAtual: null,
        user: USER,
        modo: "jornada",
        journeyState: journeyStateInicial(),
        historico: [
          { role: "user", content: "oi" },
          { role: "assistant", content: "ola, o que voce quer ver?" },
        ],
      },
      deps(cliente),
    );
    const conteudos = reqs[0].messages.map((m) => m.content);
    expect(conteudos).toContain("oi");
    expect(conteudos).toContain("ola, o que voce quer ver?");
    // ordem: historico antes do prompt atual
    expect(conteudos.indexOf("oi")).toBeLessThan(conteudos.indexOf("quero ver o estoque"));
  });

  it("intencao coberta torna oferecer_geracao elegivel -> fase resumo", async () => {
    const js = journeyStateInicial();
    js.turnosUsuario = 2;
    js.entendimento = "voce quer ver o saldo de estoque com indicadores e detalhe em tabela";
    // Evidencia objetiva = intencao estruturada (gate novo, nao a ficha).
    js.intencao = {
      secoes: [
        { fato: "fato_estoque_saldo", template: "KPIRow" },
        { fato: "fato_estoque_saldo", template: "DataTable" },
      ],
    };
    const { cliente } = clienteSpy([
      resultado({ toolCalls: [
        { id: "c", name: "criar_relatorio", arguments: { titulo: "Estoque" } },
        ...SECOES,
        { id: "g", name: "oferecer_geracao", arguments: { motivo: "entendi" } },
      ] }),
      resultado({ message: "posso gerar quando quiser" }),
    ]);
    const r = await runBuilder({ prompt: "monta", fichaAtual: null, user: USER, modo: "jornada", journeyState: js }, deps(cliente));
    expect(r.journeyState?.fase).toBe("resumo");
  });

  it("sem evidencia, oferecer_geracao NAO muda de fase (segue entrevista)", async () => {
    const { cliente } = clienteSpy([
      resultado({ toolCalls: [{ id: "g", name: "oferecer_geracao", arguments: { motivo: "acho que da" } }] }),
      resultado({ message: "ainda preciso entender mais" }),
    ]);
    const r = await runBuilder({ prompt: "gera logo", fichaAtual: null, user: USER, modo: "jornada", journeyState: journeyStateInicial() }, deps(cliente));
    expect(r.journeyState?.fase).toBe("entrevista");
  });

  it("oferecer_opcoes emite evento choices", async () => {
    const eventos: BuilderRunEvent[] = [];
    const { cliente } = clienteSpy([
      resultado({ toolCalls: [{ id: "o", name: "oferecer_opcoes", arguments: { titulo: "Como visualizar?", opcoes: [{ id: "a", rotulo: "Barras", tipoVisual: "BarChart" }, { id: "b", rotulo: "Tabela", tipoVisual: "DataTable" }] } }] }),
      resultado({ message: "qual prefere?" }),
    ]);
    await runBuilder({ prompt: "como mostro?", fichaAtual: null, user: USER, modo: "jornada", journeyState: journeyStateInicial(), onEvent: (e) => eventos.push(e) }, deps(cliente));
    const choices = eventos.find((e) => e.type === "choices");
    expect(choices).toBeTruthy();
    if (choices && choices.type === "choices") expect(choices.opcoes).toHaveLength(2);
  });
});
