"""
TESTE F2: Inventário detalhado dos 110 campos do res.partner da Tauga,
identificação dos campos relevantes (CNPJ, IE, IM, WhatsApp, observações,
endereço completo), e criação E2E de cliente + fornecedor com tudo preenchido.
"""
import urllib.request, json, ssl, os, sys, time
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


def call(model, method, args, kwargs=None):
    return rpc(TEST_URL, "object", "execute_kw",
                [TEST_DB, UID, TEST_PWD, model, method, args], kwargs)


# 1) Inventário detalhado dos 110 campos
fdef = call("res.partner", "fields_get", [],
             {"attributes": ["type", "readonly", "required", "string",
                              "relation", "selection"]})["result"]

# Categorizar por palavra-chave que mapeia ao que o usuário precisa
INTERESSES = {
    "identidade":  ["name", "company_name", "company_registry", "vat",
                     "cnpj", "cpf", "ie", "im", "inscricao", "rg", "documento",
                     "company_type", "is_company"],
    "contato":     ["email", "phone", "mobile", "whatsapp", "fax", "website",
                     "function", "lang", "tz"],
    "endereco":    ["street", "street2", "city", "city_id", "state_id",
                     "country_id", "zip", "address"],
    "comercial":   ["customer", "supplier", "rank", "credit", "debit",
                     "balance", "property_payment_term", "property_product_pricelist"],
    "categorizacao": ["category_id", "industry_id", "title", "tag", "type",
                       "color", "cor", "ribbon"],
    "observacao":  ["comment", "obs", "nota", "anotacao", "note", "remark",
                     "comentario", "descricao"],
    "relacionamento": ["parent_id", "child_ids", "user_id", "team_id"],
}

print("=" * 76)
print(f"INVENTÁRIO de res.partner — {len(fdef)} campos totais")
print("=" * 76)

# Listar campos editáveis (não-readonly) organizados por categoria
for cat, kws in INTERESSES.items():
    achados = []
    for k, info in fdef.items():
        if info.get("readonly"):
            continue
        lower = k.lower()
        if any(kw in lower for kw in kws):
            achados.append((k, info))
    if achados:
        print(f"\n[{cat.upper()}] ({len(achados)} campos editáveis)")
        for k, info in sorted(achados):
            req = "*" if info.get("required") else " "
            rel = info.get("relation") or ""
            sval = info.get("selection")
            extra = f"[{rel}]" if rel else (f"({len(sval)} opções)" if sval else "")
            print(f"  {req} {k:<35} {info['type']:<12} {extra:<24} "
                  f"{(info.get('string') or '')[:40]}")

# Listar TODOS os editáveis para revisão completa
print("\n" + "=" * 76)
print(f"TODOS os {len([k for k, i in fdef.items() if not i.get('readonly')])} campos editáveis:")
print("=" * 76)
for k in sorted(k for k, i in fdef.items() if not i.get("readonly")):
    info = fdef[k]
    req = "*" if info.get("required") else " "
    rel = info.get("relation") or ""
    print(f"  {req} {k:<38} {info['type']:<12} {(info.get('string') or '')[:50]}")

# 2) CRIAR cliente + fornecedor completos
print("\n" + "=" * 76)
print("CRIAÇÃO E2E: cliente PJ completo")
print("=" * 76)

country = call("res.country", "search_read",
                [[["code", "=", "BR"]], ["id"]], {"limit": 1})["result"][0]
state = call("res.country.state", "search_read",
              [[["country_id", "=", country["id"]], ["code", "=", "SP"]],
               ["id"]], {"limit": 1})["result"][0]
inds = call("res.partner.industry", "search_read", [[], ["id"]], {"limit": 1})["result"]
titles = call("res.partner.title", "search_read", [[], ["id"]], {"limit": 1})["result"]

ext = f"e2e-{int(time.time())}"
vals_cliente = {
    "name": f"Cliente PJ E2E {ext}",
    "company_type": "company",
    "is_company": True,
    "customer": True,   # boolean — não rank
    "supplier": False,
    "active": True,
    "email": "cliente@nexus.test",
    "phone": "(11) 4002-8922",
    "mobile": "(11) 99999-8888",
    "website": "https://nexus.test",
    "function": "Comprador",
    "street": "Rua das Academias, 100",
    "street2": "Sala 42",
    "city": "São Paulo",
    "zip": "01310-100",
    "country_id": country["id"],
    "state_id": state["id"],
    "lang": "pt_BR",
    "tz": "America/Sao_Paulo",
    "comment": "<p>Cliente criado via API JSON-RPC oficial pelo Nexus.</p>",
    "ref": ext,
    "company_registry": "12.345.678/0001-99",  # CNPJ vai aqui se existir
}
if inds:
    vals_cliente["industry_id"] = inds[0]["id"]
if titles:
    vals_cliente["title"] = titles[0]["id"]

# Filtrar só campos que existem no schema (para não estourar)
vals_cliente_valid = {k: v for k, v in vals_cliente.items() if k in fdef}
print(f"\n[payload] {len(vals_cliente_valid)} campos válidos "
       f"(descartados: {sorted(set(vals_cliente) - set(vals_cliente_valid))})")

r = call("res.partner", "create", [vals_cliente_valid])
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('debug', '')[-400:]}")
    sys.exit(1)
pid = r["result"]
print(f"  ✅ id={pid}")

# Ler de volta os campos relevantes
campos_ler = ["name", "display_name", "company_type", "is_company", "customer",
               "supplier", "active", "email", "phone", "mobile", "website",
               "function", "street", "street2", "city", "city_id", "state_id",
               "country_id", "zip", "lang", "tz", "comment", "ref",
               "company_registry", "industry_id", "title", "category_id"]
snap = call("res.partner", "read", [[pid], campos_ler])["result"][0]
print(f"\n[snapshot]")
print(json.dumps(snap, ensure_ascii=False, indent=2))

# 3) Atualizar — virar tb fornecedor
print(f"\n[update] virar fornecedor + adicionar observação")
r = call("res.partner", "write",
          [[pid], {"supplier": True, "comment": "<p>Agora também fornecedor.</p>"}])
print(f"  result: {r.get('result')}")

# 4) Inativar
print("\n[transition] inativar (active=False)")
r = call("res.partner", "write", [[pid], {"active": False}])
print(f"  result: {r.get('result')}")
# Reativar
call("res.partner", "write", [[pid], {"active": True}])

# 5) Cleanup
print(f"\n[unlink id={pid}]")
print(f"  result: {call('res.partner', 'unlink', [[pid]]).get('result')}")
print("\n✅ TESTE F2 COMPLETO")
