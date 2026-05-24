"""
TESTE G: Investigar CRM (pipelines/cards/etapas) + tarefas/atividades.

Modelos a inspecionar e tentar criar:
- crm.pipeline (custom Tauga)
- crm.pipeline.etapa (custom Tauga)
- mail.activity (padrão Odoo — "tarefas")
- mail.activity.type (tipos de atividade)
- chamado.* (helpdesk custom?)

Pra cada um: campos, amostras de prod, tentar create/update/transition na TESTE.
"""
import urllib.request, json, ssl, os, sys

TEST_URL = os.environ["ODOO_WRITE_URL"] + "/jsonrpc"
PROD_URL = "https://grupojht.tauga.online/jsonrpc"
TEST_DB = os.environ["ODOO_WRITE_DB"]
TEST_USER = os.environ["ODOO_WRITE_USER"]
TEST_PWD = os.environ["ODOO_WRITE_PASSWORD"]
PROD_DB = "grupojht"
PROD_USER = "joaozanini"
PROD_PWD = "@Nexusodoo1"


def rpc(url, service, method, args, kwargs=None):
    p = {"jsonrpc": "2.0", "method": "call",
         "params": {"service": service, "method": method, "args": args}, "id": 1}
    if kwargs:
        p["params"]["kwargs"] = kwargs
    req = urllib.request.Request(url, data=json.dumps(p).encode(),
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120, context=ssl.create_default_context()) as r:
        return json.loads(r.read())


UID_T = rpc(TEST_URL, "common", "authenticate",
             [TEST_DB, TEST_USER, TEST_PWD, {}])["result"]
UID_P = rpc(PROD_URL, "common", "authenticate",
             [PROD_DB, PROD_USER, PROD_PWD, {}])["result"]


def test(model, method, args, kwargs=None):
    return rpc(TEST_URL, "object", "execute_kw",
                [TEST_DB, UID_T, TEST_PWD, model, method, args], kwargs)


def prod(model, method, args, kwargs=None):
    return rpc(PROD_URL, "object", "execute_kw",
                [PROD_DB, UID_P, PROD_PWD, model, method, args], kwargs)


print("=" * 76)
print("PARTE 1 — crm.pipeline + crm.pipeline.etapa")
print("=" * 76)

for model in ["crm.pipeline", "crm.pipeline.etapa"]:
    print(f"\n--- {model} ---")
    # contagem em PROD vs TESTE
    p_cnt = prod(model, "search_count", [[]]).get("result", "ERR")
    t_cnt = test(model, "search_count", [[]]).get("result", "ERR")
    print(f"  contagem PROD={p_cnt} TESTE={t_cnt}")
    # campos
    fdef = test(model, "fields_get", [],
                 {"attributes": ["type", "readonly", "required",
                                  "string", "relation"]})["result"]
    print(f"  total campos: {len(fdef)}")
    edits = [k for k, i in fdef.items() if not i.get("readonly")]
    print(f"  editáveis: {len(edits)}")
    # required
    req = [k for k, i in fdef.items() if i.get("required")]
    print(f"  obrigatórios: {req}")
    # listar editáveis com tipo
    print(f"  campos editáveis:")
    for k in sorted(edits):
        info = fdef[k]
        r = "*" if info.get("required") else " "
        rel = info.get("relation") or ""
        print(f"    {r} {k:<30} {info['type']:<12} [{rel}]")

    # se tem amostras em PROD, ler 1 pra ter shape
    if isinstance(p_cnt, int) and p_cnt > 0:
        ids = prod(model, "search", [[]], {"limit": 1, "order": "id desc"})["result"]
        amostra = prod(model, "read", [ids])["result"][0]
        print(f"  amostra PROD (campos não-falsy): "
              f"{sorted(k for k,v in amostra.items() if v not in (False,[],None,''))}")

print("\n" + "=" * 76)
print("PARTE 2 — Tentativa de criar crm.pipeline + crm.pipeline.etapa na TESTE")
print("=" * 76)

# Criar pipeline
print("\n[criar crm.pipeline]")
fdef = test("crm.pipeline", "fields_get", [],
             {"attributes": ["type", "required"]})["result"]
req = [k for k, i in fdef.items() if i.get("required") and k != "id"]
print(f"  campos obrigatórios: {req}")
# Tentar com nome
vals = {"name": "Pipeline E2E Nexus"}
# preencher os obrigatórios com defaults razoáveis se houver
r = test("crm.pipeline", "create", [vals])
pipeline_id = None
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('debug','')[-400:]}")
else:
    pipeline_id = r["result"]
    print(f"  ✅ id={pipeline_id}")
    snap = test("crm.pipeline", "read", [[pipeline_id]])["result"][0]
    print(f"  snapshot relevante: {{k:v for k,v in snap.items() if v not in (False,[],None,'')}}")

