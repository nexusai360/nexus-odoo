#!/usr/bin/env python3
# Publica um compose novo na stack `nexus-odoo` do Portainer (o compose e a FONTE
# DA VERDADE da configuracao de producao; ver deploy-portainer.py).
#
# POR QUE EXISTE: o compose da stack so pode ser editado pela API (PUT /api/stacks/{id}),
# e esse PUT dispara um `docker stack deploy`. Para nao correr o risco de recriar
# app+mcp+worker juntos (em 2026-06-12 isso estourou a memoria do no e o OOM killer
# atingiu o Postgres), a regra deste script e:
#
#   PRIMEIRO alinhe os servicos VIVOS (rolling, um por vez, via deploy-portainer.py
#   ou _prod-worker-heap.py); SO DEPOIS publique o compose com os mesmos valores.
#   Assim o `stack deploy` resultante e um no-op de spec: nenhuma task e recriada.
#
# Por isso o script CHECA o drift antes de publicar e se recusa a rodar se o compose
# novo divergir dos servicos vivos, a menos que voce passe --aceitar-recriacao.
#
# Baixar o compose atual (para editar):
#   python3 scripts/_prod-stack-put.py --baixar .prod-backups/compose-atual.yml
# Publicar:
#   python3 scripts/_prod-stack-put.py --arquivo .prod-backups/compose-novo.yml           # dry-run
#   python3 scripts/_prod-stack-put.py --arquivo .prod-backups/compose-novo.yml --aplicar
#
# O compose contem SEGREDOS. Trabalhe sempre dentro de .prod-backups/ (no .gitignore).
import argparse
import difflib
import importlib.util
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("dp", str(RAIZ / "scripts" / "deploy-portainer.py"))
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)


def achar_stack(base, token):
    st, stacks = dp.api("GET", base, "/api/stacks", token)
    if st != 200:
        raise SystemExit(f"erro ao listar stacks: HTTP {st}")
    stack = next((s for s in (stacks or []) if s.get("Name") == dp.STACK_NAME), None)
    if not stack:
        raise SystemExit(f"stack {dp.STACK_NAME} nao encontrada")
    return stack


def baixar(base, token, stack) -> str:
    st, arq = dp.api("GET", base, f"/api/stacks/{stack['Id']}/file", token)
    if st != 200 or not isinstance(arq, dict):
        raise SystemExit(f"erro ao baixar o compose: HTTP {st}")
    return arq["StackFileContent"]


def divergencias_contra_vivos(base, token, ep, conteudo) -> list[str]:
    """O compose NOVO bate com o que os servicos vivos ja tem? Se nao bater, publicar
    vai recriar task , e o script exige que voce diga que aceita isso."""
    compose = dp.parse_yaml(conteudo)
    stack = achar_stack(base, token)
    env_stack = {e["name"]: e.get("value", "") for e in (stack.get("Env") or [])}
    vivos = dp.list_services(base, token, ep)
    fora = []
    for nome, svc in (compose.get("services") or {}).items():
        full = dp.STACK_PREFIX + nome
        vivo = vivos.get(full)
        if not vivo:
            fora.append(f"{full}: servico nao existe no Swarm (seria criado)")
            continue
        tmpl = vivo["Spec"]["TaskTemplate"]
        env_vivo = {
            e.partition("=")[0]: e.partition("=")[2]
            for e in (tmpl["ContainerSpec"].get("Env") or [])
        }
        bruto = svc.get("environment") or []
        itens = (
            [(k, str(v)) for k, v in bruto.items()]
            if isinstance(bruto, dict)
            else [(e.split("=", 1)[0], e.split("=", 1)[1] if "=" in e else "") for e in bruto]
        )
        for k, v in itens:
            alvo = dp._expandir(v, env_stack)
            if env_vivo.get(k) != alvo:
                fora.append(f"{full}: ENV {k} diverge do servico vivo")
        lim = (((svc.get("deploy") or {}).get("resources") or {}).get("limits") or {})
        lim_vivo = (tmpl.get("Resources") or {}).get("Limits") or {}
        m = dp.mem_para_bytes(lim.get("memory"))
        if m is not None and m != (lim_vivo.get("MemoryBytes") or 0):
            fora.append(f"{full}: limite de memoria diverge do servico vivo")
        c = dp.cpu_para_nano(lim.get("cpus"))
        if c is not None and c != (lim_vivo.get("NanoCPUs") or 0):
            fora.append(f"{full}: limite de cpu diverge do servico vivo")
    return fora


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--baixar", metavar="ARQUIVO", help="salva o compose atual e sai")
    p.add_argument("--arquivo", metavar="ARQUIVO", help="compose a publicar")
    p.add_argument("--aplicar", action="store_true", help="publica de fato (default: dry-run)")
    p.add_argument(
        "--aceitar-recriacao",
        action="store_true",
        help="publica mesmo divergindo dos servicos vivos (vai recriar task)",
    )
    args = p.parse_args()

    base, token = dp.resolve_portainer()
    ep = dp.find_endpoint(base, token)
    stack = achar_stack(base, token)
    atual = baixar(base, token, stack)

    if args.baixar:
        alvo = Path(args.baixar)
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_text(atual)
        os.chmod(alvo, 0o600)
        print(f"compose atual salvo em {alvo} ({len(atual)} bytes) , contem segredos")
        return 0

    if not args.arquivo:
        p.error("informe --baixar ou --arquivo")

    novo = Path(args.arquivo).read_text()
    if novo == atual:
        print("o compose enviado e identico ao publicado , nada a fazer")
        return 0

    print("=== diff (publicado -> novo) ===")
    for linha in difflib.unified_diff(
        atual.splitlines(), novo.splitlines(), "publicado", "novo", lineterm="", n=2
    ):
        # Nao ecoa valor de segredo no terminal.
        if linha.startswith(("+", "-")) and any(
            t in linha for t in ("PASSWORD", "SECRET", "TOKEN", "ENCRYPTION_KEY")
        ):
            linha = linha.split("=", 1)[0] + "=<omitido>"
        print(linha)

    fora = divergencias_contra_vivos(base, token, ep, novo)
    print("\n=== o compose novo bate com os servicos VIVOS? ===")
    if fora:
        print("  NAO , publicar vai recriar task nestes pontos:")
        for f in fora:
            print(f"    - {f}")
    else:
        print("  SIM , o `stack deploy` disparado pelo PUT nao muda nenhuma spec (no-op)")

    if not args.aplicar:
        print("\n(dry-run , rode com --aplicar para publicar)")
        return 0
    if fora and not args.aceitar_recriacao:
        raise SystemExit(
            "\nABORTADO: alinhe primeiro os servicos vivos (rolling, um por vez) ou passe "
            "--aceitar-recriacao ciente de que o stack deploy recria tasks."
        )

    corpo = {
        "stackFileContent": novo,
        "env": stack.get("Env") or [],
        "prune": False,
        "pullImage": False,
    }
    st, resp = dp.api(
        "PUT", base, f"/api/stacks/{stack['Id']}?endpointId={ep}", token, body=corpo, timeout=180
    )
    if st not in (200, 201):
        raise SystemExit(f"FALHOU: HTTP {st} {str(resp)[:300]}")
    print(f"\n=== compose publicado (HTTP {st}) ===")
    print("confira com: python3 scripts/_prod-stack-drift.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
