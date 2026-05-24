"""
TESTE F: Investiga res.partner do Odoo da Tauga em profundidade.

Objetivo: descobrir TODOS os campos editáveis (inclusive customs Tauga
tipo WhatsApp, observações, CNPJ/CPF), criar parceiro com tudo preenchido,
atualizar, inativar (transition), deletar. Tudo via API JSON-RPC oficial.

Roda apenas contra TESTE (ODOO_WRITE_*). Limpa o que criar.
"""
import urllib.request, json, ssl, os, sys
from collections import defaultdict

TEST_URL = os.environ["ODOO_WRITE_URL"] + "/jsonrpc"
TEST_DB = os.environ["ODOO_WRITE_DB"]
TEST_USER = os.environ["ODOO_WRITE_USER"]
TEST_PWD = os.environ["ODOO_WRITE_PASSWORD"]


def rpc(url, service, method, args, kwargs=None):
    p = {"jsonrpc": "2.0", "method": "call",
         "params": {"service": service, "method": method, "args": args}, "id": 1}
    if kwargs:
        p["params"]["kwargs"] = kwargs
    req = urllib.request.Request(url, data=json.dumps(p).encode(),
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120, context=ssl.create_default_context()) as r:
        return json.loads(r.read())


UID = rpc(TEST_URL, "common", "authenticate",
           [TEST_DB, TEST_USER, TEST_PWD, {}])["result"]
print(f"TEST uid={UID}")


def call(model, method, args, kwargs=None):
    return rpc(TEST_URL, "object", "execute_kw",
                [TEST_DB, UID, TEST_PWD, model, method, args], kwargs)


print("\n" + "=" * 72)
print("PARTE 1 — Inventário completo dos campos de res.partner na Tauga")
print("=" * 72)

fdef = call("res.partner", "fields_get", [],
             {"attributes": ["type", "readonly", "required", "string",
                              "relation", "compute", "related", "selection"]})["result"]
print(f"total de campos definidos: {len(fdef)}")

# Classificar
por_tipo = defaultdict(list)
editaveis = []
custom = []  # não-padrão, provavelmente da Tauga
campos_chave_crm = []

PADRAO_RES_PARTNER = {
    "name", "display_name", "is_company", "email", "phone", "mobile", "street",
    "street2", "city", "city_id", "state_id", "country_id", "zip",
    "vat", "ref", "lang", "tz", "user_id", "team_id", "category_id",
    "industry_id", "title", "function", "website", "comment", "active",
    "customer_rank", "supplier_rank", "company_id", "company_type",
    "parent_id", "child_ids", "type", "credit", "debit", "balance",
    "create_date", "write_date", "create_uid", "write_uid", "__last_update",
    "id", "image_128", "image_256", "image_512", "image_1024", "image_1920",
    "color", "bank_ids", "barcode", "currency_id", "property_payment_term_id",
    "property_supplier_payment_term_id", "property_account_position_id",
    "property_product_pricelist", "property_account_receivable_id",
    "property_account_payable_id", "property_purchase_currency_id",
    "property_stock_customer", "property_stock_supplier", "message_*",
    "activity_*", "ribbon_*", "kanban_*",
}


def is_padrao(name):
    if name in PADRAO_RES_PARTNER:
        return True
    for p in PADRAO_RES_PARTNER:
        if p.endswith("_*") and name.startswith(p[:-1]):
            return True
    return False


for k, info in fdef.items():
    por_tipo[info["type"]].append(k)
    if not info.get("readonly"):
        editaveis.append(k)
    if not is_padrao(k):
        custom.append((k, info))
    # CRM-friendly: nome bate em padrões de interesse
    lower = k.lower()
    if any(kw in lower for kw in ["whatsapp", "obs", "comment", "category",
                                    "tag", "industry", "title", "lead",
                                    "stage", "pipeline", "rank", "vendor",
                                    "supplier", "customer", "nota", "anot"]):
        campos_chave_crm.append((k, info))

print(f"\npor tipo: {dict((t, len(v)) for t, v in por_tipo.items())}")
print(f"editáveis: {len(editaveis)} / {len(fdef)}")
print(f"customs (não-padrão Odoo): {len(custom)}")
print(f"\ncampos CUSTOM (provavelmente Tauga) — primeiros 40:")
for k, info in custom[:40]:
    ro = "(ro)" if info.get("readonly") else "    "
    req = "*" if info.get("required") else " "
    print(f"  {req}{ro} {k:<38} {info['type']:<12} {(info.get('string') or '')[:50]}")

print(f"\ncampos CRM-friendly (por palavra-chave) — {len(campos_chave_crm)}:")
for k, info in campos_chave_crm:
    ro = "(ro)" if info.get("readonly") else "    "
    print(f"  {ro} {k:<35} {info['type']:<12} {(info.get('string') or '')[:50]}")

