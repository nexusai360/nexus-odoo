from discovery.classificacao import (
    classificar_tipo, area_de_negocio, campos_temporais, veredito_aptidao_delta,
)


def test_classificar_tipo_transient():
    assert classificar_tipo({"transient": True}) == "transient"


def test_classificar_tipo_persistente():
    assert classificar_tipo({"transient": False}) == "persistente"


def test_area_de_negocio_por_prefixo():
    assert area_de_negocio("pedido.documento") == "Vendas/Compras"
    assert area_de_negocio("sped.documento") == "Fiscal"
    assert area_de_negocio("estoque.saldo.hoje") == "Estoque"
    assert area_de_negocio("finan.lancamento") == "Financeiro"
    assert area_de_negocio("hr.employee") == "RH"


def test_area_de_negocio_desconhecida():
    assert area_de_negocio("xpto.coisa") == "Outros"


def test_campos_temporais_identifica_create_e_write():
    fields = {
        "create_date": {"type": "datetime"},
        "write_date": {"type": "datetime"},
        "data_orcamento": {"type": "date"},
        "numero": {"type": "char"},
    }
    resultado = campos_temporais(fields)
    assert resultado["create_date"] is True
    assert resultado["write_date"] is True
    assert "data_orcamento" in resultado["campos_de_data"]
    assert "numero" not in resultado["campos_de_data"]


def test_veredito_apto():
    assert veredito_aptidao_delta(tem_write_date=True, ordenacao_ok=True) == "apto"


def test_veredito_verificar():
    assert veredito_aptidao_delta(tem_write_date=False, ordenacao_ok=True) == "verificar"
    assert veredito_aptidao_delta(tem_write_date=True, ordenacao_ok=False) == "verificar"
