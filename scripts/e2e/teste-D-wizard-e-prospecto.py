"""
TESTE D: 1) Usar wizard pedido.documento.avanca.etapa direito.
         2) Tentar criar PROSPECTO (mais simples, sem fiscal/SPED).
"""
import urllib.request, json, ssl, os

PROD_URL = "https://grupojht.tauga.online/jsonrpc"
TEST_URL = os.environ["ODOO_WRITE_URL"] + "/jsonrpc"
PROD_DB, PROD_USER, PROD_PWD = "grupojht", "joaozanini", "@Nexusodoo1"
TEST_DB, TEST_USER, TEST_PWD = (os.environ["ODOO_WRITE_DB"],
                                  os.environ["ODOO_WRITE_USER"],
                                  os.environ["ODOO_WRITE_PASSWORD"])


def rpc(url, service, method, args, kwargs=None):
    p = {"jsonrpc": "2.0", "method": "call",
         "params": {"service": service, "method": method, "args": args}, "id": 1}
    if kwargs:
        p["params"]["kwargs"] = kwargs
    req = urllib.request.Request(url, data=json.dumps(p).encode(),
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180, context=ssl.create_default_context()) as r:
        return json.loads(r.read())


PROD_UID = rpc(PROD_URL, "common", "authenticate",
                [PROD_DB, PROD_USER, PROD_PWD, {}])["result"]
TEST_UID = rpc(TEST_URL, "common", "authenticate",
                [TEST_DB, TEST_USER, TEST_PWD, {}])["result"]


def prod(model, method, args, kwargs=None):
    return rpc(PROD_URL, "object", "execute_kw",
                [PROD_DB, PROD_UID, PROD_PWD, model, method, args], kwargs)


def test(model, method, args, kwargs=None):
    return rpc(TEST_URL, "object", "execute_kw",
                [TEST_DB, TEST_UID, TEST_PWD, model, method, args], kwargs)


def edit_vals(rec, fdef, skip_extra=None):
    skip = {"id", "display_name", "create_date", "write_date", "create_uid",
            "write_uid", "__last_update", "name"} | (skip_extra or set())
    vals = {}
    for k, v in rec.items():
        if k in skip or v in (False, [], None, ""):
            continue
        info = fdef.get(k, {})
        if info.get("readonly"):
            continue
        t = info.get("type")
        if t in ("char", "text", "integer", "float", "boolean", "date",
                  "datetime", "selection", "monetary", "html"):
            vals[k] = v
        elif t == "many2one" and isinstance(v, list) and v:
            vals[k] = v[0]
    return vals


# ============================================================
# PARTE 1: Tentar criar PROSPECTO (tipo mais simples)
# ============================================================
print("=" * 70)
print("PARTE 1 — Criar PROSPECTO (sem itens fiscais)")
print("=" * 70)

# Existe prospecto em PROD?
psrc = prod("pedido.documento", "search_read",
             [[["tipo", "=", "prospecto"]],
              ["id", "display_name", "item_ids", "operacao_id"]],
             {"limit": 1, "order": "id desc"})["result"]
if not psrc:
    print("  ❌ não há prospecto em PROD para copiar shape")
    # tentar criar prospecto minimal direto, usando operacao 202 (prospecto_teste)
    op = test("pedido.operacao", "search_read",
                [[["tipo", "=", "prospecto"]],
                 ["id", "display_name", "etapa_id"]])["result"][0]
    print(f"  usando operação {op['id']} {op['display_name']}")
    par = test("res.partner", "search_read",
                [[["is_company", "=", True]], ["id", "name"]], {"limit": 1})["result"][0]
    emp = test("res.company", "search_read",
                [[], ["id", "name"]], {"limit": 1})["result"][0]
    minimal = {
        "tipo": "prospecto",
        "operacao_id": op["id"],
        "empresa_id": emp["id"],
        "participante_id": par["id"],
    }
    print(f"  payload minimal: {minimal}")
    r = test("pedido.documento", "create", [minimal])
    if "error" in r:
        print(f"  ❌ FALHOU: {r['error']['data'].get('debug', '')[:600]}")
    else:
        new_id = r["result"]
        print(f"  ✅ criado id={new_id}")
        snap = test("pedido.documento", "read",
                     [[new_id], ["display_name", "tipo", "operacao_id", "etapa_id"]])
        print(f"  snapshot: {snap['result'][0]}")
        test("pedido.documento", "unlink", [[new_id]])
        print(f"  cleanup OK")
