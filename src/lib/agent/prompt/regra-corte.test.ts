// src/lib/agent/prompt/regra-corte.test.ts
//
// A regra da "data de início das análises" não pode depender do texto que o admin
// edita na tela. Ela morava DENTRO do identityBase, e o identityBase é sobrescrito
// pelo banco (quando o admin salva o prompt) ou descartado inteiro (quando existe um
// advancedOverride). Nos dois casos o Nex perdia a regra , e continuava recebendo a
// data no [Contexto], ou seja: recebia a data e não sabia o que fazer com ela.
//
// Em produção (2026-07-13) o `identity_base` salvo no banco ainda trazia o texto
// ANTIGO ("apenas dados de 2026 em diante"), que contradiz a data configurada. Só não
// estava valendo porque `uses_code_defaults` estava true. Bastava um "Salvar" na tela.

import { composeSystemPrompt, IDENTITY_BASE } from "./compose";
import type { AgentPromptConfig } from "./compose";
import { REGRA_INICIO_ANALISES } from "./regra-corte";

const base: AgentPromptConfig = {
  identityBase: null,
  personality: "",
  tone: "",
  guardrails: [],
  advancedOverride: null,
  kbEnabled: false,
  terminology: {},
  suggestionsEnabled: false,
};

/** Trecho curto e estável da regra, usado como sonda nos três cenários. */
const SONDA = "Data de início das análises";

describe("REGRA_INICIO_ANALISES", () => {
  test("não crava data nenhuma no texto (a data chega por turno, no [Contexto])", () => {
    // Qualquer ano cravado aqui vira mentira no dia em que o dono mudar a data na tela.
    expect(REGRA_INICIO_ANALISES).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  test("proíbe o agente de dizer que o dado não existe", () => {
    expect(REGRA_INICIO_ANALISES).toContain("PROIBIDO");
  });
});

describe("composeSystemPrompt , a regra do corte é inegociável", () => {
  test("prompt padrão (do código) contém a regra", () => {
    expect(composeSystemPrompt(base, [])).toContain(SONDA);
  });

  test("prompt vindo do BANCO (admin salvou pela tela) ainda contém a regra", () => {
    const cfg = {
      ...base,
      identityBase: "Voce e o Nex. Texto customizado pelo admin, sem falar de corte.",
    };
    expect(composeSystemPrompt(cfg, [])).toContain(SONDA);
  });

  test("prompt do banco com o TEXTO VELHO ainda recebe a regra nova por último", () => {
    // O texto velho ("2026 em diante") é o que está salvo em produção hoje. A regra
    // nova precisa vir DEPOIS dele no prompt (recency), corrigindo a instrução.
    const velho = "## Corte temporal do cache\nA base guarda apenas dados de 2026 em diante.";
    const out = composeSystemPrompt({ ...base, identityBase: velho }, []);
    expect(out).toContain(SONDA);
    expect(out.indexOf(SONDA)).toBeGreaterThan(out.indexOf("2026 em diante"));
  });

  test("advancedOverride (que descarta a identidade inteira) ainda contém a regra", () => {
    const cfg = { ...base, advancedOverride: "Prompt completamente customizado." };
    const out = composeSystemPrompt(cfg, []);
    expect(out).toContain("Prompt completamente customizado.");
    expect(out).toContain(SONDA);
  });

  test("a regra não é duplicada no prompt padrão", () => {
    const out = composeSystemPrompt(base, []);
    expect(out.split(SONDA).length - 1).toBe(1);
  });

  test("o IDENTITY_BASE não carrega mais a regra (ela vive fora do texto editável)", () => {
    expect(IDENTITY_BASE).not.toContain(SONDA);
  });
});
