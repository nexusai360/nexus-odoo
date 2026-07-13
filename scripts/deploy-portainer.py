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
  3. le o compose da stack no Portainer e RECONCILIA a spec viva com ele
     (environment + resources) , ver "RECONCILIACAO" abaixo;
  4. para cada servico: force update apontando a imagem :latest, anexando a
     credencial do registry ghcr salvo (registryId) para o swarm repuxar;
  5. faz poll ate o servico convergir (task nova Running);
  6. verifica https://agentenex.nexusai360.com/api/health == {"ok":true}.

RECONCILIACAO (2026-07-13) , por que existe:
  Ate aqui este script fazia *service update* so da IMAGEM. Ele (e o Shepherd, que
  faz o auto-deploy dentro da VPS) NUNCA reaplicava `environment` nem `resources`
  do compose. Resultado real: o compose da stack declarava heap 4096 / memoria
  4608M no worker enquanto o servico VIVO rodava com heap 1024 / memoria 1536M ,
  o worker morria de OOM em producao e o compose era so papel. Mudanca de
  configuracao no compose era ignorada em silencio.
  Agora o compose da stack e a FONTE DA VERDADE: a cada deploy, env e limites do
  compose sao aplicados na spec do servico junto com a imagem. As mudancas sao
  impressas antes de subir. Variavel que existe SO no servico vivo (nao esta no
  compose) e mantida e reportada , remover env em prod exige decisao humana.
  Nao viramos `docker stack deploy` (opcao descartada) porque ele atualiza os
  servicos em paralelo; em 2026-06-12 recriar app+mcp+worker juntos estourou a
  memoria do no e o OOM killer atingiu o Postgres. O rolling um-a-um daqui e o
  que mantem o pico baixo.

Uso:
  python3 scripts/deploy-portainer.py                 # app, mcp, worker
  python3 scripts/deploy-portainer.py app mcp          # subconjunto
  python3 scripts/deploy-portainer.py --sem-reconciliar   # so a imagem (comportamento antigo)
  PORTAINER_TOKEN=ptr_... PORTAINER_URL=https://... python3 scripts/deploy-portainer.py
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

HEALTH_URL = "https://agentenex.nexusai360.com/api/health"
# Ordem deliberada: worker e mcp primeiro (menos sensiveis), app por ultimo.
SERVICES_DEFAULT = ["worker", "mcp", "app"]
STACK_NAME = "nexus-odoo"
STACK_PREFIX = "nexus-odoo_"
GHCR_REGISTRY_URL = "ghcr.io"
# Pausa entre serviços no rolling (deixa o nó liberar memória/IO entre recriações).
PAUSA_ENTRE_SERVICOS_S = 25
RAIZ = Path(__file__).resolve().parent.parent


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
    candidates = [here / ".env.local", here / ".env.production"]
    # Fallback: sobe a arvore ate achar uma pasta "Projetos Internos" (mesma
    # infra Portainer/VPS) e busca o .env.production dos projetos irmaos.
    for anc in [here, *here.parents]:
        pi = anc / "Projetos Internos"
        if pi.is_dir():
            for irmao in ("nexus-blueprint", "nexus-nfe", "nexus-crm-krayin"):
                candidates.append(pi / irmao / ".env.production")
            break
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


def get_service_fresh(base, token, ep, name):
    """Re-busca um servico pelo nome (versao FRESCA , evita 'out of sequence'
    quando o swarm incrementou a versao entre o GET inicial e o POST)."""
    st, svcs = api("GET", base, f"/api/endpoints/{ep}/docker/services", token)
    if st != 200:
        return None
    for s in svcs:
        if s["Spec"]["Name"] == name:
            return s
    return None


# --------------------------------------------------------------------------
# Compose da stack , a fonte da verdade da configuracao (env + resources).
# --------------------------------------------------------------------------

def parse_yaml(texto):
    """Parseia YAML com o js-yaml do proprio repo (o python do sistema nao tem PyYAML)."""
    js = (
        "const yaml=require('js-yaml');"
        "let s='';process.stdin.on('data',c=>s+=c);"
        "process.stdin.on('end',()=>process.stdout.write(JSON.stringify(yaml.load(s))));"
    )
    r = subprocess.run(["node", "-e", js], input=texto.encode(), capture_output=True, cwd=str(RAIZ))
    if r.returncode != 0:
        raise RuntimeError(f"falha ao parsear o compose com js-yaml: {r.stderr.decode()[:300]}")
    return json.loads(r.stdout.decode())


