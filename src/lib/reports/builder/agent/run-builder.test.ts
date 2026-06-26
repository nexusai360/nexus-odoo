import { runBuilder, MARCADOR_SEM_FONTE, MAX_ITER } from "./run-builder";
import type { ChatRequest, ChatResult, ProviderClient } from "@/lib/agent/llm/types";
import type { RunBuilderDeps } from "./run-builder";

// read-tools -> source-registry importa @/lib/prisma (client gerado usa import.meta).
jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const SECAO_DATATABLE = {
  template: "DataTable",
  fato: "fato_estoque_saldo",
  shapeDerivado: "tabela",
  config: { colunas: [{ key: "produtoNome", header: "Produto", tipo: "texto" }] },
};

function clienteRoteirizado(respostas: ChatResult[]): ProviderClient {
  let i = 0;
  return {
    provider: "openai",
    model: "gpt-5-mini",
    chat: async (_req: ChatRequest): Promise<ChatResult> =>
      respostas[Math.min(i++, respostas.length - 1)],
  };
}

function resultado(parcial: Partial<ChatResult>): ChatResult {
  return {
    message: parcial.message ?? "",
    toolCalls: parcial.toolCalls,
    usage: parcial.usage ?? { tokensInput: 10, tokensOutput: 5, costUsd: 0 },
  };
}

function depsBase(cliente: ProviderClient, over: Partial<RunBuilderDeps> = {}): RunBuilderDeps {
  return {
    criarCliente: async () => cliente,
    verificarQuota: async () => ({ ok: true }),
    logUsage: jest.fn(async () => {}),
    registrarFeatureRequest: jest.fn(async () => {}),
    obterReasoning: async () => ({ ligado: false, effort: null }),
    ...over,
  };
}

const USER = { id: "user-1" };

describe("runBuilder , caminho feliz", () => {
  it("gera uma ficha valida com 1 DataTable e devolve a mensagem final", async () => {
    const cliente = clienteRoteirizado([
      resultado({
        toolCalls: [
          { id: "a", name: "criar_relatorio", arguments: { titulo: "Estoque por armazem" } },
          { id: "b", name: "adicionar_secao", arguments: SECAO_DATATABLE },
        ],
      }),
      resultado({ message: "Pronto, criei seu relatorio." }),
    ]);
    const deps = depsBase(cliente);
    const r = await runBuilder({ prompt: "estoque por armazem", fichaAtual: null, user: USER }, deps);
    expect(r.ficha).not.toBeNull();
    expect(r.ficha!.secoes).toHaveLength(1);
    expect(r.ficha!.secoes[0].template).toBe("DataTable");
    expect(r.mensagem).toBe("Pronto, criei seu relatorio.");
    expect(r.recusa).toBeFalsy();
    expect(r.bloqueado).toBeFalsy();
    expect(deps.logUsage).toHaveBeenCalledTimes(2);
    const argLog = (deps.logUsage as jest.Mock).mock.calls[0][0];
    expect(argLog.origin).toBe("construtor");
  });
});

describe("runBuilder , eventos de tool ao vivo + resumo", () => {
  it("emite tool_call/tool_result por tool e devolve toolsCalled + reasoningMs", async () => {
    const cliente = clienteRoteirizado([
      resultado({
        toolCalls: [
          { id: "a", name: "criar_relatorio", arguments: { titulo: "Estoque por armazem" } },
          { id: "b", name: "adicionar_secao", arguments: SECAO_DATATABLE },
        ],
      }),
      resultado({ message: "Pronto." }),
    ]);
    const deps = depsBase(cliente);
    const eventos: { type: string; toolName: string; label: string }[] = [];
    const r = await runBuilder(
      {
        prompt: "estoque por armazem",
        fichaAtual: null,
        user: USER,
        onEvent: (e) => eventos.push(e as (typeof eventos)[number]),
      },
      deps,
    );
    // 2 tools -> 4 eventos (call+result de cada), na ordem.
    expect(eventos.map((e) => e.type)).toEqual([
      "tool_call",
      "tool_result",
      "tool_call",
      "tool_result",
    ]);
    expect(eventos[0]).toMatchObject({ toolName: "criar_relatorio", label: "Criando o relatorio" });
    expect(eventos[2]).toMatchObject({ toolName: "adicionar_secao", label: "Adicionando uma secao" });
    // Resumo do turno: rotulos das tools + duracao numerica.
    expect(r.toolsCalled).toEqual([
      { label: "Criando o relatorio" },
      { label: "Adicionando uma secao" },
    ]);
    expect(typeof r.reasoningMs).toBe("number");
    expect(r.reasoningMs).toBeGreaterThanOrEqual(0);
  });
});

