import { gerarRelatorio } from "./report";
import type { ResultadoBaldes } from "./types";

const base: ResultadoBaldes = {
  gerado_em: "2026-05-29T12:00:00.000Z",
  fonte_schema: "discovery/odoo-schema/schema.json",
  rodou_sob_uid: 11,
  thresholds: { balde_a_min: 51, balde_b_max: 50 },
  totais: { A: 1, B: 1, C: 1, nao_classificados: 0, total: 3 },
  por_dominio: {
    sped: { A: 1, B: 1, C: 0, nao_classificados: 0 },
    ir: { A: 0, B: 0, C: 1, nao_classificados: 0 },
  },
  modelos: {
    "sped.documento": {
      dominio: "sped",
      descricao: "Documento Fiscal",
      balde: "A",
      count: 211000,
      transient: false,
      motivo: "volume_acima_threshold",
    },
    "sped.mdfe": {
      dominio: "sped",
      descricao: "MDF-e",
      balde: "B",
      count: 0,
      transient: false,
      motivo: "baixo_volume_dominio_negocio",
      previsao_ativacao: "sem_sinal",
    },
    "ir.cron": {
      dominio: "ir",
      descricao: "Agendador",
      balde: "C",
      count: null,
      transient: false,
      motivo: "prefixo_ui_infra",
    },
  },
  nao_classificados: [],
};

describe("gerarRelatorio", () => {
  it("inclui sumário com totais", () => {
    const md = gerarRelatorio(base);
    expect(md).toContain("# Baldes");
    expect(md).toContain("Balde A");
    expect(md).toContain("211000");
  });
  it("destaca os domínios prioritários (só A e B acionáveis)", () => {
    const md = gerarRelatorio(base);
    expect(md).toContain("Domínios prioritários");
    expect(md).toContain("sped.documento"); // A
    expect(md).toContain("sped.mdfe"); // B
    expect(md).not.toContain("ir.cron"); // C-técnico não aparece nas linhas
  });
  it("mostra a descrição humana dos modelos", () => {
    expect(gerarRelatorio(base)).toContain("Documento Fiscal");
  });
  it("agrega o Balde C por motivo (spec §5.2)", () => {
    const md = gerarRelatorio(base);
    expect(md).toContain("Balde C por motivo");
    expect(md).toContain("prefixo_ui_infra");
  });
  it("não usa travessão", () => {
    const emDash = String.fromCharCode(0x2014); // caractere proibido (no-travessao)
    expect(gerarRelatorio(base)).not.toContain(emDash);
  });
});
