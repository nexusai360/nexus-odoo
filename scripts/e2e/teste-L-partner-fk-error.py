"""B.0 — Sondar mensagem de erro de FK em res.partner.unlink.

Itera partners com pedidos vinculados, tenta unlink, captura erro exato.
"""
import urllib.request, json, ssl, os, sys

TEST_URL = os.environ["ODOO_WRITE_URL"] + "/jsonrpc"
DB = os.environ["ODOO_WRITE_DB"]
USER = os.environ["ODOO_WRITE_USER"]
PWD = os.environ["ODOO_WRITE_PASSWORD"]


def rpc(service, method, args, kwargs=None):
    p = {"jsonrpc": "2.0", "method": "call",
         "params": {"service": service, "method": method, "args": args}, "id": 1}
    if kwargs:
        p["params"]["kwargs"] = kwargs
    req = urllib.request.Request(TEST_URL, data=json.dumps(p).encode(),
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60,
                                  context=ssl.create_default_context()) as r:
        return json.loads(r.read())


UID = rpc("common", "authenticate", [DB, USER, PWD, {}])["result"]


def call(model, method, args, kwargs=None):
    return rpc("object", "execute_kw", [DB, UID, PWD, model, method, args], kwargs)


# Procura partners com pedidos vinculados (provavel FK)
print("[search] partner com pedidos vinculados...")
# Pega participantes de pedidos
pedidos = call("pedido.documento", "search_read",
                [[], ["participante_id"]], {"limit": 30, "order": "id desc"})["result"]
participante_ids = list(set(p["participante_id"][0] for p in pedidos if p.get("participante_id")))[:5]
print(f"  participantes encontrados: {participante_ids}")

for pid in participante_ids:
    print(f"\n[try unlink partner id={pid}]")
    r = call("res.partner", "unlink", [[pid]])
    if "error" in r:
        err = r["error"]["data"]
        print(f"  name: {err.get('name')}")
        print(f"  message: {err.get('message','')[:300]}")
        print(f"  esse e o partner com FK ativo!")
        break
    else:
        print(f"  ⚠️ unlink passou (sem FK?) result={r.get('result')}")
print("\n[done]")
