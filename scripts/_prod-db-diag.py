#!/usr/bin/env python3
# Diagnostico de MEMORIA/TAMANHO do Postgres de PROD via Portainer exec.
# Read-only. Base da gestao inteligente da infra do banco.
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
    urllib.parse.quote('{"service":["nexus-odoo_db"],"desired-state":["running"]}'), token)
cid = next((((t.get("Status") or {}).get("ContainerStatus") or {}).get("ContainerID")
            for t in tasks or [] if ((t.get("Status") or {}).get("ContainerStatus") or {}).get("ContainerID")), None)
if not cid: raise SystemExit("sem container db running")

def run(sql):
    inner = f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "{sql}"'
    st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token,
        {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]})
    url = f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
    req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
    req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
    raw = urllib.request.urlopen(req, timeout=60).read()
    return "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ").strip()

SECOES = [
 ("CONFIG DE MEMORIA",
  "SELECT name, setting, unit FROM pg_settings WHERE name IN "
  "('shared_buffers','work_mem','maintenance_work_mem','effective_cache_size',"
  "'max_connections','superuser_reserved_connections','max_worker_processes',"
  "'max_parallel_workers','max_parallel_workers_per_gather','wal_buffers',"
  "'temp_buffers','effective_io_concurrency') ORDER BY name"),
 ("TAMANHO DO BANCO",
  "SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size"),
 ("TOP 22 TABELAS POR TAMANHO TOTAL",
  "SELECT c.relname, pg_size_pretty(pg_total_relation_size(c.oid)) AS total, "
  "pg_size_pretty(pg_relation_size(c.oid)) AS heap, "
  "pg_size_pretty(pg_indexes_size(c.oid)) AS idx, "
  "s.n_live_tup AS live, s.n_dead_tup AS dead "
  "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
  "LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid "
  "WHERE c.relkind='r' AND n.nspname='public' "
  "ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 22"),
 ("BLOAT (dead tuples > 5k)",
  "SELECT relname, n_live_tup AS live, n_dead_tup AS dead, "
  "round(n_dead_tup*100.0/NULLIF(n_live_tup+n_dead_tup,0),1) AS dead_pct, "
  "to_char(last_autovacuum,'MM-DD HH24:MI') AS last_autovac "
  "FROM pg_stat_user_tables WHERE n_dead_tup > 5000 ORDER BY n_dead_tup DESC LIMIT 15"),
 ("CONEXOES (backends por estado/app)",
  "SELECT coalesce(application_name,'?') AS app, state, count(*) "
  "FROM pg_stat_activity WHERE backend_type='client backend' "
  "GROUP BY 1,2 ORDER BY count DESC"),
 ("CONEXOES TOTAIS vs MAX",
  "SELECT (SELECT count(*) FROM pg_stat_activity) AS atuais, "
  "current_setting('max_connections') AS max_conn"),
 ("LOTE.SERIE (erro atual)",
  "SELECT last_status, record_count, substr(last_error,1,160) AS erro, "
  "to_char(updated_at,'HH24:MI:SS') AS upd FROM sync_state WHERE model='sped.produto.lote.serie'"),
 ("RESET vs USO (cache hit ratio)",
  "SELECT round(sum(blks_hit)*100.0/NULLIF(sum(blks_hit)+sum(blks_read),0),2) AS cache_hit_pct, "
  "pg_size_pretty(sum(temp_bytes)) AS temp_total FROM pg_stat_database WHERE datname=current_database()"),
]
for titulo, sql in SECOES:
    print(f"\n===== {titulo} =====")
    print(run(sql))
