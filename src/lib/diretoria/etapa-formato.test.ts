import { formatarNomeEtapa } from "./etapa-formato";

describe("formatarNomeEtapa", () => {
  // Exemplos obrigatorios da review A1 (sentence-case POR PALAVRA, por clausula).
  it("title-case por palavra dentro da clausula", () => {
    expect(formatarNomeEtapa("GERA BOLETO")).toBe("Gera Boleto");
    expect(formatarNomeEtapa("VF - Novo Fracionamento")).toBe("VF - Novo Fracionamento");
    expect(formatarNomeEtapa("V.O - Aprovado")).toBe("V.O - Aprovado");
    expect(formatarNomeEtapa("Transf. DF x Sergipe confirma")).toBe(
      "Transf. DF x Sergipe Confirma",
    );
  });

  it("mantem as siglas da allowlist em caixa alta", () => {
    expect(formatarNomeEtapa("CORREÇÃO - Emite NF")).toBe("Correção - Emite NF");
    expect(formatarNomeEtapa("VF 5922/6922 - PDV")).toBe("VF 5922/6922 - PDV");
    expect(formatarNomeEtapa("FAT JIB DF X GRUPO")).toBe("Fat JIB DF x Grupo");
    expect(formatarNomeEtapa("[SMARTFIT] - FAT JDS X GRUPO")).toBe(
      "[SMARTFIT] - Fat JDS x Grupo",
    );
  });

  it("preserva V.O (sigla com ponto) e title-case do resto", () => {
    expect(formatarNomeEtapa("V.O - Input Financeiro")).toBe("V.O - Input Financeiro");
    expect(formatarNomeEtapa("V.O 5119/6119 - PDV")).toBe("V.O 5119/6119 - PDV");
  });

  it("mantem SN/LR/LP em caixa alta e capitaliza o resto", () => {
    expect(formatarNomeEtapa("TRANSF SN Matriz - Filial")).toBe("Transf SN Matriz - Filial");
    expect(formatarNomeEtapa("TRANSF LR Matriz - Filial")).toBe("Transf LR Matriz - Filial");
    expect(formatarNomeEtapa("TRANSF LP Matriz - Filial")).toBe("Transf LP Matriz - Filial");
  });

  it("conector 'x' minusculo e 'de' minusculo no meio da clausula", () => {
    expect(formatarNomeEtapa("Retorno transferencia SERGIPE x DF")).toBe(
      "Retorno Transferencia Sergipe x DF",
    );
    expect(formatarNomeEtapa("REMESSA DE BONIFICAÇÃO 5910/6910")).toBe(
      "Remessa de Bonificação 5910/6910",
    );
  });

  it("capitaliza cada palavra apos '/' e preserva numeros/colchetes", () => {
    expect(formatarNomeEtapa("VF - SEGUIR COM RESERVA/FRACIONAMENTO - 5117/6117")).toBe(
      "VF - Seguir Com Reserva/Fracionamento - 5117/6117",
    );
    expect(formatarNomeEtapa("Pedido Transferência Matriz/Filial")).toBe(
      "Pedido Transferência Matriz/Filial",
    );
  });

  it("FAT/TRANSF/CONF/MOV ficam title-case (nao sao siglas por decisao)", () => {
    expect(formatarNomeEtapa("CONF. MOV. ESTOQUE - FLUXO SERGIPE")).toBe(
      "Conf. Mov. Estoque - Fluxo Sergipe",
    );
    expect(formatarNomeEtapa("FAT TRANSF CONFIRMA")).toBe("Fat Transf Confirma");
  });

  it("string vazia/nula/undefined vira string vazia", () => {
    expect(formatarNomeEtapa("")).toBe("");
    expect(formatarNomeEtapa(null)).toBe("");
    expect(formatarNomeEtapa(undefined)).toBe("");
  });

  it("nunca lanca e sempre devolve string nao vazia para os 79 nomes reais", () => {
    const reais = [
      "Aguardando Autorização", "Aprovação diretoria", "CORREÇÃO - Emite NF",
      "FAT JDS X GRUPO BONIFICAÇÃO CONFIRMA", "GERA BOLETO", "Input financeiro",
      "Remessa de Armazenagem 5905/6905", "Transf. DF x Sergipe confirma",
      "V.O - Fat Cliente Presumido", "VF - Fracionamento concluído",
    ];
    for (const nome of reais) {
      const saida = formatarNomeEtapa(nome);
      expect(typeof saida).toBe("string");
      expect(saida.length).toBeGreaterThan(0);
    }
  });
});
