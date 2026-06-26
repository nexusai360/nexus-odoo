#!/usr/bin/env python3
# Dump das avaliacoes PENDENTE do banco de PROD (para o judge manual via Claude
# Code). Le pergunta/resposta/modelo + as tool_calls da mensagem do assistant,
# emite JSON em /tmp/prod-pendentes.json. Read-only. Via Portainer exec (heredoc,
# sem inferno de aspas). NAO escreve nada.
import importlib.util, json, urllib.parse, urllib.request, base64

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

SQL = r"""
SELECT json_agg(row_to_json(t)) FROM (
  SELECT e.id, e.conversation_id, e.assistant_message_id, e.user_message_id,
         e.model, e.status, e.question_snapshot, e.answer_snapshot,
         m.tool_calls AS assistant_tool_calls
  FROM conversation_quality_evaluations e
  LEFT JOIN messages m ON m.id = e.assistant_message_id
  WHERE e.status = 'PENDENTE'
  ORDER BY e.created_at ASC
) t;
"""

st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
                   urllib.parse.quote('{"service":["nexus-odoo_db"],"desired-state":["running"]}'), token)
cid = None
for tk in tasks or []:
    cs = (tk.get("Status") or {}).get("ContainerStatus") or {}
    if cs.get("ContainerID"):
        cid = cs["ContainerID"]; break
if not cid:
    raise SystemExit("nao achei container running do db")

# -tA: tuplas-only, unaligned -> imprime so o JSON. base64 evita qualquer
# corrupcao de bytes nao-ascii no transporte do exec.
inner = (
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -v ON_ERROR_STOP=1 -P pager=off '
    "<<'SQL' | base64\n" + SQL + "\nSQL\n"
)
# Tty:true -> stream NAO multiplexado (sem headers de 8 bytes contaminando o base64).
body = {"AttachStdout": True, "AttachStderr": True, "Tty": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
url = f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": True}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=60).read()
# Remove frames de multiplexacao do docker exec (8 bytes de header por chunk):
# o jeito simples e' pegar so chars base64 validos.
text = raw.decode("utf-8", "replace")
b64 = "".join(c for c in text if c.isalnum() or c in "+/=\n").replace("\n", "")
try:
    decoded = base64.b64decode(b64).decode("utf-8", "replace")
    data = json.loads(decoded)
except Exception as e:
    print("falha ao decodificar; raw base64 len=", len(b64), "erro:", e)
    print(text[:500])
    raise SystemExit(1)
with open("/tmp/prod-pendentes.json", "w") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"OK: {len(data or [])} pendentes salvos em /tmp/prod-pendentes.json")
for r in (data or []):
    q = (r.get("question_snapshot") or "")[:90]
    print(f"  - {r['id'][:8]} model={r.get('model')} q={q!r}")
