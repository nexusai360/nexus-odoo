"""Etapa A do Discovery — inventário completo dos modelos do Odoo."""
import json
import os

from discovery.odoo_client import client_from_env, is_access_error, OdooRpcFault
from discovery.classificacao import classificar_tipo, area_de_negocio
from discovery.relatorios import render_censo_md

OUTPUT_DIR = "discovery/output"


def coletar(client) -> list:
    """Lê ir.model e, para cada modelo persistente, obtém a contagem."""
    # Não pedir o campo "modules": é computado e acessa ir.module.module,
    # que exige permissão de Administração. A classificação por área usa o
    # prefixo do nome técnico, não o módulo de origem.
    registros = client.execute_kw(
        "ir.model", "search_read", [[]],
        {"fields": ["model", "name", "transient"]},
    )
    modelos = []
    for r in registros:
        tipo = classificar_tipo(r)
        item = {
            "model": r["model"],
            "name": r["name"],
            "tipo": tipo,
            "area": area_de_negocio(r["model"]),
            "acesso": "ok",
            "registros": None,
        }
        if tipo == "persistente":
            try:
                item["registros"] = client.execute_kw(
                    r["model"], "search_count", [[]]
                )
            except OdooRpcFault as exc:
                item["acesso"] = "sem-acesso" if is_access_error(exc) else "contagem-falhou"
            except Exception:
                item["acesso"] = "contagem-falhou"
        modelos.append(item)
    return modelos


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    client = client_from_env()
    client.connect()
    client.authenticate()

    modelos = coletar(client)
    resumo = {
        "total": len(modelos),
        "sem_acesso": sum(1 for m in modelos if m["acesso"] == "sem-acesso"),
        "sem_contagem": sum(1 for m in modelos if m["acesso"] == "contagem-falhou"),
    }

    with open(os.path.join(OUTPUT_DIR, "censo.json"), "w", encoding="utf-8") as f:
        json.dump({"resumo": resumo, "modelos": modelos}, f, indent=2, ensure_ascii=False)
    with open(os.path.join(OUTPUT_DIR, "censo.md"), "w", encoding="utf-8") as f:
        f.write(render_censo_md(modelos, resumo))

    print(f"Censo: {resumo['total']} modelos | "
          f"{resumo['sem_acesso']} sem acesso | "
          f"{resumo['sem_contagem']} sem contagem")
    print(f"Saídas: {OUTPUT_DIR}/censo.json e censo.md")


if __name__ == "__main__":
    main()
