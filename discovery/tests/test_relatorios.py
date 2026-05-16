from discovery.relatorios import render_censo_md, render_mapa_profundo_md


def test_render_censo_md_tem_resumo_e_areas():
    modelos = [
        {"model": "pedido.documento", "name": "Pedido", "area": "Vendas/Compras",
         "tipo": "persistente", "acesso": "ok", "registros": 1200},
        {"model": "estoque.saldo.hoje", "name": "Saldo", "area": "Estoque",
         "tipo": "persistente", "acesso": "ok", "registros": 340},
        {"model": "x.wiz", "name": "Wizard", "area": "Outros",
         "tipo": "transient", "acesso": "ok", "registros": None},
    ]
    resumo = {"total": 3, "sem_acesso": 0, "sem_contagem": 0}
    md = render_censo_md(modelos, resumo)
    assert "# Censo" in md
    assert "Total de modelos: 3" in md
    assert "## Vendas/Compras" in md
    assert "## Estoque" in md
    assert "pedido.documento" in md


def test_render_mapa_profundo_md_lista_modelos_e_veredito():
    modelos = [
        {"model": "pedido.documento",
         "campos": [{"nome": "numero", "tipo": "char", "relacao": None}],
         "veredito_delta": "apto",
         "qtd_amostra": 8},
    ]
    md = render_mapa_profundo_md(modelos)
    assert "# Mapa Profundo" in md
    assert "pedido.documento" in md
    assert "apto" in md
    assert "numero" in md
