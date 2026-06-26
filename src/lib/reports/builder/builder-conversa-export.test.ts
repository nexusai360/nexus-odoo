import {
  formatarBuilderConversaTxt,
  nomeArquivoBuilderConversa,
} from "./builder-conversa-export";
import type { BuilderMessageDto } from "./builder-conversation-repo";

const MSGS: BuilderMessageDto[] = [
  {
    id: "1",
    role: "user",
    content: "saldo de estoque por armazem",
    kind: "text",
    createdAt: "2026-06-26T14:00:00.000Z",
  },
  {
    id: "2",
    role: "assistant",
    content: "Pronto, montei a tabela.",
    kind: "text",
    createdAt: "2026-06-26T14:00:05.000Z",
    steps: [{ label: "Criando o relatorio" }, { label: "Adicionando uma secao" }],
    durationMs: 5000,
  },
];

describe("formatarBuilderConversaTxt", () => {
  it("inclui cabecalho, ambos os papeis e o resumo de ferramentas", () => {
    const txt = formatarBuilderConversaTxt(MSGS, {
      titulo: "Saldo por armazem",
      criadoEm: "2026-06-26T13:59:00.000Z",
    });
    expect(txt).toContain("Construtor de relatorios");
    expect(txt).toContain("Relatorio: Saldo por armazem");
    expect(txt).toContain("Voce:");
    expect(txt).toContain("Agente Nex:");
    expect(txt).toContain("saldo de estoque por armazem");
    expect(txt).toContain("ferramentas: Criando o relatorio, Adicionando uma secao");
  });

  it("usa placeholder quando o texto da mensagem esta vazio", () => {
    const txt = formatarBuilderConversaTxt(
      [{ id: "1", role: "assistant", content: "", kind: "text", createdAt: "2026-06-26T14:00:00.000Z" }],
      { titulo: null, criadoEm: "2026-06-26T14:00:00.000Z" },
    );
    expect(txt).toContain("(sem texto)");
  });
});

describe("nomeArquivoBuilderConversa", () => {
  it("gera slug do titulo", () => {
    expect(nomeArquivoBuilderConversa({ titulo: "Saldo por Armazém", criadoEm: new Date() })).toBe(
      "construtor-saldo-por-armazem.txt",
    );
  });
  it("cai em fallback quando nao ha titulo", () => {
    expect(nomeArquivoBuilderConversa({ titulo: null, criadoEm: new Date() })).toBe(
      "construtor-relatorio.txt",
    );
  });
});