describe("runBuilder , estouro de MAX_ITER", () => {
  it("para com mensagem de limite quando o modelo nunca conclui", async () => {
    const cliente = clienteRoteirizado([
      resultado({ toolCalls: [{ id: "x", name: "listar_componentes", arguments: {} }] }),
    ]);
    const deps = depsBase(cliente);
    const r = await runBuilder({ prompt: "loop", fichaAtual: null, user: USER }, deps);
    expect(r.erro).toBe(true);
    expect(r.mensagem).toMatch(/limite/i);
    expect(deps.logUsage).toHaveBeenCalledTimes(MAX_ITER);
  });
});

describe("runBuilder , reparo de ficha", () => {
  it("realimenta quando o modelo conclui sem nenhuma secao e depois aceita", async () => {
    const cliente = clienteRoteirizado([
      resultado({ toolCalls: [{ id: "a", name: "criar_relatorio", arguments: { titulo: "X" } }] }),
      resultado({ message: "Pronto." }), // ficha sem secao -> reparo
      resultado({ toolCalls: [{ id: "b", name: "adicionar_secao", arguments: SECAO_DATATABLE }] }),
      resultado({ message: "Agora sim." }),
    ]);
    const deps = depsBase(cliente);
    const r = await runBuilder({ prompt: "estoque", fichaAtual: null, user: USER }, deps);
    expect(r.mensagem).toBe("Agora sim.");
    expect(r.ficha!.secoes).toHaveLength(1);
  });
});

describe("runBuilder , recusa honesta", () => {
  it("registra FeatureRequest e devolve recusa quando nao ha fonte", async () => {
    const cliente = clienteRoteirizado([
      resultado({ message: `${MARCADOR_SEM_FONTE} nao ha fonte de faturamento por vendedor ainda.` }),
    ]);
    const deps = depsBase(cliente);
    const r = await runBuilder(
      { prompt: "faturamento por vendedor", fichaAtual: null, user: USER },
      deps,
    );
    expect(r.recusa).toBe(true);
    expect(deps.registrarFeatureRequest).toHaveBeenCalledTimes(1);
    const args = (deps.registrarFeatureRequest as jest.Mock).mock.calls[0];
    expect(args[0]).toBe("user-1");
    expect(args[1]).toMatch(/faturamento por vendedor/);
  });
});

describe("runBuilder , teto de quota", () => {
  it("bloqueia antes de chamar o modelo quando a quota estourou", async () => {
    const chat = jest.fn();
    const cliente: ProviderClient = { provider: "openai", model: "gpt-5-mini", chat };
    const deps = depsBase(cliente, {
      verificarQuota: async () => ({ ok: false, motivo: "Teto de uso do construtor atingido." }),
    });
    const r = await runBuilder({ prompt: "x", fichaAtual: null, user: USER }, deps);
    expect(r.bloqueado).toBe(true);
    expect(r.mensagem).toMatch(/teto/i);
    expect(chat).not.toHaveBeenCalled();
  });
});

describe("runBuilder , erro ao criar cliente", () => {
  it("devolve erro amigavel quando nao ha credencial para o provider", async () => {
    const deps = depsBase({} as ProviderClient, {
      criarCliente: async () => ({ erro: "sem_credencial" }),
    });
    const r = await runBuilder({ prompt: "x", fichaAtual: null, user: USER }, deps);
    expect(r.erro).toBe(true);
    expect(r.ficha).toBeNull();
  });
});
