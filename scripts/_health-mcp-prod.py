#!/usr/bin/env python3
# Executa o /health interno do MCP de prod via Portainer exec (node fetch).
import importlib.util, json, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

# container id da task running do mcp
st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
                   urllib.parse.quote('{"service":["nexus-odoo_mcp"],"desired-state":["running"]}'), token)
cid = None
for t in tasks or []:
    cs = (t.get("Status") or {}).get("ContainerStatus") or {}
    if cs.get("ContainerID"):
        cid = cs["ContainerID"]; break
if not cid:
    raise SystemExit("nao achei container running do mcp")
print("container mcp:", cid[:12])

# cria exec: node fetch no /health
body = {"AttachStdout": True, "AttachStderr": True,
        "Cmd": ["node", "-e", "fetch('http://127.0.0.1:3100/health').then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.log('ERR '+e))"]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
exec_id = ex.get("Id")
# start exec (stream multiplexado)
url = f"{base}/api/endpoints/{ep}/docker/exec/{exec_id}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=30).read()
# remove headers de frame (8 bytes) do stream docker
out = "".join(c for c in raw.decode("utf-8", "replace") if c == "\t" or c == "\n" or c >= " ")
print("=== /health interno do MCP ===")
print(out[-1200:])
