#!/usr/bin/env python3
# Roda um SELECT no Postgres de PROD via Portainer exec no container nexus-odoo_db.
# Uso: python3 scripts/_prod-db-query.py "SELECT 1"
# Read-only por convencao (passe so SELECT). Reusa deploy-portainer.py p/ credencial.
import importlib.util, json, sys, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

sql = sys.argv[1] if len(sys.argv) > 1 else (
    "SELECT model, last_status, record_count, "
    "to_char(updated_at,'YYYY-MM-DD HH24:MI:SS') AS updated_at "
    "FROM sync_state WHERE model LIKE 'sped.produto%' ORDER BY model")

# container running do db
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

inner = f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "{sql}"'
body = {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
exec_id = ex.get("Id")
url = f"{base}/api/endpoints/{ep}/docker/exec/{exec_id}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=40).read()
out = "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ")
print("=== resultado ===")
print(out.strip())
