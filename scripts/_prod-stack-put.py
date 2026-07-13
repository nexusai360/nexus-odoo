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
#
# LICAO CARA (2026-07-13, aprendida publicando este compose): o `docker stack deploy`
# APAGA do servico tudo que o compose NAO DECLARA. Na primeira publicacao, o compose
# nao trazia `deploy.labels` nem `deploy.update_config`, e o deploy silenciosamente:
#   - removeu o label com.nexus.autodeploy=true de app/mcp/worker , o Shepherd
#     (auto-deploy) so toca servico com esse label, entao o deploy automatico de
#     producao MORREU sem avisar;
#   - removeu UpdateConfig/RollbackConfig (start-first, rollback automatico), fazendo o
#     app cair em stop-first e devolver 502 durante o update.
# Por isso o script hoje checa DOIS lados: valores que MUDAM e, principalmente, o que o
# compose OMITE e o servico vivo tem (labels, update_config, rollback_config). Omissao
# em compose nao e "deixar como esta" , e "apagar".
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


def perdas_por_omissao(compose, vivos) -> list[str]:
    """O que o servico VIVO tem e o compose NAO declara , e que o `stack deploy` vai
    APAGAR. E a checagem mais importante deste script (ver o cabecalho)."""
    perdas = []
    for nome, svc in (compose.get("services") or {}).items():
        full = dp.STACK_PREFIX + nome
        vivo = vivos.get(full)
        if not vivo:
            continue
        spec_viva = vivo["Spec"]
        deploy = svc.get("deploy") or {}

        # Labels do servico. As `com.docker.stack.*` sao postas pelo proprio stack deploy.
        labels_compose = deploy.get("labels") or []
        if isinstance(labels_compose, dict):
            labels_compose = [f"{k}={v}" for k, v in labels_compose.items()]
        chaves_compose = {str(l).split("=", 1)[0] for l in labels_compose}
        for k in (spec_viva.get("Labels") or {}):
            if k.startswith("com.docker.stack."):
                continue
            if k not in chaves_compose:
                perdas.append(f"{full}: LABEL {k} seria APAGADO (o compose nao declara)")

        if spec_viva.get("UpdateConfig") and not deploy.get("update_config"):
            uc = spec_viva["UpdateConfig"]
            perdas.append(
                f"{full}: UpdateConfig seria APAGADO "
                f"(order={uc.get('Order')} failure_action={uc.get('FailureAction')})"
            )
        if spec_viva.get("RollbackConfig") and not deploy.get("rollback_config"):
            perdas.append(f"{full}: RollbackConfig seria APAGADO")
    return perdas


def divergencias_contra_vivos(base, token, ep, conteudo) -> list[str]:
    """O compose NOVO bate com o que os servicos vivos ja tem? Se nao bater, publicar
    vai recriar task , e o script exige que voce diga que aceita isso."""
    compose = dp.parse_yaml(conteudo)
    stack = achar_stack(base, token)
    env_stack = {e["name"]: e.get("value", "") for e in (stack.get("Env") or [])}
    vivos = dp.list_services(base, token, ep)
    fora = perdas_por_omissao(compose, vivos)
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
        print("  NAO , publicar vai mudar/recriar task nestes pontos:")
        for f in fora:
            print(f"    - {f}")
        print(
            "\n  Lembre: o `stack deploy` APAGA o que o compose nao declara. Um 'APAGADO'"
            "\n  acima nao e detalhe , e configuracao de producao sumindo em silencio."
        )
    else:
        print("  SIM , nenhuma mudanca de spec detectada nos campos checados")

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
