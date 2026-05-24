"""
TESTE B: Criar venda na TESTE COM itens (one2many [(0,0,{...})]).
Ver se totais, parcelas, lançamentos e display_name aparecem.
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
                [TEST_DB, TEST_UID := TEST_USER, TEST_PWD, {}])["result"] if False else rpc(TEST_URL, "common", "authenticate", [TEST_DB, TEST_USER, TEST_PWD, {}])["result"]


def prod(model, method, args, kwargs=None):
    return rpc(PROD_URL, "object", "execute_kw",
                [PROD_DB, PROD_UID, PROD_PWD, model, method, args], kwargs)


def test(model, method, args, kwargs=None):
    return rpc(TEST_URL, "object", "execute_kw",
                [TEST_DB, TEST_UID, TEST_PWD, model, method, args], kwargs)


print("=" * 70)
print("TESTE B — Venda COM itens (one2many no payload)")
print("=" * 70)

# 1) Pegar venda fonte de PROD com seus item_ids
src = prod("pedido.documento", "search_read",
            [[["tipo", "=", "venda"], ["item_ids", "!=", False]],
             ["id", "display_name", "item_ids"]],
            {"limit": 1, "order": "id desc"})["result"][0]
print(f"\n[fonte PROD] id={src['id']} {src['display_name']} com {len(src['item_ids'])} itens")

src_full = prod("pedido.documento", "read", [[src["id"]]])["result"][0]
item_ids = src_full["item_ids"]

# 2) Ler os itens (sped.documento.item)
print(f"\n[itens PROD] lendo {len(item_ids)} itens...")
items_full = prod("sped.documento.item", "read", [item_ids])["result"]
item_fdef = prod("sped.documento.item", "fields_get", [],
                  {"attributes": ["type", "readonly", "compute", "related", "required"]})["result"]


def is_edit(name, info):
    if info.get("readonly"):
        return False
    return True


def build_item_vals(item):
    vals = {}
    for k, v in item.items():
        if k in ("id", "display_name", "create_date", "write_date",
                  "create_uid", "write_uid", "__last_update", "name", "documento_id"):
            continue
        if v in (False, [], None, ""):
            continue
        info = item_fdef.get(k, {})
        if not is_edit(k, info):
            continue
        t = info.get("type")
        if t in ("char", "text", "integer", "float", "boolean", "date",
                  "datetime", "selection", "monetary", "html"):
            vals[k] = v
        elif t == "many2one" and isinstance(v, list) and v:
            vals[k] = v[0]
    return vals


itens_vals = [build_item_vals(it) for it in items_full]
print(f"  item[0] tem {len(itens_vals[0])} campos editáveis")
print(f"  amostra item[0] (10): {list(itens_vals[0].items())[:10]}")

# 3) Montar payload da venda
fdef = prod("pedido.documento", "fields_get", [],
             {"attributes": ["type", "readonly", "compute", "related"]})["result"]

vals = {}
for k, v in src_full.items():
    if k in ("id", "display_name", "create_date", "write_date",
              "create_uid", "write_uid", "__last_update", "name"):
        continue
    if v in (False, [], None, ""):
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

# Adicionar itens via sintaxe Odoo (0, 0, {vals})
vals["item_ids"] = [(0, 0, iv) for iv in itens_vals]
print(f"\n[payload final] {len(vals)} chaves; item_ids com {len(itens_vals)} itens")

# 4) Criar na TESTE
print("\n[create na TESTE]")
r = test("pedido.documento", "create", [vals])
if "error" in r:
    err = r["error"]["data"]
    print(f"  ❌ FALHOU: {err.get('name')}")
    debug = err.get("debug", "")
    # Pegar o pedaço útil do traceback
    print("  últimas linhas do debug:")
    for line in debug.split("\n")[-25:]:
        print(f"    {line}")
    raise SystemExit(1)
new_id = r["result"]
print(f"  ✅ id={new_id}")

# 5) Ler de volta
new_full = test("pedido.documento", "read", [[new_id]])["result"][0]

print(f"\n{'campo':<28} {'PROD':<35} {'TESTE':<35}")
print("-" * 100)
for c in ["display_name", "vr_operacao", "vr_total", "vr_icms", "vr_pis", "vr_cofins",
           "etapa_id", "item_ids", "parcela_ids", "finan_lancamento_ids",
           "sped_documento_ids"]:
    pv = src_full.get(c)
    tv = new_full.get(c)
    pv_str = json.dumps(pv, ensure_ascii=False) if pv is not False else "False"
    tv_str = json.dumps(tv, ensure_ascii=False) if tv is not False else "False"
    if len(pv_str) > 33: pv_str = pv_str[:30] + "..."
    if len(tv_str) > 33: tv_str = tv_str[:30] + "..."
    mark = " " if pv_str == tv_str else "≠"
    print(f"{mark} {c:<26} {pv_str:<35} {tv_str:<35}")

# Detalhe das contagens de one2many
print(f"\nitens criados: {len(new_full.get('item_ids', []))} (esperado: {len(item_ids)})")
print(f"parcelas geradas: {len(new_full.get('parcela_ids', []))}")
print(f"lançamentos financeiros: {len(new_full.get('finan_lancamento_ids', []))}")
print(f"docs SPED gerados: {len(new_full.get('sped_documento_ids', []))}")

# 6) cleanup
print(f"\n[cleanup] unlink pedido.documento id={new_id}")
test("pedido.documento", "unlink", [[new_id]])
print("  cleanup OK")
