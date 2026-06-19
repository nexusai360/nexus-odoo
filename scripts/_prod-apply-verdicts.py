#!/usr/bin/env python3
# Aplica vereditos HUMANOS (human_status) nas avaliacoes PENDENTE de PROD, via
# Portainer exec no container nexus-odoo_db (heredoc). O julgamento e do Claude
# (offline, NUNCA via API OpenAI). statusEfetivo na UI = human_status ?? status.
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

# id -> veredito (CORRETO|PARCIAL|ERRADO|FORA_DO_ESCOPO|FALHA_TECNICA)
VERDICTS = {
    "57e92e56-7b4b-4cd9-8531-70a0ba1349e9": "CORRETO",   # faturamento real do mes (math fecha)
    "be0f250b-cdea-4fe5-90b0-398a518657fc": "PARCIAL",   # deu BRUTO por empresa sem sinalizar intragrupo
    "fa1032df-15ac-4657-8116-a95f2c74dc26": "CORRETO",   # real por empresa (soma fecha; verificado)
    "cf619889-3795-43af-81ef-dcd426971e43": "PARCIAL",   # "todas venda/sem nao-venda" nao bate c/ CFOP
    "fddda534-0877-4664-8317-52fe3b5b0d71": "PARCIAL",   # rotulou BRUTO por CFOP como "verdadeiro"
    "03a63d1d-87a9-4020-aac5-2834a0f611bd": "CORRETO",   # limitacao honesta (sem nota-a-nota)
    "823e3c3d-cef7-42ce-96aa-c699b3ef5d90": "CORRETO",   # top cliente, 1 tool, formato certo
    "c3b647b2-dd1d-46fd-8d75-bbba5c30026c": "CORRETO",   # honesto: sem snapshot historico de estoque
}

cases = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in VERDICTS.items())
ids = ",".join(f"'{k}'" for k in VERDICTS)
sql = (
    "UPDATE conversation_quality_evaluations SET "
    f"human_status = CASE id::text {cases} END, "
    "human_reviewed_at = now() "
    f"WHERE id::text IN ({ids});"
)

st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
                   urllib.parse.quote('{"service":["nexus-odoo_db"],"desired-state":["running"]}'), token)
cid = None
for t in tasks or []:
    cs = (t.get("Status") or {}).get("ContainerStatus") or {}
    if cs.get("ContainerID"):
        cid = cs["ContainerID"]; break
if not cid:
    raise SystemExit("nao achei container running do db")
print("container db:", cid[:12])

inner = ('psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -P pager=off '
         "<<'SQL'\n" + sql + "\nSQL\n")
body = {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
url = f"{base}/api/endpoints/{ep}/docker/exec/{ex['Id']}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=60).read()
out = "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ").strip()
print("=== resultado ===")
print(out or "(sem saida)")
