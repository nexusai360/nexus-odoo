"""
TESTE H: Criar pipeline + etapa com campos certos (em pt-br: 'nome', 'tipo').
Depois: descobrir onde estão os "cards" — qual modelo aponta para
crm.pipeline.etapa via many2one.
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
print("PARTE 1 — crm.pipeline: descobrir 'tipo' (selection) e criar")
print("=" * 76)

# fields_get com selection pra ver opções de 'tipo'
fdef = call("crm.pipeline", "fields_get", [],
             {"attributes": ["type", "required", "selection", "string"]})["result"]
print(f"\ntipos selection do crm.pipeline:")
for k, info in fdef.items():
    if info.get("type") == "selection" and info.get("selection"):
        print(f"  {k}: {info['selection']}")

# Criar pipeline com nome+tipo+ativo
tipo_options = fdef.get("tipo", {}).get("selection", [])
print(f"\nopções de tipo: {tipo_options}")
tipo_v = tipo_options[0][0] if tipo_options else "padrao"
vals = {"nome": "Pipeline E2E Nexus CRM", "tipo": tipo_v}
print(f"\n[criar pipeline] {vals}")
r = call("crm.pipeline", "create", [vals])
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('debug','')[-500:]}")
    sys.exit(1)
pid = r["result"]
print(f"  ✅ pipeline id={pid}")
snap = call("crm.pipeline", "read", [[pid]])["result"][0]
rel = {k: v for k, v in snap.items()
        if v not in (False, [], None, "") and not k.startswith("message_")
        and not k.startswith("mensagem_")}
print(f"  snapshot: {json.dumps(rel, ensure_ascii=False, indent=2)[:1500]}")

# Criar 3 etapas
print("\n[criar 3 etapas da pipeline]")
etapa_ids = []
for i, n in enumerate(["Novo", "Em negociação", "Ganho"], 1):
    r = call("crm.pipeline.etapa", "create",
              [{"nome": n, "pipeline_id": pid, "ordem": i}])
    if "error" in r:
        print(f"  ❌ etapa '{n}': {r['error']['data'].get('debug','')[-300:]}")
    else:
        etapa_ids.append(r["result"])
        print(f"  ✅ etapa '{n}' id={r['result']}")

# Ler etapas
print("\n[ler etapas criadas]")
etapas = call("crm.pipeline.etapa", "read",
               [etapa_ids, ["id", "nome", "ordem", "pipeline_id"]])["result"]
for e in etapas:
    print(f"  {e}")

print("\n" + "=" * 76)
print("PARTE 2 — Descobrir onde ficam os CARDS")
print("=" * 76)
print("\nProcurando todos os campos many2one que apontam pra crm.pipeline.etapa...")

# Listar todos os modelos e procurar campos m2o → crm.pipeline.etapa
all_models = call("ir.model", "search_read",
                   [[], ["model"]])["result"]
print(f"  {len(all_models)} modelos a varrer...")
m2o_destino = []
for m in all_models:
    name = m["model"]
    try:
        fs = call(name, "fields_get", [],
                   {"attributes": ["type", "relation"]})["result"]
        for fname, fi in fs.items():
            if fi.get("type") == "many2one" and fi.get("relation") == "crm.pipeline.etapa":
                m2o_destino.append((name, fname))
    except Exception:
        pass

print(f"\n[campos many2one apontando para crm.pipeline.etapa: {len(m2o_destino)}]")
for m, f in m2o_destino:
    print(f"  {m}.{f}")

print("\nProcurando also para crm.pipeline...")
m2o_pipeline = []
for m in all_models:
    name = m["model"]
    try:
        fs = call(name, "fields_get", [],
                   {"attributes": ["type", "relation"]})["result"]
        for fname, fi in fs.items():
            if fi.get("type") == "many2one" and fi.get("relation") == "crm.pipeline":
                m2o_pipeline.append((name, fname))
    except Exception:
        pass

print(f"\n[campos many2one apontando para crm.pipeline: {len(m2o_pipeline)}]")
for m, f in m2o_pipeline:
    print(f"  {m}.{f}")

# Cleanup pipeline + etapas
print(f"\n[cleanup] removendo {len(etapa_ids)} etapas + pipeline {pid}")
if etapa_ids:
    call("crm.pipeline.etapa", "unlink", [etapa_ids])
call("crm.pipeline", "unlink", [[pid]])
print("\n✅ TESTE H COMPLETO")
