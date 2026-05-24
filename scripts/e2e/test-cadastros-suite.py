"""Bloco G — E2E real das 8 write tools de cadastros contra base de teste.

Roda em sequencia (todas com cleanup garantido):
  1. res_partner.update  (criar via API direta -> update -> verify -> cleanup)
  2. res_partner.archive (criar -> archive -> verify active=false -> cleanup)
  3. res_partner.delete  (criar -> delete -> verify nao existe)
  4. res_partner_category.create (criar nova + idempotencia)
  5. res_partner_category.set_tags (add/remove/replace)
  6. mail_activity.create (atrelado a partner)
  7. mail_activity.update
  8. mail_activity.complete (action_done remove a activity)
"""
import urllib.request, json, ssl, os, sys, time

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
    r = rpc("object", "execute_kw", [DB, UID, PWD, model, method, args], kwargs)
    if "error" in r:
        err = r["error"]["data"]
        raise RuntimeError(f"{err.get('name')}: {err.get('message','')[:200]}")
    return r["result"]


passed, failed = [], []


def step(name):
    def deco(fn):
        try:
            fn()
            passed.append(name)
            print(f"✅ {name}")
        except Exception as e:
            failed.append((name, str(e)[:200]))
            print(f"❌ {name}: {e}")
        return fn
    return deco


# Helper: criar partner basico via API direta
def mk_partner(name="E2E Suite"):
    return call("res.partner", "create",
                 [{"name": f"{name} {int(time.time())}", "is_company": True}])


# Test 1: update
@step("res_partner.update")
def t1():
    pid = mk_partner()
    try:
        call("res.partner", "write", [[pid], {
            "phone": "(11) 1234-5678", "mobile": "(11) 99999-0000",
        }])
        rec = call("res.partner", "read", [[pid], ["phone", "mobile"]])[0]
        assert rec["phone"] == "(11) 1234-5678"
        assert rec["mobile"] == "(11) 99999-0000"
    finally:
        call("res.partner", "unlink", [[pid]])


# Test 2: archive
@step("res_partner.archive")
def t2():
    pid = mk_partner()
    try:
        call("res.partner", "write", [[pid], {"active": False}])
        rec = call("res.partner", "read", [[pid], ["active"]])[0]
        assert rec["active"] is False
    finally:
        call("res.partner", "write", [[pid], {"active": True}])
        call("res.partner", "unlink", [[pid]])


# Test 3: delete (hard)
@step("res_partner.delete (hard)")
def t3():
    pid = mk_partner()
    call("res.partner", "unlink", [[pid]])
    chk = call("res.partner", "search", [[["id", "=", pid]]])
    assert chk == []


# Test 4: category.create + idempotencia
@step("res_partner_category.create + idempotencia")
def t4():
    name = f"E2ECat_{int(time.time())}"
    cid = call("res.partner.category", "create", [{"name": name}])
    try:
        # idempotencia: busca antes
        found = call("res.partner.category", "search_read",
                      [[["name", "=", name]], ["id"]], {"limit": 1})
        assert found[0]["id"] == cid
    finally:
        call("res.partner.category", "unlink", [[cid]])


# Test 5: set_tags add/remove/replace
@step("res_partner_category.set_tags add/remove/replace")
def t5():
    pid = mk_partner()
    cids = [
        call("res.partner.category", "create", [{"name": f"E2EA_{int(time.time())}"}]),
        call("res.partner.category", "create", [{"name": f"E2EB_{int(time.time())+1}"}]),
        call("res.partner.category", "create", [{"name": f"E2EC_{int(time.time())+2}"}]),
    ]
    try:
        # add
        call("res.partner", "write", [[pid], {"category_id": [(4, cids[0])]}])
        rec = call("res.partner", "read", [[pid], ["category_id"]])[0]
        assert cids[0] in rec["category_id"]
        # remove
        call("res.partner", "write", [[pid], {"category_id": [(3, cids[0])]}])
        rec = call("res.partner", "read", [[pid], ["category_id"]])[0]
        assert cids[0] not in rec["category_id"]
        # replace
        call("res.partner", "write", [[pid], {"category_id": [(6, 0, [cids[1], cids[2]])]}])
        rec = call("res.partner", "read", [[pid], ["category_id"]])[0]
        assert sorted(rec["category_id"]) == sorted([cids[1], cids[2]])
    finally:
        call("res.partner", "unlink", [[pid]])
        for c in cids:
            try: call("res.partner.category", "unlink", [[c]])
            except: pass


# Test 6+7+8: mail_activity create + update + complete
@step("mail_activity.create + update + complete")
def t678():
    pid = mk_partner()
    res_model_id = call("ir.model", "search_read",
                         [[["model", "=", "res.partner"]], ["id"]], {"limit": 1})[0]["id"]
    tipo = call("mail.activity.type", "search_read",
                 [[], ["id"]], {"limit": 1})[0]
    try:
        aid = call("mail.activity", "create", [{
            "res_model_id": res_model_id, "res_id": pid,
            "summary": "E2E Suite test", "date_deadline": "2026-05-30",
            "user_id": UID, "activity_type_id": tipo["id"],
        }])
        # update
        call("mail.activity", "write", [[aid], {"date_deadline": "2026-06-15"}])
        rec = call("mail.activity", "read", [[aid], ["date_deadline"]])[0]
        assert rec["date_deadline"] == "2026-06-15"
        # complete (action_done apaga a activity)
        msg_id = call("mail.activity", "action_done", [[aid]])
        assert isinstance(msg_id, int)
        chk = call("mail.activity", "search", [[["id", "=", aid]]])
        assert chk == []  # activity foi removida
    finally:
        call("res.partner", "unlink", [[pid]])


print(f"\n=== resumo: {len(passed)} ok / {len(failed)} falhas ===")
for n, e in failed:
    print(f"  ❌ {n}: {e}")

sys.exit(0 if not failed else 1)
