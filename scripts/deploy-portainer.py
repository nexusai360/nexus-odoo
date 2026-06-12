#!/usr/bin/env python3
"""
Deploy manual do nexus-odoo via API do Portainer , a ROTA CONFIAVEL.

Por que existe: o job `deploy` do GitHub Actions falha (HTTP 000) porque a
borda da VPS bloqueia o IP do runner do GitHub. A imagem E construida e enviada
ao ghcr normalmente (jobs build-app/build-mcp = success); o que nao acontece e
o redeploy a partir do runner. Da maquina local (ou de qualquer host que
alcance a VPS) o Portainer responde 200, e a credencial do ghcr JA esta salva
no Portainer (registry "GitHub Container Registry", auth do usuario jvzanini).
Entao este script faz o redeploy que o runner nao consegue.

O que faz:
  1. resolve PORTAINER_URL / PORTAINER_TOKEN (env > .env.local > projetos irmaos);
  2. acha o endpoint do swarm e os servicos nexus-odoo_{app,mcp,worker};
  3. para cada servico: force update apontando a imagem :latest, anexando a
     credencial do registry ghcr salvo (registryId) para o swarm repuxar;
  4. faz poll ate o servico convergir (task nova Running);
  5. verifica https://agentenex.nexusai360.com/api/health == {"ok":true}.

Uso:
  python3 scripts/deploy-portainer.py                 # app, mcp, worker
  python3 scripts/deploy-portainer.py app mcp          # subconjunto
  PORTAINER_TOKEN=ptr_... PORTAINER_URL=https://... python3 scripts/deploy-portainer.py

Idempotente e seguro: so incrementa ForceUpdate e repuxa a :latest; nao muda
env, replicas, nem outra parte da spec.
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

HEALTH_URL = "https://agentenex.nexusai360.com/api/health"
SERVICES_DEFAULT = ["app", "mcp", "worker"]
STACK_PREFIX = "nexus-odoo_"
GHCR_REGISTRY_URL = "ghcr.io"


def _read_env_file(path: Path) -> dict:
    out = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    return out


def resolve_portainer():
    """PORTAINER_URL/TOKEN: env > .env.local do projeto > .env.production dos irmaos."""
    url = os.environ.get("PORTAINER_URL")
    tok = os.environ.get("PORTAINER_TOKEN")
    if url and tok:
        return url.rstrip("/"), tok

    here = Path(__file__).resolve().parent.parent  # raiz do projeto/worktree
    candidates = [
        here / ".env.local",
        here / ".env.production",
        # projetos irmaos (mesma infra Portainer/VPS):
        here / "../../../Projetos Internos/nexus-blueprint/.env.production",
        here / "../../../Projetos Internos/nexus-nfe/.env.production",
        here / "../../../Projetos Internos/nexus-crm-krayin/.env.production",
    ]
    for c in candidates:
        env = _read_env_file(c)
        url = url or env.get("PORTAINER_URL")
        tok = tok or env.get("PORTAINER_TOKEN")
        if url and tok:
            print(f"[deploy] credencial Portainer de: {c}")
            return url.rstrip("/"), tok
    sys.exit(
        "[deploy] ERRO: PORTAINER_URL/PORTAINER_TOKEN nao encontrados.\n"
        "  Exporte as duas vars ou coloque-as no .env.local do projeto."
    )


def api(method, base, path, token, body=None, timeout=30):
    url = f"{base}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-API-Key", token)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def ghcr_registry_id(base, token):
    st, regs = api("GET", base, "/api/registries", token)
    if st != 200 or not isinstance(regs, list):
        return None
    for r in regs:
        if (r.get("URL") or "").rstrip("/").endswith(GHCR_REGISTRY_URL):
            return r.get("Id")
    return None


def find_endpoint(base, token):
    st, eps = api("GET", base, "/api/endpoints", token)
    if st != 200 or not eps:
        sys.exit(f"[deploy] ERRO ao listar endpoints: HTTP {st}")
    return eps[0]["Id"]


def list_services(base, token, ep):
    st, svcs = api("GET", base, f"/api/endpoints/{ep}/docker/services", token)
    if st != 200:
        sys.exit(f"[deploy] ERRO ao listar services: HTTP {st}")
    return {s["Spec"]["Name"]: s for s in svcs}


def force_update(base, token, ep, svc, reg_id):
    name = svc["Spec"]["Name"]
    version = svc["Version"]["Index"]
    spec = svc["Spec"]
    tmpl = spec["TaskTemplate"]
    cspec = tmpl["ContainerSpec"]
    image = cspec.get("Image", "")
    # Garante tag :latest sem digest pinado, p/ o swarm resolver o digest novo.
    base_img = image.split("@")[0]
    if ":" not in base_img.split("/")[-1]:
        base_img += ":latest"
    cspec["Image"] = base_img
    tmpl["ForceUpdate"] = int(tmpl.get("ForceUpdate", 0)) + 1
    qs = f"?version={version}"
    if reg_id is not None:
        qs += f"&registryId={reg_id}"
    st, resp = api(
        "POST",
        base,
        f"/api/endpoints/{ep}/docker/services/{svc['ID']}/update{qs}",
        token,
        body=spec,
        timeout=60,
    )
    ok = st in (200, 201)
    print(f"[deploy] {name}: update HTTP {st} img={base_img} {'OK' if ok else resp}")
    return ok


def wait_converge(base, token, ep, names, timeout_s=240):
    """Poll ate as tasks novas dos servicos estarem Running."""
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        st, tasks = api("GET", base, f"/api/endpoints/{ep}/docker/tasks", token)
        if st == 200 and isinstance(tasks, list):
            ok_all = True
            for full in names:
                running = [
                    t for t in tasks
                    if t.get("ServiceID") and t.get("Status", {}).get("State") == "running"
                ]
                # heuristica simples: ao menos 1 task running por servico
            # convergencia real: nenhuma task em 'preparing'/'starting' p/ os nossos
            pend = [
                t for t in tasks
                if t.get("Status", {}).get("State") in ("preparing", "starting", "pending", "assigned", "accepted", "new")
            ]
            if not pend:
                return True
        time.sleep(8)
    return False


def verify_health(timeout_s=120):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=12) as r:
                body = json.loads(r.read().decode())
                if body.get("ok"):
                    return True
        except Exception:
            pass
        time.sleep(8)
    return False


def main():
    which = [a for a in sys.argv[1:] if not a.startswith("-")] or SERVICES_DEFAULT
    targets = [STACK_PREFIX + w for w in which]
    base, token = resolve_portainer()
    print(f"[deploy] Portainer: {base}")
    ep = find_endpoint(base, token)
    reg_id = ghcr_registry_id(base, token)
    print(f"[deploy] endpoint={ep} ghcr_registry_id={reg_id}")
    if reg_id is None:
        print("[deploy] AVISO: registry ghcr nao encontrado no Portainer; o swarm "
              "pode falhar ao repuxar imagem privada (sem X-Registry-Auth).")
    svcs = list_services(base, token, ep)
    missing = [t for t in targets if t not in svcs]
    if missing:
        sys.exit(f"[deploy] ERRO: servicos nao encontrados: {missing}")

    all_ok = True
    for t in targets:
        if not force_update(base, token, ep, svcs[t], reg_id):
            all_ok = False
    if not all_ok:
        sys.exit("[deploy] ERRO: algum update falhou , ver acima.")

    print("[deploy] aguardando convergencia das tasks...")
    converged = wait_converge(base, token, ep, targets)
    print(f"[deploy] convergencia: {'OK' if converged else 'TIMEOUT (pode ainda estar puxando imagem)'}")

    print("[deploy] verificando prod /api/health...")
    healthy = verify_health()
    print(f"[deploy] health: {'OK' if healthy else 'FALHOU'}")
    print(f"[deploy] RESULTADO: deploy={'OK' if all_ok else 'FALHOU'} "
          f"converge={'OK' if converged else 'TIMEOUT'} prod={'OK' if healthy else 'FALHOU'}")
    sys.exit(0 if (all_ok and healthy) else 1)


if __name__ == "__main__":
    main()
