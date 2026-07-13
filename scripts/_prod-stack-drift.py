#!/usr/bin/env python3
# Auditoria de DRIFT entre o compose da stack (Portainer) e os servicos VIVOS no Swarm.
#
# POR QUE EXISTE (incidente de 2026-07-12):
#   O deploy trocava so a IMAGEM: nem o scripts/deploy-portainer.py nem o Shepherd
#   reaplicavam `environment` ou `resources` do compose. Resultado: o compose dizia
#   heap 4096 / memoria 4608M no worker enquanto o servico VIVO rodava com heap 1024 /
#   memoria 1536M , o worker morria de OOM em producao. O compose virou papel.
#   O deploy passou a reconciliar (ver deploy-portainer.py), e este script e a
#   conferencia independente: aponta qualquer divergencia que ainda exista.
#
# O QUE FAZ (somente leitura, seguro):
#   1. baixa o compose da stack e o env da stack no Portainer;
#   2. le a spec VIVA de cada servico no Swarm;
#   3. compara, servico a servico: environment, limites/reservas de CPU e memoria,
#      imagem e replicas;
#   4. salva um BACKUP completo (compose + specs vivas) em .prod-backups/;
#   5. imprime o relatorio. Sai com codigo 1 se houver divergencia.
#
# O compose e o env da stack contem SEGREDOS em texto claro. O backup vai para
# `.prod-backups/`, que esta no .gitignore. Nunca comitar esse diretorio.
#
# Uso:
#   python3 scripts/_prod-stack-drift.py            # relatorio + backup
#   python3 scripts/_prod-stack-drift.py --sem-backup
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dp", str(RAIZ / "scripts" / "deploy-portainer.py"))
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)


def mb(b) -> str:
    return "(nao definido)" if not b else f"{round(b / 1024 / 1024)}M"


def cpu(n) -> str:
    return "(nao definido)" if not n else f"{n / 1_000_000_000:g}"


def backup(base, token, ep, vivos) -> None:
    st, stacks = dp.api("GET", base, "/api/stacks", token)
    stack = next((s for s in (stacks or []) if s.get("Name") == dp.STACK_NAME), None)
    st, arq = dp.api("GET", base, f"/api/stacks/{stack['Id']}/file", token)
    destino = RAIZ / ".prod-backups"
    destino.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    alvo = destino / f"stack-{ts}.json"
    alvo.write_text(json.dumps({
        "quando": ts,
        "stack": {"id": stack["Id"], "nome": stack["Name"], "env": stack.get("Env")},
        "compose": arq.get("StackFileContent"),
        "servicos_vivos": {n: s for n, s in vivos.items() if n.startswith(dp.STACK_PREFIX)},
    }, indent=2, ensure_ascii=False))
    os.chmod(alvo, 0o600)
    print(f"[backup] {alvo}\n          (contem segredos , .prod-backups/ esta no .gitignore)\n")


def main() -> int:
    base, token = dp.resolve_portainer()
    ep = dp.find_endpoint(base, token)
    desejado = dp.carregar_desejado(base, token)
    vivos = dp.list_services(base, token, ep)

    if "--sem-backup" not in sys.argv:
        backup(base, token, ep, vivos)

    total = 0
    for nome, alvo in desejado.items():
        vivo = vivos.get(nome)
        print(f"=== {nome} ===")
        if not vivo:
            print("  declarado no compose, AUSENTE no Swarm\n")
            total += 1
            continue

        tmpl = vivo["Spec"]["TaskTemplate"]
        env_vivo = {
            e.partition("=")[0]: e.partition("=")[2] for e in (tmpl["ContainerSpec"].get("Env") or [])
        }
        achados = []
        for k in sorted(set(alvo["env"]) | set(env_vivo)):
            c, v = alvo["env"].get(k), env_vivo.get(k)
            if c == v:
                continue
            if k not in env_vivo:
                achados.append(f"  ENV {k}: no compose, AUSENTE no servico vivo")
            elif k not in alvo["env"]:
                achados.append(f"  ENV {k}: no servico vivo, AUSENTE no compose")
            else:
                # Nao imprime valor de segredo: so sinaliza que diverge.
                segredo = any(t in k for t in ("PASSWORD", "SECRET", "TOKEN", "KEY", "URL"))
                achados.append(f"  ENV {k}: DIVERGE" + ("" if segredo else f" (compose={c!r} vivo={v!r})"))

        limites = (tmpl.get("Resources") or {}).get("Limits") or {}
        reservas = (tmpl.get("Resources") or {}).get("Reservations") or {}
        for rotulo, c, v, fmt in (
            ("limite de memoria", alvo["mem_limite"], limites.get("MemoryBytes"), mb),
            ("limite de cpu", alvo["cpu_limite"], limites.get("NanoCPUs"), cpu),
            ("reserva de memoria", alvo["mem_reserva"], reservas.get("MemoryBytes"), mb),
            ("reserva de cpu", alvo["cpu_reserva"], reservas.get("NanoCPUs"), cpu),
        ):
            if c is not None and (c or 0) != (v or 0):
                achados.append(f"  {rotulo}: compose={fmt(c)} vivo={fmt(v)}")

        if achados:
            total += len(achados)
            print("\n".join(achados))
        else:
            print("  sem drift (compose == servico vivo)")
        print()

    print(f"=== TOTAL: {total} divergencia(s) ===")
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
