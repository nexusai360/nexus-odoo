#!/usr/bin/env python3
# Inspeciona (e opcionalmente destrava) os locks de ciclo do worker no Redis de PROD.
#
# Por que existe: o worker serializa os ciclos de sync com um lock no Redis
# (`odoo-sync:lock:<ciclo>`, ver adquirirLock em src/worker/index.ts). O lock tem TTL,
# entao ele sempre expira sozinho , mas quando o container e morto no meio de um ciclo
# (deploy, OOM), o lock sobrevive ao processo e o worker novo fica pulando os ciclos
# ("ciclo X ainda rodando (lock) , pulado") ate o TTL vencer. Este script mostra os locks
# vivos com o TTL restante e, com --destravar, apaga SOMENTE as chaves de lock.
#
# DESDE 2026-07-13 o lock tem DONO e HEARTBEAT (src/worker/sync/ciclo-lock.ts): TTL de 90s,
# renovado a cada 30s por quem o detem. Processo morto para de renovar e o lock cai sozinho
# em no maximo 90s , o --destravar virou paliativo de excecao, nao rotina. No `valor` da
# chave voce agora ve o dono (hostname:pid:uuid), nao mais um timestamp solto.
#
# Uso:
#   python3 scripts/_prod-redis-lock.py              # so lista (seguro)
#   python3 scripts/_prod-redis-lock.py --observar   # amostra por 4 min (ve o lock durante o ciclo)
#   python3 scripts/_prod-redis-lock.py --destravar  # apaga as chaves odoo-sync:lock:*
#
# Reusa a credencial do Portainer via deploy-portainer.py (mesmo padrao dos demais _prod-*).
import importlib.util, json, sys, time, urllib.parse, urllib.request

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

PREFIXO = "odoo-sync:lock:"


def container_do_redis() -> str:
    filtro = urllib.parse.quote('{"service":["nexus-odoo_redis"],"desired-state":["running"]}')
    _, tasks = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters={filtro}", token)
    for t in tasks or []:
        cid = ((t.get("Status") or {}).get("ContainerStatus") or {}).get("ContainerID")
        if cid:
            return cid
    raise SystemExit("nao achei container running do redis (nexus-odoo_redis)")


def exec_sh(cid: str, inner: str) -> str:
    body = {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", inner]}
    _, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token, body)
    url = f"{base}/api/endpoints/{ep}/docker/exec/{ex.get('Id')}/start"
    req = urllib.request.Request(
        url, data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST"
    )
    req.add_header("X-API-Key", token)
    req.add_header("Content-Type", "application/json")
    raw = urllib.request.urlopen(req, timeout=40).read()
    return "".join(c for c in raw.decode("utf-8", "replace") if c in "\t\n" or c >= " ").strip()


cid = container_do_redis()
print("container redis:", cid[:12])

# Lista os locks vivos com o TTL restante (em segundos).
listar = (
    f'for k in $(redis-cli --scan --pattern "{PREFIXO}*"); do '
    'echo "$k ttl=$(redis-cli ttl "$k")s valor=$(redis-cli get "$k")"; done'
)
locks = exec_sh(cid, listar)
print("=== locks vivos ===")
print(locks if locks else "(nenhum)")

if "--observar" in sys.argv:
    # Amostra por 4 min. Serve para ver o lock EXISTINDO durante um ciclo (o ciclo dura
    # segundos, entao uma leitura isolada quase sempre pega "nenhum") e para conferir, em
    # producao, que o TTL e o novo (<=90s) e que o valor traz o dono.
    print("\n=== observando por 4 min (amostra a cada 5s) ===")
    vistos = 0
    for _ in range(48):
        agora = exec_sh(cid, listar)
        if agora:
            vistos += 1
            print(f"  {time.strftime('%H:%M:%S')}  {agora}")
        time.sleep(5)
    print(f"\nlocks capturados: {vistos}")
    if not vistos:
        print("(nenhum lock apareceu na janela , o ciclo pode nao ter rodado agora)")

if "--destravar" in sys.argv:
    if not locks:
        print("=== nada a destravar ===")
        raise SystemExit(0)
    # Apaga SOMENTE as chaves de lock do ciclo. Nao toca em fila, scheduler nem cache.
    apagar = f'redis-cli --scan --pattern "{PREFIXO}*" | xargs -r redis-cli del'
    print("=== destravando ===")
    print("chaves apagadas:", exec_sh(cid, apagar))
    print("=== locks apos ===")
    print(exec_sh(cid, listar) or "(nenhum)")
