#!/usr/bin/env python3
# Mede o PICO real de memoria de um container da stack de producao, amostrando o
# endpoint de stats do Docker pelo Portainer.
#
# POR QUE EXISTE: o teto de memoria do worker (4608M) veio do compose, nao de medicao.
# Para apertar o teto com seguranca e preciso saber quanto o ciclo de sync realmente
# consome no pico. Este script fica amostrando durante um ciclo completo e reporta:
# pico de uso, media, teto do container e a folga.
#
# Somente leitura: nao altera nada em producao.
#
# Uso:
#   python3 scripts/_prod-worker-mem.py                       # worker, 15 min, amostra a cada 10s
#   python3 scripts/_prod-worker-mem.py --servico app --min 5
import argparse
import importlib.util
import time
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dp", str(RAIZ / "scripts" / "deploy-portainer.py"))
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)


def mb(b) -> float:
    return round((b or 0) / 1024 / 1024, 1)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--servico", default="worker")
    p.add_argument("--min", type=float, default=15.0, help="duracao da medicao em minutos")
    p.add_argument("--intervalo", type=float, default=10.0, help="segundos entre amostras")
    args = p.parse_args()

    base, token = dp.resolve_portainer()
    ep = dp.find_endpoint(base, token)
    alvo = dp.STACK_PREFIX + args.servico

    def achar_container() -> str | None:
        st, conts = dp.api("GET", base, f"/api/endpoints/{ep}/docker/containers/json", token)
        if st != 200:
            return None
        c = next(
            (
                c for c in conts
                if (c.get("Labels") or {}).get("com.docker.swarm.service.name") == alvo
                and c.get("State") == "running"
            ),
            None,
        )
        return c["Id"] if c else None

    cid = achar_container()
    if cid is None:
        raise SystemExit(f"container do servico {alvo} nao encontrado no no")
    print(f"[mem] {alvo} container={cid[:12]} , amostrando {args.min} min a cada {args.intervalo}s\n")

    pico = 0
    soma = 0.0
    n = 0
    limite = 0
    fim = time.time() + args.min * 60
    while time.time() < fim:
        st, s = dp.api(
            "GET", base, f"/api/endpoints/{ep}/docker/containers/{cid}/stats?stream=false", token,
            timeout=30,
        )
        if st == 200 and isinstance(s, dict):
            ms = s.get("memory_stats") or {}
            uso = ms.get("usage", 0)
            if not uso:
                # Stats vazio: ou a task foi recriada (deploy/restart) e este container
                # id morreu, ou a leitura pegou a janela entre dois samples. Re-resolve o
                # container pelo label do servico e segue medindo.
                novo = achar_container()
                if novo and novo != cid:
                    cid = novo
                    print(f"  {datetime.now():%H:%M:%S}  task recriada , seguindo em {cid[:12]}")
                time.sleep(args.intervalo)
                continue
            # `usage` inclui page cache; o numero que importa para OOM e usage - inactive_file.
            inativo = ((ms.get("stats") or {}).get("inactive_file")) or 0
            real = max(uso - inativo, 0)
            limite = ms.get("limit", limite)
            pico = max(pico, real)
            soma += real
            n += 1
            print(
                f"  {datetime.now():%H:%M:%S}  uso={mb(real)}M  (bruto={mb(uso)}M)  pico={mb(pico)}M"
            )
        time.sleep(args.intervalo)

    if not n:
        raise SystemExit("nenhuma amostra coletada")
    print("\n=== RESUMO ===")
    print(f"servico        : {alvo}")
    print(f"amostras       : {n} em {args.min} min")
    print(f"pico           : {mb(pico)}M")
    print(f"media          : {mb(soma / n)}M")
    print(f"teto (container): {mb(limite)}M")
    if limite:
        print(f"folga sobre o pico: {mb(limite - pico)}M ({round(100 * pico / limite)}% do teto usado)")


if __name__ == "__main__":
    main()
