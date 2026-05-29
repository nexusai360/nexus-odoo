import {
  dominioDe,
  classificarOffline,
  classificarComCount,
  previsaoAtivacao,
} from "./classify";
import type { ModeloSchema } from "./types";

const m = (modelo: string, transient = false): ModeloSchema => ({
  modelo,
  descricao: modelo,
  transient,
});

describe("dominioDe", () => {
  it("extrai o prefixo antes do primeiro ponto", () => {
    expect(dominioDe("sped.documento")).toBe("sped");
    expect(dominioDe("res.partner.bank")).toBe("res");
  });
  it("modelo sem ponto vira o próprio nome", () => {
    expect(dominioDe("calendar")).toBe("calendar");
  });
});

describe("classificarOffline", () => {
  it("transient -> C/transient", () => {
    expect(classificarOffline(m("finan.wizard.x", true))).toEqual({
      balde: "C",
      motivo: "transient",
    });
  });
  it("sufixo técnico -> C/sufixo_tecnico", () => {
    expect(classificarOffline(m("sped.documento.base"))).toEqual({
      balde: "C",
      motivo: "sufixo_tecnico",
    });
    expect(classificarOffline(m("res.config.settings"))).toEqual({
      balde: "C",
      motivo: "sufixo_tecnico",
    });
    expect(classificarOffline(m("finan.relatorio.configuracao"))).toEqual({
      balde: "C",
      motivo: "sufixo_tecnico",
    });
  });
  it("prefixo UI/infra -> C/prefixo_ui_infra", () => {
    expect(classificarOffline(m("ir.cron"))).toEqual({
      balde: "C",
      motivo: "prefixo_ui_infra",
    });
    expect(classificarOffline(m("mail.message"))).toEqual({
      balde: "C",
      motivo: "prefixo_ui_infra",
    });
  });
  it("modelo de negócio comum -> null (segue para RPC)", () => {
    expect(classificarOffline(m("sped.documento"))).toBeNull();
    expect(classificarOffline(m("res.partner"))).toBeNull();
  });
  it("transient tem precedência sobre prefixo de negócio", () => {
    expect(classificarOffline(m("sped.algo", true))).toEqual({
      balde: "C",
      motivo: "transient",
    });
  });
});

describe("classificarComCount", () => {
  it("count >= 51 -> A", () => {
    expect(classificarComCount(m("sped.documento"), 211000)).toEqual({
      balde: "A",
      motivo: "volume_acima_threshold",
    });
    expect(classificarComCount(m("crm.lead"), 51)).toEqual({
      balde: "A",
      motivo: "volume_acima_threshold",
    });
  });
  it("count <= 50 em prefixo de negócio -> B", () => {
    expect(classificarComCount(m("sped.mdfe"), 0)).toEqual({
      balde: "B",
      motivo: "baixo_volume_dominio_negocio",
    });
    expect(classificarComCount(m("crm.stage"), 5)).toEqual({
      balde: "B",
      motivo: "baixo_volume_dominio_negocio",
    });
  });
  it("count = 50 é fronteira de B (não A)", () => {
    expect(classificarComCount(m("finan.banco"), 50).balde).toBe("B");
  });
  it("count <= 50 em prefixo não-negócio -> C", () => {
    expect(classificarComCount(m("calendar.event"), 3)).toEqual({
      balde: "C",
      motivo: "baixo_volume_nao_negocio",
    });
  });
});

describe("previsaoAtivacao", () => {
  it("count > 0 -> em_uso", () => {
    expect(previsaoAtivacao(5, [0, 0])).toBe("em_uso");
  });
  it("count 0 mas outro modelo do prefixo tem dado -> instalado_sem_uso", () => {
    expect(previsaoAtivacao(0, [0, 12, 0])).toBe("instalado_sem_uso");
  });
  it("count 0 e prefixo inteiro vazio -> sem_sinal", () => {
    expect(previsaoAtivacao(0, [0, 0])).toBe("sem_sinal");
    expect(previsaoAtivacao(0, [])).toBe("sem_sinal");
  });
});
