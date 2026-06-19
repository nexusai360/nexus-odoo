#!/usr/bin/env python3
# Aplica os vereditos do JUIZ (Claude, offline, NUNCA via OpenAI) nas avaliacoes
# PENDENTE de PROD, do jeito CANONICO: status + razoes + patterns + judge_model/
# judge_version; human_status fica NULL (o lapis e so ajuste manual do superadmin).
import importlib.util, json, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

JUDGE_MODEL = "claude-opus-4-8"
JUDGE_VERSION = "manual-cloud-2026-06-19b"

# id -> (status, [patterns], razoes) , conversa da Mariane (comercial/demanda)
V = {
    "84310de4-b935-4b34-83e8-fcb5b5b9127b": (
        "PARCIAL", [],
        "Acertou o total da carteira em aberto (R$ 117.584.364,59 / 517 pedidos), mas para "
        "'produto com mais demanda' trouxe o produto mais FATURADO do mes (T600X), nao a demanda "
        "DENTRO dos pedidos em aberto , misturou duas bases. Foi honesto ao dizer que nao tem a "
        "quebra por produto da carteira. A pergunta tinha 2 partes e a 2a foi respondida com base errada."),
    "f3e6c0c7-abbc-4d76-81ff-dc3d7837e5f8": (
        "CORRETO", ["limitacao_real_declarada"],
        "Corrigiu-se com honestidade: reconheceu que o produto citado vinha do faturado e que nao "
        "consegue fechar a quebra por produto dentro da carteira em aberto. Sem invencao."),
    "888b2842-62c1-4a22-aa6f-40a21a6c0a49": (
        "CORRETO", ["resposta_correta"],
        "Explicou o criterio de 'aberto' (fora de concluido, cancelado e rascunho = carteira ativa) "
        "de forma clara e consistente com o numero ja dado."),
    "aa0dceae-54dd-4064-84bb-542921ec90dd": (
        "CORRETO", ["resposta_correta"],
        "Otimo enquadramento de negocio: separou 'carteira ativa por etapa' de 'sem nota fiscal ainda', "
        "explicou quando usar cada um e o risco de misturar. Conducao consultiva correta."),
    "fd1e5847-0a94-48d8-b2a0-90031b6bd0fc": (
        "CORRETO", ["resposta_correta"],
        "Estruturou bem a definicao de 'demanda em aberta' trazida pela usuaria (aprovado + financeiro "
        "lancado + sem carregamento/NF), alinhando o vocabulario de negocio. Conversacionalmente correto."),
    "6f523142-9bcf-4cef-af6c-ec53bc4ca30a": (
        "PARCIAL", [],
        "Ao pedir para RECALCULAR com a definicao de demanda em aberta, registrou lacuna e respondeu "
        "'nao tenho dados suficientes'. Honesto e registrou o gap (Caminho 3a, correto), MAS o 'nao tenho "
        "dados' subestima: existe fato_pedido com etapas + vrNf (0=nao faturado). Falta a CAPACIDADE de "
        "mapear quais etapas = demanda em aberta (aprovado + financeiro lancado + nao carregado). Gap de "
        "produto real -> tool/criterio de demanda em aberta (item de spec, exige pericia das etapas com o cliente)."),
    "ecee1875-5598-4309-8d98-4906a8aa8af9": (
        "CORRETO", ["resposta_correta"],
        "Posicao financeira respondida com profundidade e formato correto (caixa -R$ 28,3M, a receber "
        "R$ 65,8M, a pagar R$ 87,3M, coberturas -0,32/0,43), com leitura critica honesta."),
    "fdb696af-9051-4e7c-a700-63c17c58e0a1": (
        "CORRETO", ["resposta_correta"],
        "Distinguiu corretamente o lider por QUANTIDADE (Weverton, 102 pedidos) do lider por VALOR "
        "(Jonatas, R$ 16,46M / 61) e avisou que a ordenacao era por valor. Resposta correta e transparente."),
}

def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"

def arr(xs):
    return "ARRAY[]::text[]" if not xs else "ARRAY[" + ",".join(q(x) for x in xs) + "]::text[]"

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
