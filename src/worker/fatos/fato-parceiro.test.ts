// fato_parceiro vem de `sped.participante` , a entidade que TODO documento do Odoo referencia
// pelo campo `participante_id`. Antes vinha de `res.partner`, e o join pegava PESSOA DIFERENTE
// (as duas tabelas tem numeracao independente). Ver o cabecalho de fato-parceiro.ts.
import { mapParceiroRow, rebuildFatoParceiro } from "./fato-parceiro";
import type { PrismaClient } from "@/generated/prisma/client";

/** Linha real de raw_sped_participante (campos que o builder usa). */
const PARTICIPANTE: Record<string, unknown> = {
  id: 445,
  nome: "Academia Esporte e Saude Ltda",
  razao_social: "Academia Esporte e Saude Ltda",
  cnpj_cpf: "26.304.554/0001-76",
  estado: "SE",
  cidade: "Aracaju",
  municipio_id: [295, "Aracaju - SE"],
  cep: "49025-090",
  email: false,
  fone: false,
  eh_cliente: true,
  eh_fornecedor: true,
  eh_empresa: false,
  partner_id: [452, "Academia Esporte e Saude Ltda"],
  create_date: "2026-02-10 12:00:00",
};

describe("mapParceiroRow", () => {
  it("usa o id do PARTICIPANTE (a chave que os documentos guardam), não a do res.partner", () => {
    const r = mapParceiroRow(PARTICIPANTE);
    expect(r.odooId).toBe(445);
    // O vinculo com o contato do Odoo fica materializado, mas NAO e a chave.
    expect(r.partnerId).toBe(452);
  });

  it("mapeia nome, razão social, documento e dígitos", () => {
    const r = mapParceiroRow(PARTICIPANTE);
    expect(r.nome).toBe("Academia Esporte e Saude Ltda");
    expect(r.nomeCompleto).toBe("Academia Esporte e Saude Ltda");
    expect(r.documento).toBe("26.304.554/0001-76");
    expect(r.documentoDigits).toBe("26304554000176");
  });

  it("papéis vêm dos campos do participante fiscal (eh_cliente/eh_fornecedor/eh_empresa)", () => {
    const r = mapParceiroRow(PARTICIPANTE);
    expect(r.ehCliente).toBe(true);
    expect(r.ehFornecedor).toBe(true);
    expect(r.ehEmpresa).toBe(false);
  });

  it("UF vem da sigla do campo `estado`", () => {
    expect(mapParceiroRow(PARTICIPANTE).uf).toBe("SE");
    expect(mapParceiroRow(PARTICIPANTE).cidade).toBe("Aracaju");
  });

  it("sem `estado`, extrai a UF do rótulo do município (era o que virava 'Sem UF' na tela)", () => {
    const r = mapParceiroRow({ ...PARTICIPANTE, estado: false, cidade: false });
    expect(r.uf).toBe("SE");
    expect(r.cidade).toBe("Aracaju");
  });

  it("sem estado E sem município, a UF fica null (não inventa)", () => {
    const r = mapParceiroRow({ ...PARTICIPANTE, estado: false, municipio_id: false, cidade: false });
    expect(r.uf).toBeNull();
    expect(r.cidade).toBeNull();
  });

  it("o `false` do Odoo (JSON-RPC) vira null, não a string 'false'", () => {
    const r = mapParceiroRow({ ...PARTICIPANTE, email: false, fone: false, cep: false });
    expect(r.email).toBeNull();
    expect(r.telefone).toBeNull();
    expect(r.cep).toBeNull();
  });

  it("telefone: `fone` com fallback para `fone_comercial`", () => {
    expect(mapParceiroRow({ ...PARTICIPANTE, fone: "79999990000" }).telefone).toBe("79999990000");
    expect(
      mapParceiroRow({ ...PARTICIPANTE, fone: false, fone_comercial: "7933330000" }).telefone,
    ).toBe("7933330000");
  });

  it("documentoDigits = null quando não há CNPJ/CPF", () => {
    expect(mapParceiroRow({ ...PARTICIPANTE, cnpj_cpf: false }).documentoDigits).toBeNull();
    expect(mapParceiroRow({ ...PARTICIPANTE, cnpj_cpf: false }).documento).toBeNull();
  });

  it("NÃO produz atualizadoEm (campo tem @default(now()) no schema)", () => {
    expect(mapParceiroRow(PARTICIPANTE)).not.toHaveProperty("atualizadoEm");
  });

  it("data de criação vira Date; ausente vira null", () => {
    expect(mapParceiroRow(PARTICIPANTE).dataCriacao).toEqual(new Date("2026-02-10 12:00:00"));
    expect(mapParceiroRow({ ...PARTICIPANTE, create_date: false }).dataCriacao).toBeNull();
  });
});

describe("rebuildFatoParceiro", () => {
  it("reconstrói a partir de rawSpedParticipante (NÃO de rawResPartner), numa transação", async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue({});
    const tx = {
      fatoParceiro: { deleteMany, createMany },
      fatoBuildState: { upsert },
    };
    const findMany = jest.fn().mockResolvedValue([{ data: PARTICIPANTE }]);
    const prisma = {
      rawSpedParticipante: { findMany },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaClient;

    const n = await rebuildFatoParceiro(prisma);

    expect(n).toBe(1);
    expect(findMany).toHaveBeenCalledWith({ where: { rawDeleted: false } });
    expect(deleteMany).toHaveBeenCalled();
    const linhas = createMany.mock.calls[0][0].data as { odooId: number; uf: string }[];
    expect(linhas[0].odooId).toBe(445);
    expect(linhas[0].uf).toBe("SE");
  });
});
