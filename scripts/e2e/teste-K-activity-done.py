"""Z.2 — Validar retorno de mail.activity.action_done + idempotencia.

Cenarios:
  1. Cria activity, chama action_done 1x, loga tipo do retorno.
  2. Chama action_done 2x no mesmo id (esperado: erro ou no-op).
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


activity_id = None
try:
    # Obter partner + ir.model id pra criar activity
    par = call("res.partner", "search_read",
                [[["is_company", "=", True]], ["id"]],
                {"limit": 1})["result"][0]
    res_model_id = call("ir.model", "search_read",
                         [[["model", "=", "res.partner"]], ["id"]],
                         {"limit": 1})["result"][0]["id"]
    tipo = call("mail.activity.type", "search_read",
                 [[], ["id"]], {"limit": 1})["result"][0]
    print(f"[setup] partner_id={par['id']} res_model_id={res_model_id} tipo={tipo['id']}")

    # Cria activity
    print("\n[setup] create activity")
    r = call("mail.activity", "create",
              [{"res_model_id": res_model_id,
                "res_id": par["id"],
                "summary": "Z2 test activity",
                "date_deadline": "2026-05-30",
                "user_id": UID,
                "activity_type_id": tipo["id"]}])
    if "error" in r:
        print(f"create FALHOU: {r['error']['data'].get('debug','')[-300:]}")
        sys.exit(1)
    activity_id = r["result"]
    print(f"  activity_id={activity_id}")

    # ------- Cenario 1: action_done 1x -----------
    print("\n[1] primeira chamada de action_done")
    r1 = call("mail.activity", "action_done", [[activity_id]])
    print(f"  raw response: {json.dumps(r1, ensure_ascii=False)}")
    if "error" in r1:
        print(f"  ❌ erro inesperado: {r1['error']['data'].get('debug','')[-300:]}")
    else:
        result = r1["result"]
        print(f"  tipo do retorno: {type(result).__name__}")
        print(f"  valor: {result}")

    # ------- Cenario 2: action_done 2x no mesmo id (ja done) -----------
    print("\n[2] segunda chamada de action_done no mesmo id (ja done)")
    r2 = call("mail.activity", "action_done", [[activity_id]])
    print(f"  raw response: {json.dumps(r2, ensure_ascii=False)}")
    if "error" in r2:
        name = r2["error"]["data"].get("name", "?")
        msg = r2["error"]["data"].get("message", "?")
        print(f"  ❌ erro: {name}: {msg[:200]}")
    else:
        result = r2["result"]
        print(f"  silent re-call OK. tipo: {type(result).__name__}, valor: {result}")

    # Confirma se a activity ainda existe no banco
    print("\n[check] activity ainda existe?")
    chk = call("mail.activity", "search", [[["id", "=", activity_id]]])
    print(f"  search result: {chk.get('result')}")
    if chk.get("result"):
        print(f"  ⚠️ activity AINDA EXISTE (action_done nao remove)")
    else:
        print(f"  activity foi REMOVIDA (action_done removeu)")
        activity_id = None  # nao precisa cleanup

finally:
    if activity_id:
        try:
            call("mail.activity", "unlink", [[activity_id]])
            print(f"\n[cleanup] activity {activity_id} removida")
        except Exception as e:
            print(f"\n[cleanup] erro: {e}")
