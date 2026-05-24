"""Z.1 — Validar sintaxe Odoo many2many em category_id (com cleanup).

Cenarios:
  a) add 1 tag      : [(4, id1)]
  b) add 2 tags     : [(4, id1), (4, id2)]
  c) remove 1 tag   : [(3, id1)]
  d) replace all    : [(6, 0, [id3])]

Aborta com mensagem clara se algum cenario falhar. Cleanup garantido
via try/finally.
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


partner_id = None
tag_ids = []
try:
    # Criar 3 tags de teste
    print("[setup] criando 3 tags de teste...")
    for nome in ["Z1_TestA", "Z1_TestB", "Z1_TestC"]:
        r = call("res.partner.category", "create", [{"name": nome}])
        if "error" in r:
            print(f"  FALHOU criar tag {nome}: {r['error']['data'].get('debug','')[-200:]}")
            sys.exit(1)
        tag_ids.append(r["result"])
    print(f"  tag_ids: {tag_ids}")

    # Criar partner sem tags
    print("\n[setup] criando partner sem tags...")
    r = call("res.partner", "create",
              [{"name": "Z1 Test Partner", "is_company": True}])
    partner_id = r["result"]
    print(f"  partner_id={partner_id}")

    # ------- cenario A: add 1 tag -----------
    print("\n[A] add 1 tag (4, id)")
    r = call("res.partner", "write",
              [[partner_id], {"category_id": [(4, tag_ids[0])]}])
    print(f"  write result: {r.get('result')}")
    snap = call("res.partner", "read",
                 [[partner_id], ["category_id"]])["result"][0]
    print(f"  category_id atual: {snap['category_id']}")
    assert snap["category_id"] == [tag_ids[0]], f"A falhou: esperado {[tag_ids[0]]}, got {snap['category_id']}"
    print("  ✅ A passou")

    # ------- cenario B: add mais 1 tag (sintaxe lista de tuplas) -----------
    print("\n[B] add 1 tag adicional (4, id) — total = 2")
    r = call("res.partner", "write",
              [[partner_id], {"category_id": [(4, tag_ids[1])]}])
    snap = call("res.partner", "read",
                 [[partner_id], ["category_id"]])["result"][0]
    print(f"  category_id: {sorted(snap['category_id'])}")
    assert sorted(snap["category_id"]) == sorted([tag_ids[0], tag_ids[1]]), \
        f"B falhou: esperado {sorted([tag_ids[0],tag_ids[1]])}, got {sorted(snap['category_id'])}"
    print("  ✅ B passou")

    # ------- cenario C: remove 1 tag (3, id) -----------
    print("\n[C] remove 1 tag (3, id)")
    r = call("res.partner", "write",
              [[partner_id], {"category_id": [(3, tag_ids[0])]}])
    snap = call("res.partner", "read",
                 [[partner_id], ["category_id"]])["result"][0]
    print(f"  category_id: {snap['category_id']}")
    assert snap["category_id"] == [tag_ids[1]], \
        f"C falhou: esperado {[tag_ids[1]]}, got {snap['category_id']}"
    print("  ✅ C passou")

    # ------- cenario D: replace all (6, 0, [ids]) -----------
    print("\n[D] replace all com (6, 0, [tag_ids[2]])")
    r = call("res.partner", "write",
              [[partner_id], {"category_id": [(6, 0, [tag_ids[2]])]}])
    snap = call("res.partner", "read",
                 [[partner_id], ["category_id"]])["result"][0]
    print(f"  category_id: {snap['category_id']}")
    assert snap["category_id"] == [tag_ids[2]], \
        f"D falhou: esperado {[tag_ids[2]]}, got {snap['category_id']}"
    print("  ✅ D passou")

    # ------- bonus: add multiplas tuplas no mesmo write -----------
    print("\n[E] add multiplas tags numa unica chamada")
    r = call("res.partner", "write",
              [[partner_id],
               {"category_id": [(4, tag_ids[0]), (4, tag_ids[1])]}])
    snap = call("res.partner", "read",
                 [[partner_id], ["category_id"]])["result"][0]
    print(f"  category_id: {sorted(snap['category_id'])}")
    expected = sorted([tag_ids[0], tag_ids[1], tag_ids[2]])
    assert sorted(snap["category_id"]) == expected, \
        f"E falhou: esperado {expected}, got {sorted(snap['category_id'])}"
    print("  ✅ E passou (sintaxe lista de tuplas confirmada)")

    print("\n🎉 TODOS os cenarios passaram. Sintaxe Odoo m2m confirmada:")
    print("    add:     [(4, id1), (4, id2), ...]")
    print("    remove:  [(3, id)]")
    print("    replace: [(6, 0, [id1, id2, ...])]")

finally:
    # CLEANUP
    print("\n[cleanup]")
    if partner_id:
        try:
            call("res.partner", "unlink", [[partner_id]])
            print(f"  partner {partner_id} removido")
        except Exception as e:
            print(f"  erro unlink partner: {e}")
    for tid in tag_ids:
        try:
            call("res.partner.category", "unlink", [[tid]])
            print(f"  tag {tid} removida")
        except Exception as e:
            print(f"  erro unlink tag {tid}: {e}")
