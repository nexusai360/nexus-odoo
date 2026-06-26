#!/usr/bin/env python3
# Dump das avaliacoes PENDENTE do banco de PROD em JSON, via Portainer exec no
# container nexus-odoo_db (heredoc + COPY ... TO STDOUT evita inferno de aspas
# com nomes CamelCase). Read-only. Salva em /tmp/prod-pending-evals.json.
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

sql = (
    "COPY (SELECT json_agg(row_to_json(t)) FROM ("
    " SELECT id, assistant_message_id, conversation_id, model,"
    " question_snapshot, answer_snapshot,"
    " to_char(created_at,'YYYY-MM-DD HH24:MI:SS') AS created_at"
    " FROM conversation_quality_evaluations WHERE status='PENDENTE'"
    " ORDER BY created_at ASC ) t) TO STDOUT;"
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

inner = (
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -P pager=off '
    "<<'SQL'\n" + sql + "\nSQL\n"
)
body = {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
exec_id = ex.get("Id")
url = f"{base}/api/endpoints/{ep}/docker/exec/{exec_id}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=90).read()
# Remove o framing de multiplexacao do docker exec (bytes de controle) deixando
# so o printavel + tab/newline.
out = "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ").strip()
# A primeira linha pode trazer "container db:"? nao, isso e print local. O psql
# -t -A retorna so o json_agg (ou vazio). Tenta achar o inicio do JSON.
i = out.find("[")
data = out[i:] if i >= 0 else "[]"
try:
    parsed = json.loads(data)
except Exception as e:
    print("falha ao parsear JSON:", e)
    print("RAW:", out[:500])
    raise SystemExit(1)
with open("/tmp/prod-pending-evals.json", "w") as f:
    json.dump(parsed, f, ensure_ascii=False, indent=2)
print(f"pendentes: {len(parsed)} -> /tmp/prod-pending-evals.json")
for e in parsed:
    print(f"- {e['created_at']} | {e['id'][:8]} | {e.get('model')} | {str(e.get('question_snapshot'))[:70]!r}")
