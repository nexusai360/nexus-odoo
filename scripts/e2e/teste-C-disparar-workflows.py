"""
TESTE C: Criar venda com itens na TESTE e tentar disparar workflows
(numeração, totais, parcelas, lançamentos) chamando métodos custom.
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


# 1) Criar venda com itens (reusa lógica do teste B)
src = prod("pedido.documento", "search_read",
            [[["tipo", "=", "venda"], ["item_ids", "!=", False]],
             ["id", "display_name", "item_ids"]],
            {"limit": 1, "order": "id desc"})["result"][0]
src_full = prod("pedido.documento", "read", [[src["id"]]])["result"][0]
items_full = prod("sped.documento.item", "read", [src_full["item_ids"]])["result"]
item_fdef = prod("sped.documento.item", "fields_get", [],
                  {"attributes": ["type", "readonly"]})["result"]
fdef = prod("pedido.documento", "fields_get", [],
             {"attributes": ["type", "readonly"]})["result"]


def build_vals(rec, fields_def, skip_extra=None):
    skip = {"id", "display_name", "create_date", "write_date", "create_uid",
            "write_uid", "__last_update", "name"} | (skip_extra or set())
    vals = {}
    for k, v in rec.items():
        if k in skip or v in (False, [], None, ""):
            continue
        info = fields_def.get(k, {})
        if info.get("readonly"):
            continue
        t = info.get("type")
        if t in ("char", "text", "integer", "float", "boolean", "date",
                  "datetime", "selection", "monetary", "html"):
            vals[k] = v
        elif t == "many2one" and isinstance(v, list) and v:
            vals[k] = v[0]
    return vals


vals = build_vals(src_full, fdef)
vals["item_ids"] = [(0, 0, build_vals(it, item_fdef, {"documento_id"})) for it in items_full]

print("=" * 70)
print("TESTE C — criar venda e tentar disparar workflows")
print("=" * 70)

r = test("pedido.documento", "create", [vals])
if "error" in r:
    print(f"❌ create falhou: {r['error']['data'].get('debug', '')[:400]}")
    raise SystemExit(1)
new_id = r["result"]
print(f"\n✅ criado id={new_id}")

# 2) ESTADO INICIAL: ler campos chave
def snap():
    return test("pedido.documento", "read",
                 [[new_id], ["display_name", "vr_operacao", "vr_total",
                              "etapa_id", "state", "item_ids", "parcela_ids",
                              "finan_lancamento_ids", "sped_documento_ids"]])["result"][0]


print("\n[estado inicial pós-create]")
print(json.dumps(snap(), ensure_ascii=False, indent=2))

# 3) Tentar disparar métodos candidatos
metodos_candidatos = [
    # cálculos
    "compute_vr_operacao", "compute_totais", "action_calcular_totais",
    "atualiza_totais", "recalcular", "recalcular_totais", "_compute_vr_operacao",
    "_compute_totais", "compute_valores", "atualizar_valores",
    # numeração
    "gerar_numero", "gera_numero", "action_numerar", "_numerar",
    "atribui_numero", "numerar", "_compute_name",
    # workflow
    "action_confirm", "action_aprovar", "aprovar", "confirmar",
    "action_avanca_etapa", "avanca_etapa", "proxima_etapa",
    # geração de derivados
    "gerar_parcelas", "gerar_lancamentos", "gerar_sped_documento",
    "atualizar_parcelas", "_gerar_parcelas",
    # outros
    "onchange_operacao_id", "_onchange_operacao_id", "_compute_etapa_id",
]

print("\n[tentando disparar métodos]")
sucessos = []
for m in metodos_candidatos:
    try:
        r = test("pedido.documento", m, [[new_id]])
        if "error" in r:
            err_name = r["error"]["data"].get("name", "?")
            if "AttributeError" in err_name:
                continue  # método não existe, pula silencioso
            print(f"  {m}: {err_name[:60]}")
        else:
            sucessos.append(m)
            print(f"  ✅ {m}: {json.dumps(r.get('result'), ensure_ascii=False)[:200]}")
    except Exception as e:
        pass

print(f"\n[sucessos: {len(sucessos)}/{len(metodos_candidatos)}]")
for s in sucessos:
    print(f"  - {s}")

# 4) ESTADO PÓS-MÉTODOS
print("\n[estado pós-métodos]")
print(json.dumps(snap(), ensure_ascii=False, indent=2))

# 5) Verificar se há método write que dispare onchange
# Tentar mudar um campo (escrever no próprio doc) — `data_aprovacao` por ex
print("\n[teste: write em data_aprovacao força recompute?]")
test("pedido.documento", "write", [[new_id], {"data_aprovacao": "2026-05-23"}])
print(json.dumps(snap(), ensure_ascii=False, indent=2))

# 6) Tentar avançar etapa via wizard pedido.documento.avanca.etapa
print("\n[teste: criar wizard pedido.documento.avanca.etapa]")
try:
    # Pega a próxima etapa possível para a operação
    op_info = test("pedido.operacao", "read",
                    [[src_full["operacao_id"][0]],
                     ["id", "etapa_id"]])["result"][0]
    print(f"  operacao etapa_id: {op_info.get('etapa_id')}")
    wiz = test("pedido.documento.avanca.etapa", "create",
                [{"documento_id": new_id}])
    if "error" in wiz:
        print(f"  ❌ wizard create: {wiz['error']['data'].get('name')}")
    else:
        print(f"  ✅ wizard id={wiz['result']}")
except Exception as e:
    print(f"  EXC: {e}")

# 7) cleanup
print(f"\n[cleanup] unlink {new_id}")
test("pedido.documento", "unlink", [[new_id]])
print("  OK")
