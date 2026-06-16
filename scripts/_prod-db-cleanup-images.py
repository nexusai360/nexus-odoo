#!/usr/bin/env python3
"""
Limpa campos binarios (imagens base64 image_*, blobs) ja gravados nas tabelas
raw_* do Postgres de PROD e devolve o disco (VACUUM FULL). Complemento do fix de
codigo (field-selection exclui type=binary): o codigo impede gravar de novo, este
script remove o que ja foi gravado.

Detecta dinamicamente, em CADA tabela raw_* com coluna `data`, as chaves do JSON
que comecam com 'image' (todas as resolucoes do Odoo: image, image_64..image_1920).

Uso:
  python3 scripts/_prod-db-cleanup-images.py              # DRY-RUN (so reporta)
  python3 scripts/_prod-db-cleanup-images.py --apply      # aplica: strip + VACUUM FULL

ATENCAO (--apply): roda em PROD. UPDATE reescreve linhas; VACUUM FULL pega lock
exclusivo na tabela (rapido apos o strip). Rode com o fix de codigo JA deployado,
senao o worker regrava as imagens.
"""
import importlib.util, json, sys, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)
APPLY = "--apply" in sys.argv

st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
    urllib.parse.quote('{"service":["nexus-odoo_db"],"desired-state":["running"]}'), token)
cid = next((((t.get("Status") or {}).get("ContainerStatus") or {}).get("ContainerID")
            for t in tasks or [] if ((t.get("Status") or {}).get("ContainerStatus") or {}).get("ContainerID")), None)
if not cid: raise SystemExit("sem container db running")

def _deframe(raw: bytes) -> bytes:
    """Desempacota o stream multiplexado do docker exec (header de 8 bytes:
    [stream(1), 0,0,0, len(4 BE)]). Sem isso, os bytes de tamanho do header
    vazam como lixo no inicio das linhas."""
    out = bytearray(); i = 0; n = len(raw)
    while i + 8 <= n:
        if raw[i] in (1, 2) and raw[i + 1] == 0 and raw[i + 2] == 0 and raw[i + 3] == 0:
            length = int.from_bytes(raw[i + 4:i + 8], "big")
            out += raw[i + 8:i + 8 + length]; i += 8 + length
        else:
            out += raw[i:i + 1]; i += 1
    out += raw[i:]
    return bytes(out)

def run(sql, timeout=180):
    inner = f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -t -A -F\'|\' -c "{sql}"'
    st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token,
        {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]})
    url = f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
    req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
    req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
    raw = _deframe(urllib.request.urlopen(req, timeout=timeout).read())
    return raw.decode("utf-8", "replace").strip()

# 1) tabelas raw_* com coluna data
tabelas = [l for l in run(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
    "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='data' AND a.attnum>0 AND NOT a.attisdropped "
    "WHERE c.relkind='r' AND n.nspname='public' AND c.relname LIKE 'raw\\_%' "
    "ORDER BY pg_total_relation_size(c.oid) DESC").splitlines() if l.strip()]

print(f"[cleanup] {len(tabelas)} tabelas raw_* com coluna data. modo={'APPLY' if APPLY else 'DRY-RUN'}")
alvos = []
for t in tabelas:
    # chaves do tipo image* num registro amostra (todas as linhas do mesmo modelo tem as mesmas chaves)
    keys = run(f"SELECT string_agg(k,',') FROM (SELECT jsonb_object_keys("
               f"(SELECT data::jsonb FROM {t} WHERE data IS NOT NULL LIMIT 1)) AS k) s "
               f"WHERE k LIKE 'image%'")
    keys = [k for k in keys.split(",") if k.strip()]
    if not keys:
        continue
    size = run(f"SELECT pg_size_pretty(pg_total_relation_size('{t}'))")
    print(f"  ALVO {t:42} {size:>9}  chaves_image={keys}")
    alvos.append((t, keys))

if not alvos:
    print("[cleanup] nenhuma tabela com chaves image* , nada a fazer."); sys.exit(0)

if not APPLY:
    print("\n[cleanup] DRY-RUN. Rode com --apply para strip + VACUUM FULL.")
    sys.exit(0)

print("\n[cleanup] APLICANDO strip + VACUUM FULL...")
for t, keys in alvos:
    arr = "ARRAY[" + ",".join("'" + k.replace("'", "''") + "'" for k in keys) + "]::text[]"
    print(f"[cleanup] {t}: UPDATE removendo {len(keys)} chaves...")
    r = run(f"UPDATE {t} SET data = (data::jsonb) - {arr} WHERE (data::jsonb) ?| {arr}", timeout=300)
    print(f"  -> {r}")
    print(f"[cleanup] {t}: VACUUM FULL...")
    r = run(f"VACUUM FULL {t}", timeout=600)
    print(f"  -> ok")
    size = run(f"SELECT pg_size_pretty(pg_total_relation_size('{t}'))")
    print(f"  -> tamanho agora: {size}")
print("\n[cleanup] tamanho do banco:", run("SELECT pg_size_pretty(pg_database_size(current_database()))"))
