#!/usr/bin/env python3
"""
ship.py , CAMINHO DAS PEDRAS do deploy do nexus-odoo. UMA rota validada, sempre a
mesma, pra nunca mais improvisar:

  branch (pushada) -> PR -> espera CI 'validate' verde -> squash-merge -> espera o
  Build and Push (build-app/build-mcp/deploy) -> verifica prod /api/health.

Resiliente ao bug de rota da API do GitHub: api.github.com as vezes resolve pra um
IP Azure (4.228.31.149) inalcancavel desta rede; os IPs classicos (140.82.x) funcionam.
Este script fala com a API conectando direto nos IPs que funcionam (SNI=api.github.com),
entao independe do `gh` e do /etc/hosts.

Uso (da pasta do projeto, com a branch ja pushada):
  python3 scripts/ship.py "titulo do PR"        # cria PR, espera CI, mergeia, deploya, verifica
  python3 scripts/ship.py --merge-only <PR#>    # so mergeia um PR existente + deploy + verify

Token: usa `gh auth token`. Repo: nexusai360/nexus-odoo. Base: main.
"""
import http.client, ssl, socket, json, os, sys, time, subprocess

REPO = "nexusai360/nexus-odoo"
BASE = "main"
# A branch de origem do PR é a branch ATUAL do git (cada worktree/sessão mergeia
# a sua), nunca um valor fixo , um valor fixo já apontou para a branch errada e
# quase mergeou trabalho de outra frente. Para mergear um PR já aberto sem
# depender da branch local, use `--merge-only <PR#>`.
HEALTH = "https://agentenex.nexusai360.com/api/health"
API_HOST = "api.github.com"
# IPs classicos do GitHub (ASN proprio), reachable mesmo quando o front Azure nao esta.
API_IPS = ["140.82.112.6", "140.82.113.6", "140.82.121.6", "140.82.114.6"]
CTX = ssl.create_default_context()


def _token() -> str:
    return subprocess.check_output(["gh", "auth", "token"]).decode().strip()


def api(method: str, path: str, token: str, body=None):
    """Chama a API do GitHub conectando num IP que funciona (contorna a rota quebrada)."""
    last = None
    for ip in API_IPS:
        try:
            conn = http.client.HTTPSConnection(API_HOST, 443, timeout=30, context=CTX)
            conn._create_connection = lambda a, *x, **k: socket.create_connection((ip, 443), timeout=30)
            h = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "nexus-ship",
                "Content-Type": "application/json",
            }
            conn.request(method, path, body=json.dumps(body) if body else None, headers=h)
            r = conn.getresponse()
            d = r.read().decode()
            conn.close()
            return r.status, (json.loads(d) if d.strip() else {})
        except Exception as e:  # IP indisponivel -> tenta o proximo
            last = e
            continue
    raise RuntimeError(f"API GitHub inalcancavel em todos os IPs: {last}")


def head_sha() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip()


def current_branch() -> str:
    """Branch git atual da worktree , a origem do PR."""
    return (
        subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"])
        .decode()
        .strip()
    )


def wait_ci(token: str, sha: str, timeout_s=900) -> bool:
    """Espera o check 'validate' (ci.yml) ficar verde para o SHA."""
    print(f"[ship] aguardando CI 'validate' em {sha[:8]} ...")
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        _, cr = api("GET", f"/repos/{REPO}/commits/{sha}/check-runs", token)
        runs = {c["name"]: (c["status"], c.get("conclusion")) for c in cr.get("check_runs", [])}
        val = runs.get("validate")
        if val:
            status, concl = val
            if status == "completed":
                print(f"[ship] validate: {concl}")
                return concl == "success"
        time.sleep(15)
    print("[ship] timeout esperando CI")
    return False