else:
    src = psrc[0]
    print(f"  fonte: id={src['id']} {src['display_name']} {len(src['item_ids'])} itens")
    src_full = prod("pedido.documento", "read", [[src["id"]]])["result"][0]
    fdef = prod("pedido.documento", "fields_get", [],
                 {"attributes": ["type", "readonly"]})["result"]
    vals = edit_vals(src_full, fdef)
    if src_full.get("item_ids"):
        items = prod("sped.documento.item", "read", [src_full["item_ids"]])["result"]
        ifdef = prod("sped.documento.item", "fields_get", [],
                      {"attributes": ["type", "readonly"]})["result"]
        vals["item_ids"] = [(0, 0, edit_vals(it, ifdef, {"documento_id"}))
                             for it in items]
    print(f"  payload: {len(vals)} campos")
    r = test("pedido.documento", "create", [vals])
    if "error" in r:
        print(f"  ❌ {r['error']['data'].get('name')}: {r['error']['data'].get('debug', '')[:400]}")
    else:
        new_id = r["result"]
        snap = test("pedido.documento", "read",
                     [[new_id], ["display_name", "tipo", "etapa_id",
                                  "operacao_id", "item_ids", "vr_operacao"]])
        print(f"  ✅ criado: {snap['result'][0]}")
        test("pedido.documento", "unlink", [[new_id]])

# ============================================================
# PARTE 2: Investigar o wizard pedido.documento.avanca.etapa
# ============================================================
print("\n" + "=" * 70)
print("PARTE 2 — Investigar wizard avanca.etapa")
print("=" * 70)

# Campos do wizard
wfd = test("pedido.documento.avanca.etapa", "fields_get", [],
            {"attributes": ["type", "required", "readonly", "string"]})["result"]
print(f"\n[campos do wizard] ({len(wfd)} total):")
for k, info in sorted(wfd.items()):
    if k.startswith("_") or k in ("id", "display_name", "create_date", "write_date",
                                    "create_uid", "write_uid", "__last_update"):
        continue
    req = "*" if info.get("required") else " "
    ro = "(ro)" if info.get("readonly") else "    "
    print(f"  {req}{ro} {k:<35} {info.get('type'):<12} {info.get('string', '')[:50]}")

# Tentar criar um doc, criar o wizard e ver itens dele
print("\n[criar venda + wizard]")
src = prod("pedido.documento", "search_read",
            [[["tipo", "=", "venda"], ["item_ids", "!=", False]],
             ["id", "item_ids"]], {"limit": 1, "order": "id desc"})["result"][0]
src_full = prod("pedido.documento", "read", [[src["id"]]])["result"][0]
items = prod("sped.documento.item", "read", [src_full["item_ids"]])["result"]
fdef = prod("pedido.documento", "fields_get", [],
             {"attributes": ["type", "readonly"]})["result"]
ifdef = prod("sped.documento.item", "fields_get", [],
              {"attributes": ["type", "readonly"]})["result"]
vals = edit_vals(src_full, fdef)
vals["item_ids"] = [(0, 0, edit_vals(it, ifdef, {"documento_id"})) for it in items]
doc_id = test("pedido.documento", "create", [vals])["result"]
print(f"  doc id={doc_id}")

# Criar wizard
wiz_id = test("pedido.documento.avanca.etapa", "create",
               [{"documento_id": doc_id}])["result"]
print(f"  wizard id={wiz_id}")

# Ler o wizard pra ver o que ele preenche automaticamente
wsnap = test("pedido.documento.avanca.etapa", "read", [[wiz_id]])["result"][0]
print(f"  wizard snapshot (chaves não-falsy):")
for k, v in sorted(wsnap.items()):
    if v not in (False, [], None, "", 0):
        sval = json.dumps(v, ensure_ascii=False)
        if len(sval) > 80: sval = sval[:77] + "..."
        print(f"    {k:<35} = {sval}")

# Tentar disparar o avanço — buttons comuns
print("\n[tentar buttons do wizard]")
for btn in ["button_avanca", "button_avanca_etapa", "action_avanca",
             "action_avanca_etapa", "action_confirmar", "button_confirmar",
             "avancar", "confirma", "action_confirm"]:
    r = test("pedido.documento.avanca.etapa", btn, [[wiz_id]])
    if "error" in r:
        name = r["error"]["data"].get("name", "?")
        if "AttributeError" not in name:
            print(f"  {btn}: {name[:60]}")
    else:
        print(f"  ✅ {btn}: {json.dumps(r.get('result'), ensure_ascii=False)[:200]}")

# Snapshot do doc pós-tentativas
post = test("pedido.documento", "read",
             [[doc_id], ["display_name", "vr_operacao", "etapa_id",
                          "parcela_ids", "finan_lancamento_ids"]])["result"][0]
print(f"\n[doc pós-wizard]")
print(json.dumps(post, ensure_ascii=False, indent=2))

# cleanup
test("pedido.documento.avanca.etapa", "unlink", [[wiz_id]])
test("pedido.documento", "unlink", [[doc_id]])
print("\n[cleanup] OK")
