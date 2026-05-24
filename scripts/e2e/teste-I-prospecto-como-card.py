"""
TESTE I: Validar se pedido.documento tipo=prospecto pode ser usado como
"card de CRM" — criar, atualizar (mover etapa), deletar.

Antes precisa: operação tipo=prospecto com etapa_id preenchido.
Se a operação 202 está sem etapa_id, vamos ver se conseguimos criar uma
operação nova OU vincular uma etapa existente.
"""
import urllib.request, json, ssl, os, sys

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


print("=" * 76)
print("PARTE 1 — Inspecionar pedido.etapa: que etapas existem?")
print("=" * 76)
total = call("pedido.etapa", "search_count", [[]])["result"]
print(f"total pedido.etapa: {total}")
# Listar primeiras 20
etapas = call("pedido.etapa", "search_read",
               [[], ["id", "name", "operacao_id", "ordem"]], {"limit": 25, "order": "id"})["result"]
print("\nprimeiras etapas:")
for e in etapas:
    print(f"  id={e['id']:<4} ordem={e.get('ordem',''):<3} op={e.get('operacao_id', '-')} {e.get('name')}")

# Etapas associadas à operação 202 (prospecto)
print("\netapas com operacao_id=202 (prospecto_teste):")
e_prosp = call("pedido.etapa", "search_read",
                [[["operacao_id", "=", 202]], ["id", "name", "ordem"]])["result"]
print(f"  {len(e_prosp)} etapas: {e_prosp}")

# Procurar qualquer etapa com 'prospect' no nome
e_qq = call("pedido.etapa", "search_read",
              [[["name", "ilike", "prosp"]],
               ["id", "name", "operacao_id", "ordem"]])["result"]
print(f"\netapas com 'prosp' no nome: {len(e_qq)}")
for e in e_qq:
    print(f"  {e}")

print("\n" + "=" * 76)
print("PARTE 2 — Tentar atribuir uma etapa à operação 202 (workaround)")
print("=" * 76)
# Se há etapas livres, vincular uma à operação 202.
# Vamos buscar 1 etapa que tem operacao_id false E ordem 1 (provavelmente entrada)
e_livre = call("pedido.etapa", "search_read",
                [[["operacao_id", "=", False]], ["id", "name", "ordem"]],
                {"limit": 5})["result"]
print(f"etapas livres (sem operacao): {len(e_livre)}")
for e in e_livre[:5]:
    print(f"  {e}")

print("\n" + "=" * 76)
print("PARTE 3 — Tentar criar uma operacao NOVA tipo=prospecto com etapa válida")
print("=" * 76)
opfdef = call("pedido.operacao", "fields_get", [],
               {"attributes": ["type", "required"]})["result"]
print(f"obrigatórios da pedido.operacao: "
       f"{[k for k,i in opfdef.items() if i.get('required') and k!='id']}")

# Pegar etapa existente
e_qq2 = call("pedido.etapa", "search_read",
              [[], ["id", "name"]], {"limit": 1})["result"][0]
print(f"\nusando etapa existente como inicial: {e_qq2}")

vals_op = {
    "name": "Prospecto E2E Nexus",
    "tipo": "prospecto",
    "etapa_id": e_qq2["id"],
}
print(f"\n[criar operacao] {vals_op}")
r = call("pedido.operacao", "create", [vals_op])
op_id = None
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('debug','')[-600:]}")
else:
    op_id = r["result"]
    print(f"  ✅ operacao id={op_id}")

print("\n" + "=" * 76)
print("PARTE 4 — Criar pedido.documento tipo=prospecto usando a nova operacao")
print("=" * 76)
if op_id:
    # Empresa e partner
    emp = call("res.company", "search_read", [[], ["id"]], {"limit": 1})["result"][0]
    par = call("res.partner", "search_read",
                [[["is_company", "=", True]], ["id"]], {"limit": 1})["result"][0]
    vals = {
        "tipo": "prospecto",
        "operacao_id": op_id,
        "empresa_id": emp["id"],
        "participante_id": par["id"],
    }
    print(f"\n[create pedido.documento] payload: {vals}")
    r = call("pedido.documento", "create", [vals])
    if "error" in r:
        print(f"  ❌ {r['error']['data'].get('name')}")
        print(f"  debug: {r['error']['data'].get('debug','')[-500:]}")
    else:
        pid = r["result"]
        print(f"  ✅ pedido.documento id={pid}")
        snap = call("pedido.documento", "read",
                     [[pid], ["display_name", "tipo", "etapa_id", "state", "operacao_id"]])
        print(f"  snapshot: {snap['result'][0]}")

        # Mover etapa (update) — buscar outra etapa
        outras = call("pedido.etapa", "search_read",
                       [[], ["id", "name"]], {"limit": 5, "offset": 1})["result"]
        if outras:
            nova = outras[0]
            print(f"\n[mover para etapa id={nova['id']} '{nova['name']}']")
            r = call("pedido.documento", "write",
                      [[pid], {"etapa_id": nova["id"]}])
            print(f"  result: {r.get('result')}")
            snap2 = call("pedido.documento", "read",
                          [[pid], ["etapa_id"]])
            print(f"  etapa pós-update: {snap2['result'][0]}")

        # cleanup
        call("pedido.documento", "unlink", [[pid]])
        print(f"  [cleanup] doc removido")

    # cleanup operacao
    call("pedido.operacao", "unlink", [[op_id]])
    print(f"  [cleanup] operacao removida")

print("\n✅ TESTE I COMPLETO")