# Criar etapa
if pipeline_id:
    print("\n[criar crm.pipeline.etapa]")
    fdef = test("crm.pipeline.etapa", "fields_get", [],
                 {"attributes": ["type", "required", "relation"]})["result"]
    req = [k for k, i in fdef.items() if i.get("required") and k != "id"]
    print(f"  campos obrigatórios: {req}")
    vals = {"name": "Etapa Inicial E2E"}
    if "pipeline_id" in fdef:
        vals["pipeline_id"] = pipeline_id
    r = test("crm.pipeline.etapa", "create", [vals])
    if "error" in r:
        print(f"  ❌ {r['error']['data'].get('debug','')[-400:]}")
    else:
        etapa_id = r["result"]
        print(f"  ✅ etapa id={etapa_id}")

    # cleanup
    if pipeline_id:
        test("crm.pipeline", "unlink", [[pipeline_id]])
        print(f"  [cleanup] pipeline {pipeline_id} removida")

print("\n" + "=" * 76)
print("PARTE 3 — mail.activity (TAREFAS) na TESTE")
print("=" * 76)

# Tipos de atividade existentes
tipos = test("mail.activity.type", "search_read",
              [[], ["id", "name", "category", "delay_count", "delay_unit"]])["result"]
print(f"\n[tipos de atividade disponíveis: {len(tipos)}]")
for t in tipos:
    print(f"  id={t['id']:<3} {t['name']:<30} categoria={t.get('category')} "
          f"prazo padrão={t.get('delay_count')} {t.get('delay_unit')}")

# Schema da mail.activity
fdef = test("mail.activity", "fields_get", [],
             {"attributes": ["type", "required", "readonly", "string", "relation"]})["result"]
req = [k for k, i in fdef.items() if i.get("required") and k != "id"]
print(f"\n[mail.activity obrigatórios: {req}]")

# Pegar um partner pra atrelar a atividade
par = test("res.partner", "search_read",
            [[["is_company", "=", True]], ["id"]], {"limit": 1})["result"][0]
res_model_id = test("ir.model", "search_read",
                     [[["model", "=", "res.partner"]], ["id"]], {"limit": 1})["result"][0]["id"]

print(f"\n[criar tarefa para res.partner id={par['id']}]")
vals = {
    "res_model_id": res_model_id,
    "res_id": par["id"],
    "summary": "Tarefa E2E Nexus — ligar para o cliente",
    "note": "<p>Cliente solicitou retorno em 48h.</p>",
    "date_deadline": "2026-05-30",
    "user_id": UID_T,
}
if tipos:
    vals["activity_type_id"] = tipos[0]["id"]
r = test("mail.activity", "create", [vals])
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('debug','')[-400:]}")
else:
    act_id = r["result"]
    print(f"  ✅ atividade id={act_id}")
    snap = test("mail.activity", "read", [[act_id]])["result"][0]
    rel = {k: v for k, v in snap.items()
            if v not in (False, [], None, "") and not k.startswith("_")}
    print(f"  snapshot: {json.dumps(rel, ensure_ascii=False, indent=2)[:1500]}")

    # Update — mudar deadline
    print(f"\n[update] mover deadline pra 2026-06-15")
    r = test("mail.activity", "write",
              [[act_id], {"date_deadline": "2026-06-15", "summary": "Atualizada via API"}])
    print(f"  result: {r.get('result')}")

    # Marcar como done
    print(f"\n[action_done]")
    r = test("mail.activity", "action_done", [[act_id]])
    if "error" in r:
        print(f"  ❌ {r['error']['data'].get('name')}")
    else:
        print(f"  ✅ result: {r.get('result')}")

    # cleanup se ainda existir
    sobrou = test("mail.activity", "search", [[["id", "=", act_id]]])["result"]
    if sobrou:
        test("mail.activity", "unlink", [[act_id]])
        print(f"  [cleanup] atividade removida")

print("\n" + "=" * 76)
print("PARTE 4 — Outros modelos relacionados a CRM")
print("=" * 76)

# chamado.*
for model in ["chamado.chamado", "chamado.etapa"]:
    p_cnt = prod(model, "search_count", [[]]).get("result", "?")
    if isinstance(p_cnt, int):
        print(f"\n--- {model} (PROD={p_cnt}) ---")
        fdef = test(model, "fields_get", [],
                     {"attributes": ["required", "type"]})["result"]
        req = [k for k, i in fdef.items() if i.get("required") and k != "id"]
        edits = sum(1 for k, i in fdef.items() if not i.get("readonly"))
        print(f"  {len(fdef)} campos, {edits} editáveis, obrigatórios: {req}")

# pedido.documento tipo=prospecto — quais operações existem que funcionariam?
print("\n[pedido.documento operacoes com etapa preenchida e tipo=prospecto na TESTE]")
ops = test("pedido.operacao", "search_read",
            [[["tipo", "=", "prospecto"]],
             ["id", "display_name", "etapa_id"]])["result"]
for o in ops:
    has_etapa = bool(o.get("etapa_id"))
    print(f"  id={o['id']} etapa_ok={has_etapa} {o['display_name']}")
print("\n✅ TESTE G COMPLETO")
