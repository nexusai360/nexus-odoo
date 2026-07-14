import { SQL_REBUILD_PEDIDO_ITEM } from "./fato-pedido-item";

/**
 * O builder e SQL cru dentro de uma transacao. Um mock de prisma executaria a
 * transacao sem executar o SQL, entao a assertiva tem que ser sobre o proprio texto
 * da query. E o que importa aqui e uma clausula so.
 */
describe("SQL_REBUILD_PEDIDO_ITEM", () => {
  const sql = SQL_REBUILD_PEDIDO_ITEM;

  it("ignora os itens que o Odoo ja removeu", () => {
    // Sem isso, o fato ingeria 1.007 itens mortos (a reconciliacao os marca como
    // removidos, mas o builder lia o raw inteiro), inflando o valor dos pedidos em
    // R$ 2,65 mi e contaminando o valor a atender, o estoque disponivel e a
    // necessidade de compra.
    expect(sql).toContain("i.raw_deleted = false");
  });

  it("le apenas linhas que sao item de pedido", () => {
    expect(sql).toContain("(i.data->'pedido_id'->>0) ~ '^[0-9]+$'");
  });

  it("ignora item sem quantidade", () => {
    expect(sql).toContain("COALESCE((i.data->>'quantidade')::numeric, 0) > 0");
  });

  it("preenche o fato a partir do raw de itens de documento", () => {
    expect(sql).toContain("INSERT INTO fato_pedido_item");
    expect(sql).toContain("FROM raw_sped_documento_item i");
  });

  it("nao interpola nada (roda por executeRawUnsafe, precisa ser estatico)", () => {
    // Se alguem introduzir interpolacao aqui, o SQL vira alvo de injecao.
    expect(sql).not.toMatch(/\$\{/);
  });
});

describe("colunas de atendimento", () => {
  const sql = SQL_REBUILD_PEDIDO_ITEM;

  it("traz o quanto falta entregar e o quanto ja foi entregue", () => {
    expect(sql).toContain("quantidade_a_atender");
    expect(sql).toContain("(i.data->>'quantidade_a_atender_pedido')::numeric");
    expect(sql).toContain("(i.data->>'quantidade_atendida_pedido')::numeric");
  });

  it("NAO usa coalesce nas colunas de atendimento", () => {
    // Zero significaria "nada a entregar" e faria todo pedido valer R$ 0,00 na tela
    // ate o job de atendimento rodar pela primeira vez. Nulo significa "ainda nao sei",
    // e a consulta cai no valor cheio com aviso.
    expect(sql).not.toMatch(
      /COALESCE\(\(i\.data->>'quantidade_a_atender_pedido'\)/i,
    );
    expect(sql).not.toMatch(
      /COALESCE\(\(i\.data->>'quantidade_atendida_pedido'\)/i,
    );
  });
});
