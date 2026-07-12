#!/usr/bin/env python3
# Aplica os veredictos do judge (manual, via Claude Code) nas 9 avaliacoes
# PENDENTE de PROD. Le os ids completos de /tmp/prod-pendentes.json, casa cada um
# por trecho da pergunta, e grava status/razoes/patterns/judge_model/judge_version
# via Portainer exec (heredoc). So mexe em linhas que ainda estao PENDENTE.
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

JUDGE_MODEL = "claude-opus-4-8"
JUDGE_VERSION = "manual-cloud-2026-06-18"

# Veredictos por trecho-chave da pergunta. Verificados reexecutando as tools
# canonicas do MCP contra o cache (dev espelha prod, mesma fonte Odoo).
VERDICTS = [
    ("Quanto faturamos no", "CORRETO", ["faturamento"],
     "Faturamento do mes corrente correto: usou a definicao canonica (faturamento real do grupo + total emitido + intragrupo eliminado) com narrativa correta. Os numeros sao do horario da resposta (real ~R$12,79M em ~557-559 notas); a reexecucao agora retorna R$13,06M em 567 notas, diferenca atribuivel a novas notas emitidas ao longo do dia (drift normal de dado vivo)."),
    ("etapa do funil", "CORRETO", ["funil", "pedidos_parados"],
     "Correto: a etapa Input financeiro foi confirmada como a mais frequente entre os pedidos travados ha mais de 30 dias (reexecucao da tool de travados por etapa). As demais etapas citadas (Em separacao, Fracionar, Confirmado, Em transito, Emite NF Consumidor Final, Cancelado) tambem aparecem. Total ~1.314 no horario da resposta; 1.345 agora (drift)."),
    ("10 pedidos mais antigos", "CORRETO", ["funil", "pedidos_parados"],
     "Correto: os pedidos mais antigos conferem com a reexecucao (mais antigo = pedido 45 em Devolucao em solicitacao, seguido do bloco Em separacao). Diferenca de 1 dia nas contagens por ser metrica diaria (drift). Total ~1.314 no horario; 1.345 agora."),
    ("separado por empresa", "PARCIAL", ["faturamento", "resposta_incompleta"],
     "Parcial: a pergunta pedia o faturamento SEPARADO POR EMPRESA, mas a resposta trouxe apenas o total do grupo (R$20,66M em 11 empresas) sem a quebra por empresa. A informacao esta correta porem incompleta frente ao que foi pedido."),
    ("contando apenas notas fiscais autorizadas", "CORRETO", ["faturamento", "por_empresa"],
     "Correto: a quebra empresa por empresa confere com a tool canonica de faturamento por empresa (mesmas empresas, mesma ordem). Os valores sao do horario da resposta e batem com a reexecucao a menos do drift do dia. A ressalva de que conta apenas notas de saida autorizadas esta correta."),
    ("levando no", "PARCIAL", ["faturamento", "inconsistencia_interna"],
     "Parcial: o valor das operacoes da JHT SP esta na ordem de grandeza correta, mas a resposta faz hedge (admite que pode variar) e diverge da propria quebra por empresa (R$9,16M) sem listar as operacoes consideradas. Faltou consistencia e o detalhamento pedido."),
    ("por CFOP", "CORRETO", ["faturamento", "cfop"],
     "Correto: a quebra da JHT SP por CFOP e coerente; a receita de fato (R$9,16M) reconcilia com a quebra por empresa e o valor sem CFOP (~R$36k) e plausivel frente ao sem-CFOP do grupo todo (~R$63k na reexecucao). Separou receita de movimentacao nao-receita corretamente."),
    ("notas sem CFOP", "ERRADO", ["cfop", "classificacao_errada"],
     "Errado: a resposta afirma 480 notas sem CFOP somando R$12,08M, mas o sem-CFOP real do grupo todo e da ordem de R$63k (22 itens) e a propria quebra por CFOP anterior apontou R$36,4k em 20 notas para a JHT SP. As 480 notas / R$12M sao o conjunto de notas do periodo, nao notas sem CFOP. Classificacao incorreta do filtro."),
]

def verdict_for(question: str):
    q = (question or "").lower()
    for key, status, patterns, razoes in VERDICTS:
        if key.lower() in q:
            return status, patterns, razoes
    return None

data = json.load(open("/tmp/prod-pendentes.json"))
stmts = []
matched = 0
for r in data:
    v = verdict_for(r.get("question_snapshot", ""))
    if not v:
        print("SEM VERDICT p/ pergunta:", (r.get("question_snapshot") or "")[:80])
        continue
    status, patterns, razoes = v
    matched += 1
    rid = r["id"]
    razoes_sql = razoes.replace("'", "''")
    arr = "ARRAY[" + ",".join("'" + p.replace("'", "''") + "'" for p in patterns) + "]::text[]"
    stmts.append(
        f"UPDATE conversation_quality_evaluations SET status='{status}', razoes='{razoes_sql}', "
        f"patterns={arr}, judge_model='{JUDGE_MODEL}', judge_version='{JUDGE_VERSION}' "
        f"WHERE id='{rid}' AND status='PENDENTE';"
    )

print(f"casados {matched}/{len(data)} veredictos")
sql = "\n".join(stmts) + "\nSELECT status, count(*) FROM conversation_quality_evaluations GROUP BY status ORDER BY 2 DESC;\n"

st, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters=" +
                   urllib.parse.quote('{"service":["nexus-odoo_db"],"desired-state":["running"]}'), token)
cid = None
for tk in tasks or []:
    cs = (tk.get("Status") or {}).get("ContainerStatus") or {}
    if cs.get("ContainerID"):
        cid = cs["ContainerID"]; break
if not cid:
    raise SystemExit("nao achei container running do db")

inner = (
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -P pager=off '
    "<<'SQL'\n" + sql + "\nSQL\n"
)
body = {"AttachStdout": True, "AttachStderr": True, "Tty": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
url = f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": True}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=60).read()
print("=== resultado ===")
print("".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ").strip())