def wait_build_deploy(token: str, timeout_s=1200, head_sha: str | None = None) -> bool:
    """Espera o Build and Push DO COMMIT mergeado concluir e reporta os 3 jobs.

    2026-06-12: sem o filtro head_sha o ship lia o run ERRADO (o anterior, ja
    success) e declarava deploy=OK enquanto o run novo nem tinha comecado ,
    foi assim que o deploy fantasma do #105 passou despercebido.
    """
    print(f"[ship] aguardando Build and Push (deploy) na main {('sha '+head_sha[:9]) if head_sha else ''}...")
    t0 = time.time()
    run_id = None
    while time.time() - t0 < timeout_s:
        q = f"/repos/{REPO}/actions/workflows/build.yml/runs?branch=main&per_page=5"
        if head_sha:
            q += f"&head_sha={head_sha}"
        _, runs = api("GET", q, token)
        wr = runs.get("workflow_runs", [])
        if not wr:
            time.sleep(10); continue
        run = wr[0]; run_id = run["id"]
        if run["status"] == "completed":
            _, jobs = api("GET", f"/repos/{REPO}/actions/runs/{run_id}/jobs", token)
            for j in jobs.get("jobs", []):
                print(f"   {j['name']}: {j['conclusion']}")
            return run.get("conclusion") == "success"
        time.sleep(15)
    print("[ship] timeout esperando deploy")
    return False


def rerun_failed(token: str, head_sha: str | None = None):
    q = f"/repos/{REPO}/actions/workflows/build.yml/runs?branch=main&per_page=5"
    if head_sha:
        q += f"&head_sha={head_sha}"
    _, runs = api("GET", q, token)
    wr = runs.get("workflow_runs", [])
    if wr:
        rid = wr[0]["id"]
        print(f"[ship] deploy falhou (provavel blip); rerun 1x do run {rid} ...")
        api("POST", f"/repos/{REPO}/actions/runs/{rid}/rerun-failed-jobs", token)
        return wait_build_deploy(token, head_sha=head_sha)
    return False


def verify_prod() -> bool:
    import urllib.request
    try:
        with urllib.request.urlopen(HEALTH, timeout=12) as r:
            ok = b'"ok":true' in r.read()
            print(f"[ship] prod /api/health: {'OK' if ok else 'FALHOU'}")
            return ok
    except Exception as e:
        print(f"[ship] prod inacessivel: {e}")
        return False


def main():
    token = _token()
    args = sys.argv[1:]
    if args and args[0] == "--merge-only":
        num = int(args[1])
    else:
        title = args[0] if args else "deploy"
        head = current_branch()
        if head in ("main", "HEAD", ""):
            print(f"[ship] branch atual inválida para abrir PR: '{head}'. "
                  f"Rode da branch de feature, ou use --merge-only <PR#>.")
            sys.exit(1)
        print(f"[ship] branch de origem: {head}")
        sha = head_sha()
        _, prs = api("GET", f"/repos/{REPO}/pulls?head=nexusai360:{head}&state=open", token)
        if isinstance(prs, list) and prs:
            num = prs[0]["number"]; print(f"[ship] PR existente #{num}")
        else:
            st, pr = api("POST", f"/repos/{REPO}/pulls", token,
                         {"title": title, "head": head, "base": BASE, "body": "Deploy via scripts/ship.py (caminho padronizado)."})
            num = pr.get("number"); print(f"[ship] PR criado #{num} (status {st})")
        if not wait_ci(token, sha):
            print("[ship] CI nao ficou verde , ABORTANDO o merge."); sys.exit(1)
    # merge
    st, d = api("PUT", f"/repos/{REPO}/pulls/{num}/merge", token, {"merge_method": "squash"})
    print(f"[ship] merge #{num}: {st} merged={d.get('merged')} {d.get('message','')}")
    merge_sha = d.get("sha")
    if not d.get("merged") and "already merged" not in str(d.get("message", "")).lower():
        sys.exit(1)
    # deploy
    ok = wait_build_deploy(token, head_sha=merge_sha)
    if not ok:
        ok = rerun_failed(token, head_sha=merge_sha)
    # verify
    time.sleep(25)
    prod = verify_prod()
    print(f"[ship] RESULTADO: deploy={'OK' if ok else 'FALHOU'} prod={'OK' if prod else 'FALHOU'}")
    sys.exit(0 if (ok and prod) else 1)


if __name__ == "__main__":
    main()
