import {
  roleMeetsChannelLevel,
  podeUsarBolha,
  podeTranscreverAudio,
} from "./channel-access";

describe("roleMeetsChannelLevel", () => {
  it("off bloqueia todos", () => {
    expect(roleMeetsChannelLevel("super_admin", "off")).toBe(false);
    expect(roleMeetsChannelLevel("viewer", "off")).toBe(false);
  });
  it("viewer (nível) libera todos os roles", () => {
    expect(roleMeetsChannelLevel("viewer", "viewer")).toBe(true);
    expect(roleMeetsChannelLevel("manager", "viewer")).toBe(true);
    expect(roleMeetsChannelLevel("super_admin", "viewer")).toBe(true);
  });
  it("manager (nível) exige role >= manager", () => {
    expect(roleMeetsChannelLevel("viewer", "manager")).toBe(false);
    expect(roleMeetsChannelLevel("manager", "manager")).toBe(true);
    expect(roleMeetsChannelLevel("admin", "manager")).toBe(true);
  });
  it("super_admin (nível) só libera super_admin", () => {
    expect(roleMeetsChannelLevel("admin", "super_admin")).toBe(false);
    expect(roleMeetsChannelLevel("super_admin", "super_admin")).toBe(true);
  });
});

// O gate da bolha existia SO no layout (escondia o botao). As rotas de API do
// agente nao consultavam o nivel, entao um usuario autenticado abaixo dele
// conseguia conversar com o Nex chamando POST /api/agent/stream direto.
// Estes testes fixam a regra que as rotas passam a aplicar no servidor.
describe("podeUsarBolha , gate do chat in-app", () => {
  it("respeita o nível configurado do canal", () => {
    expect(podeUsarBolha("admin", "super_admin")).toBe(false);
    expect(podeUsarBolha("super_admin", "super_admin")).toBe(true);
    expect(podeUsarBolha("manager", "admin")).toBe(false);
    expect(podeUsarBolha("admin", "admin")).toBe(true);
  });

  it("canal desativado fecha para todos, inclusive super_admin", () => {
    expect(podeUsarBolha("super_admin", "off")).toBe(false);
    expect(podeUsarBolha("admin", "off")).toBe(false);
  });
});

// A transcrição de áudio serve TRÊS superfícies: a bolha, o Playground e o
// construtor de relatórios. Gateá-la só pela bolha derrubaria o Playground de um
// admin sempre que a bolha estivesse restrita a super_admin. Regra: passa quem
// pode usar a bolha OU quem tem acesso ao Playground (admin/super_admin).
describe("podeTranscreverAudio", () => {
  it("quem pode usar a bolha, pode transcrever", () => {
    expect(podeTranscreverAudio("manager", "manager")).toBe(true);
    expect(podeTranscreverAudio("viewer", "viewer")).toBe(true);
  });

  it("admin mantém a transcrição do Playground mesmo com a bolha restrita", () => {
    expect(podeTranscreverAudio("admin", "super_admin")).toBe(true);
    expect(podeTranscreverAudio("super_admin", "off")).toBe(true);
  });

  it("quem não alcança a bolha e não tem Playground, não transcreve", () => {
    expect(podeTranscreverAudio("manager", "admin")).toBe(false);
    expect(podeTranscreverAudio("viewer", "manager")).toBe(false);
    expect(podeTranscreverAudio("manager", "off")).toBe(false);
  });
});
