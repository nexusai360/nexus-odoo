# Fixtures de chave forte (B0) , 1 registro real por entidade (cache nexus_odoo_l1, 2026-06-06)

> Ancora os mocks dos testes unitarios e os E2E do Bloco G no dado real.

- **Armazem** (`raw_estoque_local.data` JSON): odoo_id=1, nome_unico="proprio", nome_completo="Próprio", tipo="S". (nome_unico lowercase sem espaco; nome_completo com acento.)
- **Produto** (`fato_produto`): odoo_id=1, nome="AS4102 - BARRA W OLÍMPICA 122CM", codigo_unico="964", codigo="964".
- **Nota Fiscal** (`fato_nota_fiscal`): odoo_id=43214, serie="4", modelo="55", chave=44 digitos ("412603040287...").
- **Conta Contabil** (`fato_conta_contabil`): odoo_id=4 codigo="1" nome="ATIVO"; odoo_id=5 codigo="1.1" nome="ATIVO CIRCULANTE"; odoo_id=6 codigo="1.1.1" nome="DISPONIBILIDADES". (codigo hierarquico com pontos.)
- **Pedido** (`fato_pedido`): odoo_id=45 numero="DV-0001/26" tipo="devolucao_venda"; odoo_id=103 numero="TRANSF-0014/26" tipo="transferencia_solicitacao". (numero casa `^[A-Z]+-\d+/\d{2}$`.)
- **Natureza Operacao** (`fato_referencia` tabela='natureza_operacao'): codigo="001" descricao="VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS"; "002" devolucao; "003" devolucao transferencia. (codigo string com zeros a esquerda.)
- **Centro Resultado**: desnormalizado em fato_financeiro_lancamento_item (centro_resultado_id, centro_resultado_nome).
- **Conta Referencial SPED**: fato_contabil_conta_referencial (odoo_id, codigo, nome, nome_completo).
- **Parceiro** (Bloco C-bis): fato_parceiro com documento no formato "BR-<digitos>".
