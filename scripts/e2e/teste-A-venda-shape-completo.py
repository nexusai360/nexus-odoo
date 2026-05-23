"""
TESTE A: Criar pedido.documento tipo=venda copiando shape de PROD.
Ler tudo de volta na TESTE. Comparar com o doc fonte de PROD.
Verificar: numeração, etapa, computeds, totais, impostos.
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


# 1) pegar venda recente de prod
print("=" * 70)
print("TESTE A — Venda completa (copia de PROD → criação na TESTE)")
print("=" * 70)
src = prod("pedido.documento", "search_read",
            [[["tipo", "=", "venda"]], ["id", "display_name"]],
            {"limit": 1, "order": "id desc"})["result"][0]
print(f"\n[fonte PROD] id={src['id']} {src['display_name']}")
src_full = prod("pedido.documento", "read", [[src["id"]]])["result"][0]
print(f"  campos no rec: {len(src_full)}")

# 2) montar payload (47 editáveis típicos)
fdef = prod("pedido.documento", "fields_get", [],
             {"attributes": ["type", "readonly", "compute", "related"]})["result"]


def is_edit(name, info):
    if info.get("readonly"):
        return False
    if info.get("compute") and not info.get("inverse"):
        return False
    if info.get("related"):
        return False
    return True


vals = {}
for k, v in src_full.items():
    if k in ("id", "display_name", "create_date", "write_date",
              "create_uid", "write_uid", "__last_update", "name"):
        continue
    if v in (False, [], None, ""):
        continue
    info = fdef.get(k, {})
    if not is_edit(k, info):
        continue
    t = info.get("type")
    if t in ("char", "text", "integer", "float", "boolean", "date",
              "datetime", "selection", "monetary", "html"):
        vals[k] = v
    elif t == "many2one" and isinstance(v, list) and v:
        vals[k] = v[0]

print(f"[payload] {len(vals)} campos editáveis")

# 3) criar na TESTE
print("\n[create na TESTE]")
r = test("pedido.documento", "create", [vals])
if "error" in r:
    print(f"  FALHOU: {r['error']['data'].get('debug', '')[:600]}")
    raise SystemExit(1)
new_id = r["result"]
print(f"  ✅ id={new_id}")

# 4) ler tudo de volta
new_full = test("pedido.documento", "read", [[new_id]])["result"][0]
print(f"\n[leitura pós-create] {len(new_full)} campos no rec")

# 5) COMPARAR PROD ⟷ TESTE
print("\n" + "=" * 70)
print("COMPARAÇÃO: doc fonte (PROD) vs doc criado (TESTE)")
print("=" * 70)

# campos chave de identidade/workflow/totais
campos_chave = [
    # identificação
    "display_name", "name", "numero_documento", "data_documento",
    "data_emissao", "data_aprovacao", "data_contabil",
    # workflow
    "tipo", "operacao_id", "etapa_id", "state", "active",
    # totais
    "vr_total", "vr_total_produto", "vr_total_servico", "vr_operacao",
    "vr_desconto", "vr_frete", "vr_icms", "vr_ipi", "vr_pis", "vr_cofins",
    # contagens
    "quantidade_produto", "quantidade_servico",
    # vínculos
    "empresa_id", "participante_id", "operacao_produto_id",
    "configuracao_id", "carteira_id", "moeda_id",
]

print(f"\n{'campo':<28} {'fonte PROD':<40} {'criado TESTE':<40}")
print("-" * 110)
for c in campos_chave:
    pv = src_full.get(c, "<missing>")
    tv = new_full.get(c, "<missing>")
    pv_str = (json.dumps(pv, ensure_ascii=False) if pv is not False else "False")[:38]
    tv_str = (json.dumps(tv, ensure_ascii=False) if tv is not False else "False")[:38]
    marker = " " if pv_str == tv_str else "≠"
    print(f"{marker} {c:<26} {pv_str:<40} {tv_str:<40}")

# 6) Verificar diferenças nos COMPUTEDS
print("\n" + "-" * 70)
print("Campos com COMPUTE que ficaram preenchidos no TESTE:")
print("-" * 70)
comp_preenchidos = []
for k, info in fdef.items():
    if info.get("compute") and new_full.get(k) not in (False, [], None, "", 0, 0.0):
        comp_preenchidos.append(k)
print(f"  {len(comp_preenchidos)} computeds preenchidos / {sum(1 for _,i in fdef.items() if i.get('compute'))} total")

print("\n" + "-" * 70)
print("Campos com COMPUTE QUE NÃO FICARAM PREENCHIDOS no TESTE (vs PROD onde estão):")
print("-" * 70)
deltas = []
for k, info in fdef.items():
    if not info.get("compute"):
        continue
    pv = src_full.get(k)
    tv = new_full.get(k)
    if pv not in (False, [], None, "", 0, 0.0) and tv in (False, [], None, "", 0, 0.0):
        deltas.append((k, pv, info.get("type")))
print(f"  {len(deltas)} computeds populados em PROD mas vazios na TESTE")
for k, v, t in deltas[:30]:
    pv_str = (json.dumps(v, ensure_ascii=False))[:60]
    print(f"  {k:<40} ({t:<10}) PROD={pv_str}")
if len(deltas) > 30:
    print(f"  ... +{len(deltas)-30} mais")

# 7) Inspecionar one2many (linhas/itens) — comparar contagem
print("\n" + "-" * 70)
print("Relações one2many (itens, parcelas, etc.):")
print("-" * 70)
o2m_fields = [k for k, i in fdef.items() if i.get("type") == "one2many"]
print(f"  total o2m no modelo: {len(o2m_fields)}")
# pegar os com algum conteúdo em PROD
o2m_com_dados_em_prod = [(k, src_full.get(k, [])) for k in o2m_fields
                          if isinstance(src_full.get(k), list) and len(src_full.get(k, []))]
print(f"  o2m com dados no doc PROD fonte: {len(o2m_com_dados_em_prod)}")
for k, v in o2m_com_dados_em_prod[:15]:
    tv = new_full.get(k, [])
    rel = fdef[k].get("relation", "?")
    print(f"    {k:<40} (rel={rel:<35}) PROD={len(v):>3} TESTE={len(tv):>3}")

# 8) cleanup
print(f"\n[cleanup] unlink pedido.documento id={new_id}")
test("pedido.documento", "unlink", [[new_id]])
print("  cleanup OK")
