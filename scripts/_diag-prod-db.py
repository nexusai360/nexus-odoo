#!/usr/bin/env python3
# Diagnostico do Postgres de prod via Portainer: limite de memoria, estado das
# tasks (OOMKilled?), restarts, e logs do db (recovery/out of memory).
import importlib.util, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)

base, token = dp.resolve_portainer()
ep = dp.find_endpoint(base, token)
svcs = dp.list_services(base, token, ep)

print("=== services nexus-odoo_* : limite de memoria ===")
for name, s in sorted(svcs.items()):
    if not name.startswith("nexus-odoo"):
        continue
    res = s.get("Spec", {}).get("TaskTemplate", {}).get("Resources", {}) or {}
    lim = (res.get("Limits") or {}).get("MemoryBytes")
    resv = (res.get("Reservations") or {}).get("MemoryBytes")
    lim_mb = f"{int(lim)/1024/1024:.0f}MB" if lim else "sem limite"
    resv_mb = f"{int(resv)/1024/1024:.0f}MB" if resv else "-"
    print(f"  {name:28} limite={lim_mb:12} reserva={resv_mb}")

db = svcs.get("nexus-odoo_db")
if db:
    sid = db["ID"]
    # tasks do db: estado, OOM, restarts
    st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
                       urllib.parse.quote('{"service":["nexus-odoo_db"]}'), token)
    print("\n=== tasks do nexus-odoo_db (recentes) ===")
    if isinstance(tasks, list):
        for t in sorted(tasks, key=lambda x: x.get("CreatedAt", ""), reverse=True)[:6]:
            stt = t.get("Status", {})
            state = stt.get("State")
            msg = stt.get("Err") or stt.get("Message") or ""
            cs = stt.get("ContainerStatus", {}) or {}
            exitc = cs.get("ExitCode")
            print(f"  {t.get('CreatedAt','')[:19]} state={state} exit={exitc} {msg[:80]}")

    # logs do db
    url = f"{base}/api/endpoints/{ep}/docker/services/{sid}/logs?stdout=true&stderr=true&tail=200&timestamps=true"
    req = urllib.request.Request(url); req.add_header("X-API-Key", token)
    raw = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace")
    lines = ["".join(c for c in ln if c == "\t" or c >= " ") for ln in raw.split("\n")]
    KW = ["out of memory", "OOM", "killed", "recovery", "not yet accepting", "shutting down",
          "restart", "terminating", "FATAL", "PANIC", "checkpoint", "started", "ready to accept"]
    hits = [l for l in lines if any(k.lower() in l.lower() for k in KW)]
    print(f"\n=== logs do db ({len(hits)} relevantes de {len(lines)}) ===")
    for l in hits[-30:]:
        print("  " + l[:160])
