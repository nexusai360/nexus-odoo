import {
  classificarLocal,
  SHOWROOM_ODOO_ID,
  type LocalBruto,
} from "./classificacao-local";

/**
 * Um deposito real: esta na arvore "Proprio", guarda mercadoria em maos,
 * calcula extrato de saldo e tem proprietario.
 */
function local(over: Partial<LocalBruto> = {}): LocalBruto {
  return {
    odooId: 11,
    nomeCompleto: "Próprio / Jds - Matriz DF",
    estoqueEmMaos: true,
    calculaExtratoSaldo: true,
    temProprietario: true,
    ...over,
  };
}

describe("classificarLocal", () => {
  describe("fisico , o estoque que existe dentro de casa", () => {
    it("classifica um deposito proprio real", () => {
      expect(classificarLocal(local())).toBe("fisico");
    });

    it("classifica os quatro depositos com saldo hoje", () => {
      const depositos = [
        { odooId: 11, nomeCompleto: "Próprio / Jds - Matriz DF" },
        { odooId: 12, nomeCompleto: "Próprio / Jds - Filial SE" },
        { odooId: 24, nomeCompleto: "Próprio / Jds - Filial SP" },
        { odooId: 22, nomeCompleto: "Próprio / Jib DF - Matriz DF" },
      ];
      for (const d of depositos) {
        expect(classificarLocal(local(d))).toBe("fisico");
      }
    });
  });

  describe("demonstracao , equipamento posicionado no cliente", () => {
    it("classifica a raiz da arvore de demonstracao", () => {
      expect(
        classificarLocal(
          local({ odooId: 251, nomeCompleto: "Terceiros / Demonstração" }),
        ),
      ).toBe("demonstracao");
    });

    it("classifica um local de demonstracao na casa do cliente", () => {
      expect(
        classificarLocal(
          local({
            odooId: 300,
            nomeCompleto:
              "Terceiros / Demonstração / Jds Comércio - Matriz DF - Condominio Manhattan",
          }),
        ),
      ).toBe("demonstracao");
    });

    it("classifica o Showroom como demonstracao, mesmo estando na arvore Propria", () => {
      // Unica excecao de negocio: o Showroom vive sob "Proprio", mas o que esta
      // la nao e estoque vendavel , e vitrine.
      expect(
        classificarLocal(
          local({
            odooId: SHOWROOM_ODOO_ID,
            nomeCompleto: "Próprio / Showroom",
            estoqueEmMaos: false,
            calculaExtratoSaldo: false,
          }),
        ),
      ).toBe("demonstracao");
    });

    it("a excecao do Showroom vence os demais criterios", () => {
      // Mesmo que um dia o Odoo passe a marcar o Showroom como estoque em maos,
      // ele continua sendo demonstracao.
      expect(
        classificarLocal(
          local({ odooId: SHOWROOM_ODOO_ID, nomeCompleto: "Próprio / Showroom" }),
        ),
      ).toBe("demonstracao");
    });

    it("classifica o JDSDEMO nosso (raiz Proprio + 'demo' no nome) como demonstracao", () => {
      // Regra da reuniao: nossos depositos de demonstracao (sem nota), sob "Proprio",
      // com "JDS DEMO"/"demo" no nome, vao para demonstracao, nao para fisico.
      expect(
        classificarLocal(
          local({ odooId: 414, nomeCompleto: "Próprio / JDS DEMO SÃO PAULO" }),
        ),
      ).toBe("demonstracao");
    });

    it("reconhece JDSDEMO sem espaco no nome", () => {
      expect(
        classificarLocal(
          local({ odooId: 998, nomeCompleto: "Próprio / JDSDEMO Interlagos" }),
        ),
      ).toBe("demonstracao");
    });
  });

  describe("fora , nao entra no valor de estoque", () => {
    it("exclui a assistencia tecnica (ASTEC nao calcula extrato de saldo)", () => {
      expect(
        classificarLocal(
          local({
            odooId: 29,
            nomeCompleto: "Próprio / ASTEC DF",
            calculaExtratoSaldo: false,
          }),
        ),
      ).toBe("fora");
    });

    it("exclui local inativo (nao guarda estoque em maos)", () => {
      expect(
        classificarLocal(
          local({
            odooId: 271,
            nomeCompleto: "Próprio / INATIVO",
            estoqueEmMaos: false,
            calculaExtratoSaldo: false,
            temProprietario: false,
          }),
        ),
      ).toBe("fora");
    });

    it("exclui local de razao social (nao guarda estoque em maos)", () => {
      expect(
        classificarLocal(
          local({
            odooId: 36,
            nomeCompleto:
              "Próprio / Jds Comércio - Matriz DF 18.282.961/0001-00 - Jds Comércio de Produtos e Equipamentos Esportivos Ltda",
            estoqueEmMaos: false,
          }),
        ),
      ).toBe("fora");
    });

    it("exclui o local sem proprietario", () => {
      expect(classificarLocal(local({ temProprietario: false }))).toBe("fora");
    });

    it("exclui a arvore Virtual (R$ 10,2 mi que nunca existiram em casa)", () => {
      expect(
        classificarLocal(
          local({
            odooId: 3,
            nomeCompleto: "Virtual",
            estoqueEmMaos: false,
            calculaExtratoSaldo: false,
          }),
        ),
      ).toBe("fora");
    });

    it("exclui a arvore Terceiros (mercadoria em poder de terceiros)", () => {
      expect(
        classificarLocal(
          local({
            odooId: 2,
            nomeCompleto: "Terceiros",
            estoqueEmMaos: false,
            calculaExtratoSaldo: false,
          }),
        ),
      ).toBe("fora");
    });

    it("exclui Feira e Patrimonio (irmaos de Demonstracao, nao demonstracao)", () => {
      expect(
        classificarLocal(local({ odooId: 274, nomeCompleto: "Terceiros / Feira" })),
      ).toBe("fora");
      expect(
        classificarLocal(
          local({ odooId: 382, nomeCompleto: "Terceiros / Patrimônio" }),
        ),
      ).toBe("fora");
    });
  });

  describe("fail-closed , o que nao se sabe classificar nunca infla o estoque", () => {
    it("trata nome nulo como fora", () => {
      expect(classificarLocal(local({ nomeCompleto: null }))).toBe("fora");
    });

    it("trata nome vazio como fora", () => {
      expect(classificarLocal(local({ nomeCompleto: "" }))).toBe("fora");
    });

    it("rejeita o formato do FATO (display_name invertido com »)", () => {
      // O fato guarda "Jds - Matriz DF » Próprio" (display_name do Odoo, invertido).
      // A funcao so aceita o nome_completo hierarquico do raw. Se alguem passar o
      // formato errado, o resultado e `fora` , nunca um falso positivo de estoque.
      expect(
        classificarLocal(local({ nomeCompleto: "Jds - Matriz DF » Próprio" })),
      ).toBe("fora");
    });

    it("nao confunde um local cuja raiz apenas comeca com 'Próprio'", () => {
      expect(
        classificarLocal(local({ odooId: 999, nomeCompleto: "Próprios / Outro" })),
      ).toBe("fora");
    });
  });

  describe("em transferencia , mercadoria nossa em transito (decisao do dono, reuniao 2026-07-19)", () => {
    it("classifica 'EM TRANSFERENCIA' como fisico (conta como proprio), sem estoque em maos/proprietario", () => {
      // O local 446 e invisivel hoje (record rule do Odoo); quando liberado, vira assim no cache.
      expect(
        classificarLocal(
          local({
            odooId: 446,
            nomeCompleto: "EM TRANSFERÊNCIA",
            estoqueEmMaos: false,
            calculaExtratoSaldo: false,
            temProprietario: false,
          }),
        ),
      ).toBe("fisico");
    });

    it("pega a transferencia mesmo se o nome vier sob uma raiz", () => {
      expect(
        classificarLocal(local({ odooId: 446, nomeCompleto: "Próprio / Em Transferência" })),
      ).toBe("fisico");
    });

    it("NAO confunde 'Transporte(s)' de cliente com transferencia (fica fora)", () => {
      expect(
        classificarLocal(
          local({
            odooId: 249,
            nomeCompleto: "Terceiros / Jds Comércio - 333 Transportes Ltda",
            estoqueEmMaos: false,
            calculaExtratoSaldo: false,
            temProprietario: false,
          }),
        ),
      ).toBe("fora");
    });
  });

  describe("intercompany , mercadoria entre empresas do proprio grupo (decisao do dono, reuniao 2026-07-19)", () => {
    /** O local 285 real: filho direto de Terceiros, dono = Jht SP (empresa do grupo). */
    function intercompany(over: Partial<LocalBruto> = {}): LocalBruto {
      return local({
        odooId: 285,
        nomeCompleto:
          "Terceiros / Jds Comércio - Matriz DF 18.282.961/0001-00 - Jht SP Comércio - Matriz DF 34.161.829/0001-98 - Jht SP Comércio de Produtos e Equipamentos Esportivos Ltda [34.161.829/0001-98]",
        proprietarioEhEmpresaDoGrupo: true,
        ...over,
      });
    }

    it("classifica como fisico o local de Terceiros cujo dono e empresa do grupo", () => {
      // "Terceiro, mas e nosso": a mercadoria trocou de CNPJ dentro do grupo, nao saiu de casa.
      expect(classificarLocal(intercompany())).toBe("fisico");
    });

    it("mantem fora o local de Terceiros de um cliente de verdade", () => {
      expect(
        classificarLocal(
          intercompany({
            odooId: 249,
            nomeCompleto: "Terceiros / Jds Comércio - Condominio Manhattan",
            proprietarioEhEmpresaDoGrupo: false,
          }),
        ),
      ).toBe("fora");
    });

    it("nao vale para as subarvores de Terceiros (Feira, Patrimonio): la a mercadoria esta em evento, nao em deposito", () => {
      expect(
        classificarLocal(
          intercompany({
            odooId: 380,
            nomeCompleto: "Terceiros / Feira / Jds Comércio - Matriz DF",
          }),
        ),
      ).toBe("fora");
    });

    it("demonstracao vence intercompany (equipamento no cliente continua demonstracao)", () => {
      // Locais de demonstracao cujo dono e uma empresa do grupo existem (ex.: 391, filial BA).
      // Eles sao demonstracao, nao estoque vendavel.
      expect(
        classificarLocal(
          intercompany({
            odooId: 391,
            nomeCompleto:
              "Terceiros / Demonstração / Jds Comércio - Matriz DF - Jht SP Comércio - Filial BA",
          }),
        ),
      ).toBe("demonstracao");
    });

    it("a raiz 'Terceiros' sozinha nunca vira fisico", () => {
      expect(
        classificarLocal(
          intercompany({ odooId: 2, nomeCompleto: "Terceiros" }),
        ),
      ).toBe("fora");
    });

    it("sem a informacao do dono, o local de Terceiros continua fora (fail-closed)", () => {
      const semInfo = intercompany();
      delete semInfo.proprietarioEhEmpresaDoGrupo;
      expect(classificarLocal(semInfo)).toBe("fora");
    });
  });
});
