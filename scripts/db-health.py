#!/usr/bin/env python3
"""Checa a saude das migrations do banco. Read-only: nao muda nada.

    python3 scripts/db-health.py            # banco de DEV (container local)
    python3 scripts/db-health.py --prod     # banco de PRODUCAO (via Portainer)

Sai com codigo 1 se achar qualquer problema, entao serve em CI/pre-deploy.

O que ele olha, e por que cada coisa importa:

  pendentes    Migration no repo que o banco ainda nao aplicou. Em prod isso
               significa que o codigo pode esperar uma coluna que nao existe.

  orfas        Migration aplicada no banco sem arquivo correspondente no repo.
               Sinal de que alguem aplicou algo a mao, ou de que um arquivo foi
               apagado. O banco tem estado que ninguem sabe reproduzir.

  incompletas  Migration que comecou e nunca terminou (finished_at nulo). O
               banco pode ter ficado no meio de uma alteracao.

  revertidas   Tentativa que falhou e foi marcada como rolled back. Nao quebra
               nada sozinha, mas e ruido que esconde problema de verdade.

  duplicadas   O mesmo migration_name em mais de uma linha. Costuma ser insercao
               manual na tabela de controle.

  checksum     O arquivo mudou depois de ter sido aplicado. `prisma migrate
               deploy` (producao) ignora isso, MAS `prisma migrate dev` (o
               comando que se usa para criar migration nova) se recusa a rodar e
               exige RESET do banco de desenvolvimento, o que apagaria o cache do
               Odoo. E o pior estado silencioso: nada quebra, ate o dia em que
               alguem precisa criar uma migration.

REGRA que este script existe para proteger (ver docs/runbooks/db-migrations.md):
migration aplicada e imutavel. Correcao se faz com migration NOVA, nunca editando
a antiga. E toda mudanca de schema nasce como migration, nunca como DDL solto.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DEV_CONTAINER = os.environ.get("NEXUS_DEV_DB_CONTAINER", "nexus-odoo-db-1")
DEV_DB = os.environ.get("NEXUS_DEV_DB", "nexus_odoo_l1")
DEV_USER = os.environ.get("NEXUS_DEV_DB_USER", "nexus")

CONSULTA = (
    "SELECT migration_name, checksum, (finished_at IS NOT NULL), "
    "(rolled_back_at IS NOT NULL) FROM _prisma_migrations"
)


def checksums_do_repo() -> dict[str, str]:
    """sha256 de cada migration.sql , o mesmo hash que o Prisma grava."""
    caminhos = sorted((RAIZ / "prisma" / "migrations").glob("*/migration.sql"))
    return {c.parent.name: hashlib.sha256(c.read_bytes()).hexdigest() for c in caminhos}


# O `docker exec` via Portainer devolve o stdout multiplexado: cada frame comeca
# com 8 bytes de cabecalho, e alguns deles sao caracteres imprimiveis que grudam
# no inicio da linha (ja apareceu ",20260522..."). Por isso nao da para confiar em
# split simples: casamos o formato esperado em qualquer posicao da linha.
LINHA = re.compile(r"(2\d{13}_[a-z0-9_]+)\|([0-9a-f]{64}|[\w-]+)\|([tf])\|([tf])")


def _parse(saida: str) -> list[tuple[str, str, bool, bool]]:
    linhas = []
    for bruta in saida.split("\n"):
        limpa = "".join(c for c in bruta if c.isprintable())
        m = LINHA.search(limpa)
        if m:
            linhas.append((m.group(1), m.group(2), m.group(3) == "t", m.group(4) == "t"))
    return linhas


def ler_dev() -> list[tuple[str, str, bool, bool]]:
    r = subprocess.run(
        ["docker", "exec", DEV_CONTAINER, "psql", "-U", DEV_USER, "-d", DEV_DB,
         "-A", "-t", "-F", "|", "-c", CONSULTA],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise SystemExit(f"nao consegui ler o banco de dev: {r.stderr.strip()}")
    return _parse(r.stdout)


def _exec_prod(cmd: str) -> str:
    """Roda um comando no container do banco de PRODUCAO, via Portainer. Read-only."""
    spec = importlib.util.spec_from_file_location("dp", str(RAIZ / "scripts" / "deploy-portainer.py"))
    dp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(dp)
    base, token = dp.resolve_portainer()
    ep = dp.find_endpoint(base, token)

    filtro = urllib.parse.quote(json.dumps({"service": ["nexus-odoo_db"], "desired-state": ["running"]}))
    _, tarefas = dp.api("GET", base, f"/api/endpoints/{ep}/docker/tasks?filters={filtro}", token)
    cid = next(
        (t["Status"]["ContainerStatus"]["ContainerID"]
         for t in (tarefas or [])
         if (t.get("Status") or {}).get("ContainerStatus", {}).get("ContainerID")),
        None,
    )
    if not cid:
        raise SystemExit("nao achei o container do banco de producao rodando")

    _, ex = dp.api("POST", base, f"/api/endpoints/{ep}/docker/containers/{cid}/exec", token,
                   {"AttachStdout": True, "AttachStderr": True, "Cmd": ["sh", "-c", cmd]})
    req = urllib.request.Request(
        f"{base}/api/endpoints/{ep}/docker/exec/{ex['Id']}/start",
        data=json.dumps({"Detach": False, "Tty": False}).encode(), method="POST",
    )
    req.add_header("X-API-Key", token)
    req.add_header("Content-Type", "application/json")
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")


def ler_prod() -> list[tuple[str, str, bool, bool]]:
    cmd = f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -F "|" -c "{CONSULTA}"'
    return _parse(_exec_prod(cmd))


def contar_linhas(prod: bool) -> int:
    """COUNT(*) da tabela de controle, para conferir se a leitura veio inteira."""
    sql = "SELECT count(*) FROM _prisma_migrations"
    if prod:
        bruto = _exec_prod(f'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -A -t -c "{sql}"')
    else:
        r = subprocess.run(
            ["docker", "exec", DEV_CONTAINER, "psql", "-U", DEV_USER, "-d", DEV_DB,
             "-A", "-t", "-c", sql],
            capture_output=True, text=True,
        )
        bruto = r.stdout
    m = re.search(r"\b(\d+)\b", "".join(c for c in bruto if c.isprintable()))
    if not m:
        raise SystemExit("nao consegui contar as linhas da tabela de controle")
    return int(m.group(1))


def main() -> None:
    prod = "--prod" in sys.argv
    alvo = "PRODUCAO" if prod else "DEV"
    repo = checksums_do_repo()
    linhas = ler_prod() if prod else ler_dev()

    # Sanidade do proprio parser: o banco diz quantas linhas existem. Se lemos
    # menos, alguma se perdeu no stream e o relatorio inventaria "pendentes".
    total = contar_linhas(prod)
    if len(linhas) != total:
        raise SystemExit(
            f"ABORTADO: a tabela de controle tem {total} linhas, mas so consegui ler {len(linhas)}. "
            "O relatorio seria mentiroso. Investigar a leitura antes de confiar no resultado."
        )

    aplicadas = {n: c for n, c, ok, rb in linhas if ok and not rb}
    contagem: dict[str, int] = {}
    for n, _, ok, rb in linhas:
        if not rb:
            contagem[n] = contagem.get(n, 0) + 1

    problemas = {
        "pendentes (no repo, nao aplicadas)": sorted(set(repo) - set(aplicadas)),
        "orfas (aplicadas, sem arquivo)": sorted(set(aplicadas) - set(repo)),
        "incompletas (nunca terminaram)": sorted(n for n, _, ok, rb in linhas if not ok and not rb),
        "revertidas (tentativa que falhou)": sorted(n for n, _, _, rb in linhas if rb),
        "duplicadas (mesmo nome, varias linhas)": sorted(n for n, q in contagem.items() if q > 1),
        "checksum divergente (arquivo mudou depois de aplicado)":
            sorted(n for n in set(aplicadas) & set(repo) if aplicadas[n] != repo[n]),
    }

    print(f"banco: {alvo}")
    print(f"migrations no repo: {len(repo)} | linhas na tabela de controle: {len(linhas)}")
    print()

    achou = False
    for rotulo, itens in problemas.items():
        if itens:
            achou = True
            print(f"  [PROBLEMA] {rotulo}: {len(itens)}")
            for i in itens[:10]:
                print(f"      - {i}")
            if len(itens) > 10:
                print(f"      ... e mais {len(itens) - 10}")
        else:
            print(f"  [ok] {rotulo}: nenhuma")

    print()
    if achou:
        print("RESULTADO: banco COM PENDENCIA. Ver docs/runbooks/db-migrations.md antes de mexer.")
        sys.exit(1)
    print("RESULTADO: banco saudavel.")
    print("Falta so o drift (estrutura real x schema.prisma), que o Prisma mede:")
    print("  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma")


if __name__ == "__main__":
    main()
