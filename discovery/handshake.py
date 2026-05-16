"""Etapa 0 do Discovery — versão do Odoo, protocolos disponíveis, auth."""
import json
import os

from discovery.odoo_client import client_from_env, OdooError

OUTPUT_DIR = "discovery/output"


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    client = client_from_env()
    client.connect()

    versao = client.version()
    uid = client.authenticate()
    json2 = client.probe_json2()

    # Confirma leitura no modelo meta necessário para o censo.
    try:
        client.execute_kw("ir.model", "search_count", [[]])
        ir_model_ok = True
    except OdooError:
        ir_model_ok = False

    # server_version_info é uma lista [major, minor, ...] — extrair o major
    # como int é mais robusto que comparar server_serie como string.
    version_info = versao.get("server_version_info") or []
    odoo_major = version_info[0] if version_info else 0
    resultado = {
        "server_version": versao.get("server_version"),
        "server_serie": versao.get("server_serie"),
        "server_version_info": version_info,
        "odoo_major": odoo_major,
        "protocol_version": versao.get("protocol_version"),
        "uid": uid,
        "xmlrpc": True,
        "json2_endpoint_responde": json2,
        "json2_por_versao": odoo_major >= 19,
        "ir_model_legivel": ir_model_ok,
    }

    caminho = os.path.join(OUTPUT_DIR, "handshake.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(resultado, f, indent=2, ensure_ascii=False)

    print(f"Odoo {resultado['server_version']} (série {resultado['server_serie']}) — uid {uid}")
    print(f"JSON/2 endpoint responde: {json2} | ir.model legível: {ir_model_ok}")
    print(f"Saída: {caminho}")

    if not ir_model_ok:
        raise SystemExit(
            "ERRO: o usuário não tem leitura em ir.model — o censo não pode rodar. "
            "Solicitar permissão à Tauga."
        )


if __name__ == "__main__":
    main()