def _expandir(valor, env_stack):
    """Resolve ${VAR} e ${VAR:-default} com o env da stack (semantica do compose)."""
    def sub(m):
        nome, default = m.group(1), m.group(3)
        return env_stack.get(nome, default if default is not None else "")
    return re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(:?-([^}]*))?\}", sub, str(valor))


def mem_para_bytes(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*([kmgKMG]?)[bB]?\s*", str(v))
    if not m:
        return None
    mult = {"": 1, "k": 1024, "m": 1024 ** 2, "g": 1024 ** 3}[m.group(2).lower()]
    return int(float(m.group(1)) * mult)


def cpu_para_nano(v):
    return None if v is None else int(float(str(v)) * 1_000_000_000)


def carregar_desejado(base, token):
    """Le o compose da stack no Portainer e devolve, por servico completo
    (nexus-odoo_x), o que a configuracao DEVE ser: env, limites e reservas."""
    st, stacks = api("GET", base, "/api/stacks", token)
    if st != 200 or not isinstance(stacks, list):
        raise RuntimeError(f"erro ao listar stacks: HTTP {st}")
    stack = next((s for s in stacks if s.get("Name") == STACK_NAME), None)
    if not stack:
        raise RuntimeError(f"stack {STACK_NAME} nao encontrada no Portainer")
    env_stack = {e["name"]: e.get("value", "") for e in (stack.get("Env") or [])}
    st, arq = api("GET", base, f"/api/stacks/{stack['Id']}/file", token)
    if st != 200 or not isinstance(arq, dict):
        raise RuntimeError(f"erro ao baixar o compose da stack: HTTP {st}")
    compose = parse_yaml(arq["StackFileContent"])

    desejado = {}
    for nome, svc in (compose.get("services") or {}).items():
        bruto = svc.get("environment") or []
        itens = (
            [(k, str(v)) for k, v in bruto.items()]
            if isinstance(bruto, dict)
            else [(e.split("=", 1)[0], e.split("=", 1)[1] if "=" in e else "") for e in bruto]
        )
        rec = ((svc.get("deploy") or {}).get("resources") or {})
        lim = rec.get("limits") or {}
        res = rec.get("reservations") or {}
        desejado[STACK_PREFIX + nome] = {
            "env": {k: _expandir(v, env_stack) for k, v in itens},
            "mem_limite": mem_para_bytes(lim.get("memory")),
            "cpu_limite": cpu_para_nano(lim.get("cpus")),
            "mem_reserva": mem_para_bytes(res.get("memory")),
            "cpu_reserva": cpu_para_nano(res.get("cpus")),
        }
    return desejado


def reconciliar_spec(spec, alvo):
    """Aplica env + resources do compose na spec viva. Devolve a lista do que mudou.
    Nao remove variavel que exista so no servico vivo: apenas reporta (tirar env em
    producao e decisao humana)."""
    mudancas = []
    tmpl = spec["TaskTemplate"]
    cspec = tmpl["ContainerSpec"]
    env_vivo = {}
    ordem = []
    for e in (cspec.get("Env") or []):
        k, _, v = e.partition("=")
        env_vivo[k] = v
        ordem.append(k)

    for k, v in (alvo.get("env") or {}).items():
        if k not in env_vivo:
            ordem.append(k)
            mudancas.append(f"    + ENV {k} (nova, vinda do compose)")
        elif env_vivo[k] != v:
            segredo = any(t in k for t in ("PASSWORD", "SECRET", "TOKEN", "KEY", "URL"))
            mudancas.append(
                f"    ~ ENV {k}"
                + ("" if segredo else f": {env_vivo[k]!r} -> {v!r}")
            )
        env_vivo[k] = v
    for k in ordem:
        if k not in (alvo.get("env") or {}):
            mudancas.append(f"    ! ENV {k}: existe no servico mas nao no compose (mantida)")
    cspec["Env"] = [f"{k}={env_vivo[k]}" for k in ordem]

    recursos = tmpl.setdefault("Resources", {})
    for chave_alvo, bloco, campo, rotulo, fmt in (
        ("mem_limite", "Limits", "MemoryBytes", "limite de memoria", lambda b: f"{round(b/1024/1024)}M"),
        ("cpu_limite", "Limits", "NanoCPUs", "limite de cpu", lambda c: f"{c/1e9:g}"),
        ("mem_reserva", "Reservations", "MemoryBytes", "reserva de memoria", lambda b: f"{round(b/1024/1024)}M"),
        ("cpu_reserva", "Reservations", "NanoCPUs", "reserva de cpu", lambda c: f"{c/1e9:g}"),
    ):
        novo = alvo.get(chave_alvo)
        if novo is None:
            continue  # compose nao declara: nao mexe
        atual = (recursos.get(bloco) or {}).get(campo)
        if (atual or 0) != novo:
            mudancas.append(f"    ~ {rotulo}: {fmt(atual or 0)} -> {fmt(novo)}")
            recursos.setdefault(bloco, {})[campo] = novo
    return mudancas


def force_update(base, token, ep, name, reg_id, tentativas=3, desejado=None):
    # Re-busca a versao FRESCA a cada tentativa (o swarm pode ter mexido na spec
    # logo apos o servico anterior do rolling , causava 'update out of sequence').
    for tent in range(1, tentativas + 1):
        svc = get_service_fresh(base, token, ep, name)
        if svc is None:
            print(f"[deploy] {name}: servico sumiu da lista")
            return False
        version = svc["Version"]["Index"]
        spec = svc["Spec"]
        tmpl = spec["TaskTemplate"]
        cspec = tmpl["ContainerSpec"]
        image = cspec.get("Image", "")
        base_img = image.split("@")[0]
        if ":" not in base_img.split("/")[-1]:
            base_img += ":latest"
        cspec["Image"] = base_img
        if desejado and name in desejado:
            mudancas = reconciliar_spec(spec, desejado[name])
            if mudancas:
                print(f"[deploy] {name}: reconciliando com o compose da stack:")
                print("\n".join(mudancas))
            else:
                print(f"[deploy] {name}: ja em dia com o compose (sem drift)")
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
        if st in (200, 201):
            print(f"[deploy] {name}: update HTTP {st} img={base_img} OK")
            return True
        out_of_seq = isinstance(resp, dict) and "out of sequence" in str(resp.get("message", ""))
        print(f"[deploy] {name}: update HTTP {st} {resp} (tentativa {tent}/{tentativas})")
        if not out_of_seq:
            return False
        time.sleep(4)  # versao mudou; re-busca e tenta de novo
    return False


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

    # O compose da stack e a fonte da verdade da configuracao. Sem isto, o deploy
    # troca so a imagem e qualquer mudanca de env/resources no compose fica no papel
    # (foi o que deixou o worker com 1GB de heap e o derrubou de OOM em 2026-07-12).
    desejado = None
    if "--sem-reconciliar" in sys.argv:
        print("[deploy] AVISO: --sem-reconciliar , env/resources do compose NAO serao aplicados.")
    else:
        try:
            desejado = carregar_desejado(base, token)
            print(f"[deploy] compose da stack lido ({len(desejado)} servicos) , reconciliando env/resources")
        except Exception as e:
            sys.exit(
                f"[deploy] ERRO ao ler o compose da stack: {e}\n"
                "  Sem o compose nao da pra garantir que env/resources em prod estao corretos.\n"
                "  Rode com --sem-reconciliar para deployar so a imagem, ciente do risco."
            )

    # ROLLING, UM SERVICO POR VEZ (licao 2026-06-12): recriar app+mcp+worker
    # simultaneamente estourou a memoria do no e o OOM killer atingiu o
    # Postgres (crash recovery em prod). Atualizar em serie, esperando cada um
    # convergir e o no respirar antes do proximo, mantem o pico de memoria baixo.
    all_ok = True
    for i, t in enumerate(targets):
        if not force_update(base, token, ep, t, reg_id, desejado=desejado):
            all_ok = False
            break
        print(f"[deploy] {t}: aguardando convergir antes do proximo...")
        wait_converge(base, token, ep, [t], timeout_s=180)
        if i < len(targets) - 1:
            time.sleep(PAUSA_ENTRE_SERVICOS_S)  # no respira (memoria/IO)
    if not all_ok:
        sys.exit("[deploy] ERRO: algum update falhou , ver acima.")

    print("[deploy] aguardando convergencia final das tasks...")
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
