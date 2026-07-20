// src/lib/fiscal/regras/__tests__/classifica-etapa-demanda.test.ts
import {
  classificaEtapaDemanda,
  type GatilhosEtapa,
} from "../classifica-etapa-demanda";

const base: GatilhosEtapa = {
  nome: "",
  finalizaFaturamento: false,
  finalizaPedidoConfirmando: false,
  finalizaPedidoCancelando: false,
};

describe("classificaEtapaDemanda , estagio por gatilho (dado real do Odoo Tauga)", () => {
  it("Emite NF Consumidor Final (emite nota + conclui) => FECHADA", () => {
    expect(
      classificaEtapaDemanda({
        ...base,
        nome: "Emite NF Consumidor Final",
        finalizaFaturamento: true,
        finalizaPedidoConfirmando: true,
      }),
    ).toBe("FECHADA");
  });

  it("Concluida (conclui, sem emitir aqui) => FECHADA", () => {
    expect(
      classificaEtapaDemanda({ ...base, nome: "Concluida", finalizaPedidoConfirmando: true }),
    ).toBe("FECHADA");
  });

  it("GERA BOLETO (nenhum gatilho terminal) => ABERTA", () => {
    expect(classificaEtapaDemanda({ ...base, nome: "GERA BOLETO" })).toBe("ABERTA");
  });

  it("Aprovado / Input financeiro / Fracionar => ABERTA", () => {
    for (const nome of ["Aprovado", "Input financeiro", "Fracionar", "Em separacao"]) {
      expect(classificaEtapaDemanda({ ...base, nome })).toBe("ABERTA");
    }
  });

  it("Cancelado / Cancelada => IGNORAR (mesmo que outro gatilho esteja setado)", () => {
    expect(
      classificaEtapaDemanda({ ...base, nome: "Cancelado", finalizaPedidoCancelando: true }),
    ).toBe("IGNORAR");
    expect(
      classificaEtapaDemanda({
        ...base,
        nome: "Cancelada",
        finalizaPedidoCancelando: true,
        finalizaFaturamento: true,
      }),
    ).toBe("IGNORAR");
  });

  it("Nota emitida e nao entregue: sem excecao por nome; com nota emitida => FECHADA (a whitelist e quem mantem 226 na demanda)", () => {
    expect(
      classificaEtapaDemanda({
        ...base,
        nome: "Nota emitida e nao entregue.",
        finalizaFaturamento: true,
      }),
    ).toBe("FECHADA");
  });
});
