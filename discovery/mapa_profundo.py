"""Etapa B do Discovery — mapeamento profundo dos modelos de camada2.json."""
import json
import os
import xmlrpc.client

from discovery.odoo_client import client_from_env, is_access_error
from discovery.classificacao import campos_temporais, veredito_aptidao_delta
from discovery.relatorios import render_mapa_profundo_md

OUTPUT_DIR = "discovery/output"
MODELOS_DIR = os.path.join(OUTPUT_DIR, "modelos")
CAMADA2 = "discovery/camada2.json"


def ler_lista_modelos() -> list:
    if not os.path.exists(CAMADA2):
        raise SystemExit(
            f"ERRO: {CAMADA2} não encontrado. Gere-o no checkpoint (Task 10)."
        )
    with open(CAMADA2, encoding="utf-8") as f:
        return json.load(f)["modelos"]


def mapear_modelo(client, model: str) -> dict:
    fields = client.execute_kw(model, "fields_get", [], {})
    temporais = campos_temporais(fields)

    campos = [
        {
            "nome": nome,
            "tipo": meta.get("type"),
            "rotulo": meta.get("string"),
            "relacao": meta.get("relation"),
            "obrigatorio": meta.get("required", False),
            "somente_leitura": meta.get("readonly", False),
        }
        for nome, meta in sorted(fields.items())
    ]

    # Exclui campos binary da amostra — evitam inflar o JSON com base64.
    campos_amostra = [n for n, meta in fields.items() if meta.get("type") != "binary"]
    amostra = client.execute_kw(
        model, "search_read", [[]],
        {"limit": 8, "order": "id desc", "fields": campos_amostra},
    )

    ordenacao_ok = False
    if temporais["write_date"]:
        try:
            client.execute_kw(
                model, "search", [[]], {"limit": 5, "order": "write_date desc"}
            )
            ordenacao_ok = True
        except Exception:
            ordenacao_ok = False

    veredito = veredito_aptidao_delta(temporais["write_date"], ordenacao_ok)

    return {
        "model": model,
        "campos": campos,
        "campos_temporais": temporais,
        "veredito_delta": veredito,
        "qtd_amostra": len(amostra),
        "amostra": amostra,
    }


def main():
    os.makedirs(MODELOS_DIR, exist_ok=True)
    client = client_from_env()
    client.connect()
    client.authenticate()

    lista = ler_lista_modelos()
    detalhados = []
    for model in lista:
        try:
            dados = mapear_modelo(client, model)
        except xmlrpc.client.Fault as exc:
            motivo = "sem-acesso" if is_access_error(exc) else "erro"
            print(f"  {model}: {motivo} — pulado")
            continue
        with open(os.path.join(MODELOS_DIR, f"{model}.json"), "w", encoding="utf-8") as f:
            json.dump(dados, f, indent=2, ensure_ascii=False, default=str)
        detalhados.append(dados)
        print(f"  {model}: {len(dados['campos'])} campos | delta {dados['veredito_delta']}")

    with open(os.path.join(OUTPUT_DIR, "mapa-profundo.md"), "w", encoding="utf-8") as f:
        f.write(render_mapa_profundo_md(detalhados))

    print(f"Mapa profundo: {len(detalhados)}/{len(lista)} modelos mapeados.")
    print(f"Saídas: {MODELOS_DIR}/*.json e {OUTPUT_DIR}/mapa-profundo.md")


if __name__ == "__main__":
    main()
