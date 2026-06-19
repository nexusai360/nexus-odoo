#!/usr/bin/env python3
# Aplica os vereditos do JUIZ (Claude, offline, NUNCA via OpenAI) nas avaliacoes
# PENDENTE de PROD, do jeito CANONICO (igual aos scripts apply-r15-r16):
#   status        = veredito (CORRETO|PARCIAL|ERRADO|FORA_DO_ESCOPO|FALHA_TECNICA)
#   razoes        = diagnostico da pericia (texto)
#   patterns      = taxonomia (vocab)
#   judge_model   = claude-opus-4-8
#   judge_version = manual-cloud-2026-06-19
#   human_status  = NULL  (o lapisinho/ajuste manual e SO do superadmin na UI)
# CORRIGE o erro anterior, que setava human_status (virava "ajuste manual"
# Pendente->X com lapis e escondia o bloco de Ajuste manual).
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

JUDGE_MODEL = "claude-opus-4-8"
JUDGE_VERSION = "manual-cloud-2026-06-19"

# id -> (status, [patterns], razoes)
V = {
    "57e92e56-7b4b-4cd9-8531-70a0ba1349e9": (
        "CORRETO", ["resposta_correta"],
        "Faturamento real do mes correto: R$ 13.470.440,07 = R$ 21.650.500,90 bruto - "
        "R$ 8.180.060,83 intragrupo. A conta fecha e a metodologia e a canonica (real = "
        "bruto menos vendas entre empresas do grupo). Distinguiu real x bruto com clareza."),
    "be0f250b-cdea-4fe5-90b0-398a518657fc": (
        "PARCIAL", [],
        "Deu o faturamento BRUTO por empresa (a soma fecha em R$ 21,65M), mas nao sinalizou "
        "que esse total inclui vendas intragrupo; o usuario precisou pedir o 'verdadeiro' no "
        "turno seguinte. Dados corretos, faltou a ressalva de que nao e o faturamento real."),
    "fa1032df-15ac-4657-8116-a95f2c74dc26": (
        "CORRETO", ["resposta_correta"],
        "Faturamento real por empresa (sem intragrupo): a soma das empresas fecha no total real "
        "R$ 13.470.440,07 e o bruto menos o eliminado bate empresa a empresa. Refez no formato "
        "pedido (verdadeiro), coerente com o turno anterior."),
    "cf619889-3795-43af-81ef-dcd426971e43": (
        "PARCIAL", [],
        "Afirmou que as operacoes da JHT SP 'todas entram como venda' e que 'nao ha operacao de "
        "nao venda', fechando em R$ 9.435.562,69. Isso nao reconcilia com a quebra por CFOP do "
        "turno seguinte, que lista operacoes de NAO receita (retorno 5906, 6949, 2352). A "
        "dimensao 'operacao' omitiu as nao-venda e o total nao casa com bruto nem com o real."),
    "fddda534-0877-4664-8317-52fe3b5b0d71": (
        "PARCIAL", [],
        "A quebra por CFOP e internamente coerente (movimentado R$ 9.906.400,87 menos nao-receita "
        "R$ 663.501,61 = R$ 9.242.899,26), MAS rotulou esse R$ 9.242.899,26 como 'faturamento "
        "verdadeiro' da JHT SP, quando o verdadeiro (sem intragrupo) e R$ 8.974.046,14 (turno #3). "
        "A quebra por CFOP entrega o BRUTO; chamar de 'verdadeiro' gera inconsistencia entre turnos."),
    "03a63d1d-87a9-4020-aac5-2834a0f611bd": (
        "CORRETO", ["limitacao_real_declarada"],
        "Limitacao honesta: nao ha tool para listar nota a nota as operacoes sem CFOP, e o agente "
        "declarou isso sem inventar, confirmando o agregado (R$ 36.786,70 em 22 itens)."),
    "823e3c3d-cef7-42ce-96aa-c699b3ef5d90": (
        "CORRETO", ["resposta_correta"],
        "Top cliente do mes respondido de forma direta e no formato certo (Smartfit, R$ 1.649.165,00 "
        "em 3 notas), a partir de uma unica tool, sem inconsistencia interna."),
    "c3b647b2-dd1d-46fd-8d75-bbba5c30026c": (
        "CORRETO", ["limitacao_real_declarada"],
        "Honesto sobre nao ter snapshot historico de estoque para comparar mes a mes; deu o estoque "
        "atual (R$ 45.954.084,22, 1.886 produtos, 168 negativos) e nao inventou a variacao. Gap real "
        "de produto (falta snapshot de fechamento)."),
}

def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"

def arr(xs):
    if not xs:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ",".join(q(x) for x in xs) + "]::text[]"

stmts = []
for vid, (status, patterns, razoes) in V.items():
    stmts.append(
        "UPDATE conversation_quality_evaluations SET "
        f"status={q(status)}, razoes={q(razoes)}, patterns={arr(patterns)}, "
        f"judge_model={q(JUDGE_MODEL)}, judge_version={q(JUDGE_VERSION)}, "
        "human_status=NULL, human_reviewed_at=NULL, human_reviewed_by=NULL "
        f"WHERE id::text={q(vid)};"
    )
sql = "\n".join(stmts)

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

inner = ('psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -P pager=off '
         "<<'SQL'\n" + sql + "\nSQL\n")
body = {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]}
st, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
url = f"{base}/api/endpoints/{ep}/docker/exec/{ex['Id']}/start"
req = urllib.request.Request(url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST")
req.add_header("X-API-Key", token); req.add_header("Content-Type", "application/json")
raw = urllib.request.urlopen(req, timeout=60).read()
out = "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ").strip()
print("=== resultado ===")
print(out or "(sem saida)")
