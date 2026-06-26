// G2b , Gates determinísticos do agente construtor, com provider mockado.
// Asserções exatas dos tres comportamentos de protecao: recusa honesta ->
// FeatureRequest; teto -> bloqueia sem chamar o modelo; ficha invalida -> repara.
import { runBuilder, MARCADOR_SEM_FONTE } from "../run-builder";
import type { ChatResult, ProviderClient } from "@/lib/agent/llm/types";
import type { RunBuilderDeps } from "../run-builder";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const SECAO_DATATABLE = {
  template: "DataTable",
  fato: "fato_estoque_saldo",
  shapeDerivado: "tabela",
  config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
};

function resultado(p: Partial<ChatResult>): ChatResult {
  return {
    message: p.message ?? "",
    toolCalls: p.toolCalls,
    usage: p.usage ?? { tokensInput: 5, tokensOutput: 3, costUsd: 0 },
  };
}

function clienteRoteirizado(respostas: ChatResult[]): { cliente: ProviderClient; chamadas: () => number } {
  let i = 0;
  return {
    cliente: {
      provider: "openai",
      model: "gpt-5-mini",
      chat: async () => respostas[Math.min(i++, respostas.length - 1)],
    },
    chamadas: () => i,
  };
}

function deps(cliente: ProviderClient, over: Partial<RunBuilderDeps> = {}): RunBuilderDeps {
  return {
    criarCliente: async () => cliente,
    verificarQuota: async () => ({ ok: true }),
    logUsage: jest.fn(async () => {}),
    registrarFeatureRequest: jest.fn(async () => {}),
    ...over,
  };
}

const USER = { id: "user-gate" };

describe("gate , recusa honesta", () => {
  it("registra FeatureRequest com (userId, prompt, dominio) e devolve recusa", async () => {
    const { cliente } = clienteRoteirizado([
      resultado({ message: `${MARCADOR_SEM_FONTE} sem fonte de comissao.` }),
    ]);
    const d = deps(cliente);
    const r = await runBuilder(
      { prompt: "comissoes por vendedor", fichaAtual: null, user: USER },
      d,
    );
    expect(r.recusa).toBe(true);
    expect(r.mensagem).not.toContain(MARCADOR_SEM_FONTE);
    expect(d.registrarFeatureRequest).toHaveBeenCalledTimes(1);
    expect(d.registrarFeatureRequest).toHaveBeenCalledWith(
      "user-gate",
      "comissoes por vendedor",
      null,
    );
  });
});

describe("gate , teto de quota", () => {
  it("nao chama o modelo nem registra uso quando bloqueado", async () => {
    const { cliente, chamadas } = clienteRoteirizado([resultado({ message: "x" })]);
    const d = deps(cliente, {
      verificarQuota: async () => ({ ok: false, motivo: "Teto de uso do construtor atingido." }),
    });
    const r = await runBuilder({ prompt: "qualquer", fichaAtual: null, user: USER }, d);
    expect(r.bloqueado).toBe(true);
    expect(r.mensagem).toMatch(/teto/i);
    expect(chamadas()).toBe(0);
    expect(d.logUsage).not.toHaveBeenCalled();
  });
});

describe("gate , reparo de ficha", () => {
  it("realimenta exatamente uma vez quando conclui sem secao e depois aceita", async () => {
    const { cliente, chamadas } = clienteRoteirizado([
      resultado({ toolCalls: [{ id: "a", name: "criar_relatorio", arguments: { titulo: "X" } }] }),
      resultado({ message: "Pronto." }), // ficha sem secao -> 1 reparo
      resultado({ toolCalls: [{ id: "b", name: "adicionar_secao", arguments: SECAO_DATATABLE }] }),
      resultado({ message: "Agora sim." }),
    ]);
    const d = deps(cliente);
    const r = await runBuilder({ prompt: "estoque", fichaAtual: null, user: USER }, d);
    expect(r.mensagem).toBe("Agora sim.");
    expect(r.ficha?.secoes).toHaveLength(1);
    expect(chamadas()).toBe(4);
    expect(d.logUsage).toHaveBeenCalledTimes(4);
  });
});
