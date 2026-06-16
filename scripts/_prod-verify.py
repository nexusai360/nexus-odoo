#!/usr/bin/env python3
# Verificacao E2E de PROD: deploy (imagens/tasks), sync_state, fatos, raw,
# imagens removidas, tamanho do banco, app HTTP, MCP health. Read-only.
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

def _deframe(raw):
    out=bytearray(); i=0; n=len(raw)
    while i+8<=n:
        if raw[i] in (1,2) and raw[i+1]==0 and raw[i+2]==0 and raw[i+3]==0:
            ln=int.from_bytes(raw[i+4:i+8],"big"); out+=raw[i+8:i+8+ln]; i+=8+ln
        else: out+=raw[i:i+1]; i+=1
    out+=raw[i:]; return bytes(out)

def task_running(svc):
    st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
        urllib.parse.quote(json.dumps({"service":[svc],"desired-state":["running"]})), token)
    for t in tasks or []:
        if (t.get("Status",{}) or {}).get("State")=="running":
            return t
    return None

def db_cid():
    t=task_running("nexus-odoo_db")
    return (t.get("Status",{}).get("ContainerStatus",{}) or {}).get("ContainerID") if t else None

CID=db_cid()
def sql(q, timeout=120):
    inner=f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -t -A -F\'|\' -c "{q}"'
    st,ex=dp.api("POST",base,f"/api/endpoints/{ep}/docker/containers/{CID}/exec",token,
        {"AttachStdout":True,"AttachStderr":True,"Cmd":["sh","-c",inner]})
    url=f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
    req=urllib.request.Request(url,data=json.dumps({"Detach":False,"Tty":False}).encode(),method="POST")
    req.add_header("X-API-Key",token); req.add_header("Content-Type","application/json")
    return _deframe(urllib.request.urlopen(req,timeout=timeout).read()).decode("utf-8","replace").strip()

print("===== 1) DEPLOY: tasks running + imagem =====")
for s in ("nexus-odoo_app","nexus-odoo_mcp","nexus-odoo_worker","nexus-odoo_db","nexus-odoo_redis"):
    t=task_running(s)
    if not t: print(f"  {s:20} SEM TASK RUNNING !!!"); continue
    img=(t.get("Spec",{}).get("ContainerSpec",{}) or {}).get("Image","")
    short=img.split("@")[0]+("@"+img.split("@")[1][:19] if "@" in img else "")
    print(f"  {s:20} running desde {t.get('CreatedAt','')[:19]}  {short}")

print("\n===== 2) SYNC_STATE (modelos/tabelas raw) =====")
print(" ", sql("SELECT 'total='||count(*)||' ok='||count(*) FILTER(WHERE last_status='ok')"
    "||' erro='||count(*) FILTER(WHERE last_status='erro')||' rodando='||count(*) FILTER(WHERE last_status='rodando')"
    "||' sem_acesso='||count(*) FILTER(WHERE last_status='sem_acesso')"
    "||' freshness_s='||round(extract(epoch FROM now()-max(updated_at)))::text FROM sync_state"))
nao_ok=sql("SELECT model||' -> '||last_status||COALESCE(' ('||substr(last_error,1,40)||')','') FROM sync_state WHERE last_status<>'ok' ORDER BY model")
print("  nao-ok:", nao_ok if nao_ok else "(nenhum , todos ok)")

print("\n===== 3) FATOS por dominio (count real) =====")
fatos=[l for l in sql("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE c.relkind='r' AND n.nspname='public' AND c.relname LIKE 'fato\\_%' ORDER BY relname").splitlines() if l.strip()]
union=" UNION ALL ".join(f"SELECT '{t}' AS t, count(*) c FROM {t}" for t in fatos)
res=sql(f"SELECT t||'='||c FROM ({union}) x ORDER BY t", timeout=180)
linhas=[l for l in res.splitlines() if "=" in l]
vazios=[l for l in linhas if l.endswith("=0")]
print(f"  {len(fatos)} tabelas fato_*; VAZIAS={len(vazios)}")
for l in linhas: print("   ", l)
if vazios: print("  !!! FATOS VAZIOS:", vazios)

print("\n===== 4) RAW + imagens removidas + tamanho =====")
print(" ", sql("SELECT 'tabelas_raw='||count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "WHERE c.relkind='r' AND n.nspname='public' AND c.relname LIKE 'raw\\_%'"))
# img keys remanescentes nas tabelas que tinham imagem
img=sql("SELECT count(*) FROM (SELECT jsonb_object_keys((SELECT data::jsonb FROM raw_sped_produto LIMIT 1)) k) s WHERE k LIKE 'image%'")
print("  img_keys em raw_sped_produto (deve ser 0):", img)
print(" ", sql("SELECT 'banco='||pg_size_pretty(pg_database_size(current_database()))"))

print("\n===== 5) APP + MCP HTTP =====")
try:
    with urllib.request.urlopen("https://agentenex.nexusai360.com/api/health", timeout=20) as r:
        print("  app /api/health:", r.status, r.read().decode()[:80])
except Exception as e: print("  app /api/health ERRO:", e)
try:
    req=urllib.request.Request("https://agentenex.nexusai360.com/login", method="GET")
    with urllib.request.urlopen(req, timeout=20) as r:
        print("  app /login:", r.status)
except Exception as e: print("  app /login:", getattr(e,'code',e))
# MCP health via exec no container mcp
mt=task_running("nexus-odoo_mcp")
mcid=(mt.get("Status",{}).get("ContainerStatus",{}) or {}).get("ContainerID") if mt else None
if mcid:
    body={"AttachStdout":True,"AttachStderr":True,"Cmd":["node","-e",
        "fetch('http://127.0.0.1:3100/health').then(r=>r.text()).then(t=>console.log(t)).catch(e=>console.log('ERR '+e))"]}
    st,ex=dp.api("POST",base,f"/api/endpoints/{ep}/docker/containers/{mcid}/exec",token,body)
    url=f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
    req=urllib.request.Request(url,data=json.dumps({"Detach":False,"Tty":False}).encode(),method="POST")
    req.add_header("X-API-Key",token); req.add_header("Content-Type","application/json")
    out=_deframe(urllib.request.urlopen(req,timeout=30).read()).decode("utf-8","replace")
    try:
        h=json.loads(out[out.index("{"):out.rindex("}")+1]); print("  mcp /health status:", h.get("status"), h.get("checks"))
    except Exception: print("  mcp /health raw:", out[-200:])