print("\n" + "=" * 72)
print("PARTE 2 — CRIAR um parceiro com TUDO preenchido + atualizar + inativar")
print("=" * 72)

# Pegar referências reais da base de teste
country = call("res.country", "search_read",
                [[["code", "=", "BR"]], ["id", "name"]], {"limit": 1})["result"][0]
state = call("res.country.state", "search_read",
              [[["country_id", "=", country["id"]], ["code", "=", "SP"]],
               ["id", "name"]], {"limit": 1})["result"][0]
# res.partner.category (tags)
cats = call("res.partner.category", "search_read",
             [[], ["id", "name"]], {"limit": 3})["result"]
# res.partner.industry
inds = call("res.partner.industry", "search_read",
             [[], ["id", "name"]], {"limit": 3})["result"]
# res.partner.title
titles = call("res.partner.title", "search_read",
               [[], ["id", "name"]], {"limit": 3})["result"]

print(f"  country: {country}")
print(f"  state: {state}")
print(f"  categorias disponíveis: {cats}")
print(f"  setores: {inds}")
print(f"  títulos: {titles}")

# Construir payload "tudo preenchido"
import time
externo = f"e2e-tudo-{int(time.time())}"
vals = {
    # padrão Odoo
    "name": f"Cliente E2E Completo {externo}",
    "is_company": True,
    "company_type": "company",
    "active": True,
    "customer_rank": 1,
    "supplier_rank": 0,
    "email": "cliente@nexus.test",
    "phone": "(11) 4002-8922",
    "mobile": "(11) 99999-8888",
    "street": "Rua das Academias, 100",
    "street2": "Sala 42",
    "city": "São Paulo",
    "zip": "01310-100",
    "country_id": country["id"],
    "state_id": state["id"],
    "ref": externo,
    "lang": "pt_BR",
    "tz": "America/Sao_Paulo",
    "comment": "<p>Cliente criado via API JSON-RPC oficial pelo Nexus.</p>",
    "website": "https://nexus.test",
    "function": "Comprador",
}
# Categorias (m2m): sintaxe [(6, 0, [ids])]
if cats:
    vals["category_id"] = [(6, 0, [cats[0]["id"]])]
if inds:
    vals["industry_id"] = inds[0]["id"]
if titles:
    vals["title"] = titles[0]["id"]

# Tentar campos customs Tauga descobertos
# Campos comuns no l10n_br: cnpj_cpf, inscricao_estadual, etc.
campos_custom_tentativa = {
    "cnpj_cpf": "12.345.678/0001-99",
    "inscricao_estadual": "ISENTO",
    "inscricao_municipal": "12345",
    "whatsapp": "(11) 99999-8888",
}
# Filtrar só os que existem no schema
for k, v in campos_custom_tentativa.items():
    if k in fdef:
        vals[k] = v
        print(f"  [custom] include {k}={v}")

print(f"\n[payload] {len(vals)} campos")
print("\n[create]")
r = call("res.partner", "create", [vals])
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('debug', '')[-500:]}")
    sys.exit(1)
pid = r["result"]
print(f"  ✅ id={pid}")

snap = call("res.partner", "read",
             [[pid], ["id", "name", "display_name", "is_company", "company_type",
                       "email", "phone", "mobile", "street", "city", "zip",
                       "country_id", "state_id", "active", "customer_rank",
                       "supplier_rank", "category_id", "industry_id", "title",
                       "comment", "website", "function", "lang", "tz", "ref"]])
print(f"\n[snapshot pós-create]")
print(json.dumps(snap["result"][0], ensure_ascii=False, indent=2))

# Atualizar
print("\n[update: virar fornecedor + atualizar telefone]")
r = call("res.partner", "write",
          [[pid], {"supplier_rank": 1, "phone": "(11) 5555-5555",
                    "comment": "<p>Atualizado.</p>"}])
print(f"  result: {r.get('result')}")
snap2 = call("res.partner", "read",
              [[pid], ["customer_rank", "supplier_rank", "phone", "comment"]])
print(f"  pós-update: {snap2['result'][0]}")

# Inativar (transition)
print("\n[transition: active=False (inativar)]")
r = call("res.partner", "write", [[pid], {"active": False}])
print(f"  result: {r.get('result')}")
snap3 = call("res.partner", "read", [[pid], ["active"]])
print(f"  active: {snap3['result'][0]}")

# Reativar
call("res.partner", "write", [[pid], {"active": True}])

# Delete
print(f"\n[unlink id={pid}]")
r = call("res.partner", "unlink", [[pid]])
print(f"  unlink: {r.get('result')}")
print("\n✅ TESTE F COMPLETO")
