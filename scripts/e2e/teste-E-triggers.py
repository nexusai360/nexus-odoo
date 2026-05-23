"""TESTE E: triggers escondidos + onchange + métodos públicos comuns."""
import urllib.request, json, ssl, os
TEST_URL = os.environ["ODOO_WRITE_URL"] + "/jsonrpc"
TEST_DB, TEST_USER, TEST_PWD = (os.environ["ODOO_WRITE_DB"],
                                  os.environ["ODOO_WRITE_USER"],
                                  os.environ["ODOO_WRITE_PASSWORD"])

def rpc(url, service, method, args, kwargs=None):
    p = {"jsonrpc": "2.0", "method": "call",
         "params": {"service": service, "method": method, "args": args}, "id": 1}
    if kwargs: p["params"]["kwargs"] = kwargs
    req = urllib.request.Request(url, data=json.dumps(p).encode(),
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120, context=ssl.create_default_context()) as r:
        return json.loads(r.read())

TEST_UID = rpc(TEST_URL, "common", "authenticate",
                [TEST_DB, TEST_USER, TEST_PWD, {}])["result"]

def test(model, method, args, kwargs=None):
    return rpc(TEST_URL, "object", "execute_kw",
                [TEST_DB, TEST_UID, TEST_PWD, model, method, args], kwargs)

print("=== triggers/automations em pedido.documento ===")
# base.automation
r = test("base.automation", "search_read",
          [[["model_id.model", "=", "pedido.documento"]],
           ["name", "trigger", "state", "active"]])
if "error" in r:
    print(f"  base.automation: {r['error']['data'].get('name')}")
else:
    print(f"  base.automation registros: {len(r['result'])}")
    for a in r["result"][:20]:
        print(f"    {a}")

# ir.actions.server
r = test("ir.actions.server", "search_read",
          [[["model_id.model", "=", "pedido.documento"]],
           ["name", "state"]])
if "result" in r:
    print(f"\n  ir.actions.server registros: {len(r['result'])}")
    for a in r["result"][:20]:
        print(f"    {a}")

# ir.cron jobs que tocam pedido.documento (procurando por nome)
r = test("ir.cron", "search_read",
          [[["model_id.model", "=", "pedido.documento"]],
           ["name", "active", "interval_number", "interval_type"]])
if "result" in r:
    print(f"\n  ir.cron registros: {len(r['result'])}")
    for a in r["result"][:20]:
        print(f"    {a}")

# Métodos comuns adicionais (lista expandida)
print("\n=== métodos extras testados ===")
import json as _j
# Criar um doc rapidinho (minimo, vai falhar mas só para ver mensagens de método)
metodos_extra = [
    # Tauga específicos
    "tauga_calcula", "tauga_calcula_totais", "tauga_after_create",
    "tauga_calcula_imposto", "tauga_gera_parcelas", "tauga_finaliza",
    "tauga_aplica_operacao", "tauga_processa",
    # padrão Odoo
    "default_get", "_compute_display_name", "name_get",
    # workflow
    "action_open", "action_done", "action_validate", "action_post",
    "action_emite", "action_processa", "action_efetiva",
    # acaba aqui
]
# Chamar default_get pra ver o que ele retorna
print("\n  default_get(['tipo', 'operacao_id', 'empresa_id', 'participante_id', 'etapa_id']):")
r = test("pedido.documento", "default_get",
          [["tipo", "operacao_id", "empresa_id", "participante_id", "etapa_id"]])
print(f"    {r}")

# Chamar onchange via web/dataset/onchange seria a forma certa
# Vamos tentar passar context com defaults da operação
print("\n  default_get com context={default_operacao_id:202, default_tipo:'prospecto'}:")
r = test("pedido.documento", "default_get",
          [["tipo", "operacao_id", "empresa_id", "participante_id", "etapa_id"]],
          {"context": {"default_operacao_id": 202, "default_tipo": "prospecto"}})
print(f"    {r}")

# CRIAR doc com CONTEXT defaults (simulando UI)
print("\n=== TESTE: create com context={default_operacao_id:202, default_tipo:'prospecto'} ===")
emp = test("res.company", "search_read", [[], ["id"]], {"limit": 1})["result"][0]["id"]
par = test("res.partner", "search_read",
            [[["is_company", "=", True]], ["id"]], {"limit": 1})["result"][0]["id"]
r = test("pedido.documento", "create",
          [{"tipo": "prospecto", "operacao_id": 202,
            "empresa_id": emp, "participante_id": par}],
          {"context": {"default_operacao_id": 202, "default_tipo": "prospecto"}})
if "error" in r:
    print(f"  ❌ {r['error']['data'].get('name')}: {r['error']['data'].get('debug','')[-400:]}")
else:
    print(f"  ✅ id={r['result']}")
    snap = test("pedido.documento", "read", [[r["result"]]])["result"][0]
    print(f"    display_name={snap.get('display_name')} etapa={snap.get('etapa_id')}")
    test("pedido.documento", "unlink", [[r["result"]]])
