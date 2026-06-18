#!/usr/bin/env python3
# Migração ADITIVA e IDEMPOTENTE do banco de PROD para o overhaul de auditoria
# (PR #129): coluna users.last_activity_at + 17 novos valores do enum AuditAction.
# Aplica via Portainer exec no container nexus-odoo_db, mandando o SQL por heredoc
# (psql em autocommit roda cada statement em sua própria transação -> ALTER TYPE
# ADD VALUE funciona). Tudo com IF NOT EXISTS, pode rodar mais de uma vez.
#
# Serve de MODELO para o passo obrigatório da §1.1 do deploy-procedure.md:
# quando um deploy leva mudança de schema feita via `prisma db execute` no dev,
# o mesmo SQL aditivo precisa ser aplicado no banco de prod (o migrate deploy do
# entrypoint não pega mudanças que não viraram arquivo de migração).
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

NEW_ENUM_VALUES = [
    "logout", "api_key_updated", "api_key_rotated",
    "webhook_created", "webhook_updated", "webhook_secret_rotated",
    "webhook_toggled", "webhook_deleted",
    "external_mcp_server_created", "external_mcp_server_updated",
    "external_mcp_server_toggled", "external_mcp_server_deleted",
    "kb_document_created", "kb_document_deleted",
    "report_preset_created", "report_preset_deleted", "report_exported",
]

sql_lines = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP(3);",
]
for v in NEW_ENUM_VALUES:
    sql_lines.append(f"ALTER TYPE \"AuditAction\" ADD VALUE IF NOT EXISTS '{v}';")
sql = "\n".join(sql_lines)

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

# Heredoc evita inferno de aspas; ON_ERROR_STOP=1 aborta no primeiro erro real.
inner = (
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -P pager=off '
    "<<'SQL'\n" + sql + "\nSQL\n"
)
body = {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
exec_id = ex.get("Id")
url = f"{base}/api/endpoints/{ep}/docker/exec/{exec_id}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=60).read()
out = "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ")
print("=== resultado ===")
print(out.strip() or "(sem saida; ALTER ... IF NOT EXISTS nao imprime nada)")
