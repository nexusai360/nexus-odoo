// Modo sombra da classificação de receita: a regra NOVA (natureza) roda ao lado da ANTIGA
// (nome da operação), mas quem decide o número continua sendo a ANTIGA. Decisão do dono
// (2026-07-13): "faz sempre pelos dois lados; se divergir, usa SEMPRE o valor do filtro por
// venda no nome. É uma trava de segurança momentânea, e a gente monitora os acertos."
import { classificaReceita } from "../classificacao-receita";

const notaBase = {
  entradaSaida: "1",
  situacaoNfe: "autorizada",
  modelo: "55",
  operacaoNome: "AOP1 - Venda Lucro real 5102/6102/6108",
  finalidadeNfe: "1",
  naturezaOperacaoId: 1, // VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS
  intragrupo: false,
};

describe("classificaReceita , as duas regras correm juntas, o NOME manda", () => {
  it("as duas concordam que e venda: decisao = true, sem divergencia", () => {
    const r = classificaReceita(notaBase);
    expect(r.porNome).toBe(true);
    expect(r.porNatureza).toBe(true);
    expect(r.decisao).toBe(true);
    expect(r.divergente).toBe(false);
  });

  it("as duas concordam que NAO e venda", () => {
    const r = classificaReceita({
      ...notaBase,
      operacaoNome: "Transferência entre Filiais 5152/6152 - Real",
      naturezaOperacaoId: 9, // TRANSFERENCIA
    });
    expect(r.decisao).toBe(false);
    expect(r.divergente).toBe(false);
  });

  // A NOTA 44030 EM PRODUCAO (R$ 190.986,33): operacao "AOP1 - Venda Lucro Presumido",
  // natureza de VENDA, pedido de venda PV-0788/26, cliente externo... e o CFOP dos itens
  // digitado errado (6949). Aqui as duas regras concordam , e o exemplo de por que o CFOP
  // ficou de fora da decisao.
  it("divergencia: SO o nome diz venda -> prevalece o NOME (a receita e preservada)", () => {
    const r = classificaReceita({
      ...notaBase,
      operacaoNome: "AOP1 - Venda Lucro Presumido 5102/6102/6108",
      naturezaOperacaoId: 70, // OUTRA SAIDA (natureza que nao e receita)
    });
    expect(r.porNome).toBe(true);
    expect(r.porNatureza).toBe(false);
    expect(r.decisao).toBe(true); // <<< a trava: o nome manda
    expect(r.divergente).toBe(true);
  });

  // A NOTA COMPLEMENTAR (R$ 2.697,98): e receita e hoje escapa, porque "Nota fiscal
  // complementar de valor" nao tem a palavra "venda". A natureza pega. Mas ATE O DONO
  // MANDAR VIRAR A CHAVE, o numero exibido nao muda: a decisao continua sendo o nome.
  it("divergencia: SO a natureza diz venda -> prevalece o NOME (numero nao muda), mas registra", () => {
    const r = classificaReceita({
      ...notaBase,
      operacaoNome: "Nota fiscal complementar de valor 5102/6102/6108 - LP",
      naturezaOperacaoId: 31, // NOTA COMPLEMENTAR
    });
    expect(r.porNome).toBe(false);
    expect(r.porNatureza).toBe(true);
    expect(r.decisao).toBe(false); // <<< a trava: o nome manda, mesmo estando "errado"
    expect(r.divergente).toBe(true);
  });

  it("intragrupo derruba as DUAS regras (venda dentro de casa nao e receita)", () => {
    const r = classificaReceita({ ...notaBase, intragrupo: true });
    expect(r.porNome).toBe(false);
    expect(r.porNatureza).toBe(false);
    expect(r.decisao).toBe(false);
    expect(r.divergente).toBe(false);
  });

  it("nota cancelada / entrada / devolucao: nenhuma das duas conta", () => {
    expect(classificaReceita({ ...notaBase, situacaoNfe: "cancelada" }).porNatureza).toBe(false);
    expect(classificaReceita({ ...notaBase, entradaSaida: "0" }).porNatureza).toBe(false);
    expect(classificaReceita({ ...notaBase, finalidadeNfe: "4" }).porNatureza).toBe(false);
    expect(classificaReceita({ ...notaBase, modelo: "57" }).porNatureza).toBe(false);
  });

  describe("natureza DESCONHECIDA , o alerta que impede o proximo prejuizo silencioso", () => {
    it("natureza fora do catalogo, em nota de saida autorizada: marca para alerta", () => {
      const r = classificaReceita({ ...notaBase, naturezaOperacaoId: 999 });
      expect(r.naturezaDesconhecida).toBe(true);
      expect(r.porNatureza).toBe(false); // no escuro, a natureza NAO inventa receita
      expect(r.decisao).toBe(true); // e o nome segue mandando, entao nada se perde
    });

    it("nota SEM natureza nenhuma tambem e desconhecida", () => {
      const r = classificaReceita({ ...notaBase, naturezaOperacaoId: null });
      expect(r.naturezaDesconhecida).toBe(true);
      expect(r.decisao).toBe(true);
    });

    it("nota que nem candidata a receita e (entrada, cancelada) NAO polui o alerta", () => {
      // Senao o painel viraria um mar de ruido com nota de compra e CT-e.
      const r = classificaReceita({
        ...notaBase,
        entradaSaida: "0",
        naturezaOperacaoId: 999,
      });
      expect(r.naturezaDesconhecida).toBe(false);
    });

    it("nota INTRAGRUPO sem natureza NAO vira alerta (nunca seria receita)", () => {
      // Em producao sao 10 transferencias internas sem natureza, R$ 2,9 mi. Sem este filtro o
      // painel abriria com 10 alertas falsos, e alerta que nasce com ruido ninguem olha.
      const r = classificaReceita({ ...notaBase, intragrupo: true, naturezaOperacaoId: null });
      expect(r.naturezaDesconhecida).toBe(false);
    });

    it("natureza conhecida do lado NAO-receita nao gera alerta", () => {
      const r = classificaReceita({
        ...notaBase,
        operacaoNome: "Remessa de Mercadoria ou bem Para Demonstração 5912/6912 - Real",
        naturezaOperacaoId: 6,
      });
      expect(r.naturezaDesconhecida).toBe(false);
    });
  });
});
