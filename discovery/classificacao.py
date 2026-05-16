"""Funções puras de classificação de modelos e campos do Odoo."""

# Prefixo do nome técnico do modelo -> área de negócio.
# Ajustável após o censo revelar os prefixos reais da instância Tauga.
_AREAS = {
    "pedido": "Vendas/Compras",
    "sale": "Vendas/Compras",
    "purchase": "Vendas/Compras",
    "sped": "Fiscal",
    "l10n_br": "Fiscal",
    "estoque": "Estoque",
    "stock": "Estoque",
    "finan": "Financeiro",
    "account": "Financeiro",
    "hr": "RH",
    "crm": "Comercial",
    "res": "Cadastros",
}


def classificar_tipo(modelo_meta: dict) -> str:
    """'transient' (wizard) ou 'persistente', a partir do registro de ir.model."""
    return "transient" if modelo_meta.get("transient") else "persistente"


def area_de_negocio(model_name: str) -> str:
    """Mapeia o prefixo do nome técnico para uma área de negócio."""
    prefixo = model_name.split(".")[0]
    return _AREAS.get(prefixo, "Outros")


def campos_temporais(fields: dict) -> dict:
    """Identifica campos temporais no retorno de fields_get().
    Retorna create_date/write_date (bool) e a lista de campos date/datetime."""
    campos_de_data = [
        nome for nome, meta in fields.items()
        if meta.get("type") in ("date", "datetime")
    ]
    return {
        "create_date": "create_date" in fields,
        "write_date": "write_date" in fields,
        "campos_de_data": campos_de_data,
    }


def veredito_aptidao_delta(tem_write_date: bool, ordenacao_ok: bool) -> str:
    """'apto' se o modelo tem write_date e a ordenação por ele é coerente;
    'verificar' caso contrário."""
    return "apto" if (tem_write_date and ordenacao_ok) else "verificar"
