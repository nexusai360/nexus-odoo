#!/usr/bin/env python3
"""
Rebalanceia a RAM (Limits.MemoryBytes) dos services do swarm nexus-odoo via API
do Portainer. Motivo: o Postgres (nexus-odoo_db) esta com teto HARD de 1GB e o
backend sofre OOM interno (cgroup) durante o reconcile pesado -> "the database
system is not yet accepting connections" recorrente -> modelos sped.produto e
sped.produto.lote.serie presos em 'erro'. Fix: db 1GB->2GB, tirando do worker
(4.5GB ocioso -> 3GB). Net no no: -0.5GB.

So altera TaskTemplate.Resources.Limits.MemoryBytes. NAO muda imagem, CPU,
reservas, env, replicas. Idempotente (se ja estiver no alvo, pula).

ATENCAO: alterar Resources RECRIA a task do servico.
  - worker: restart inofensivo (cron de sync resume sozinho).
  - db: ~30s OFFLINE do Postgres de PROD (app/mcp perdem o DB nessa janela).
    Exige confirmacao do usuario.

Uso:
  python3 scripts/_rebalance-db-memory.py --dry-run        # mostra o plano, nao aplica
  python3 scripts/_rebalance-db-memory.py worker           # so o worker (inofensivo)
  python3 scripts/_rebalance-db-memory.py db               # so o db (RECRIA, ~30s offline)
  python3 scripts/_rebalance-db-memory.py                  # worker e depois db
"""
import importlib.util, sys, time

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)

GB = 1024 * 1024 * 1024
# Alvos de memoria (Limits.MemoryBytes) por servico curto.
ALVOS = {
    "worker": 3 * GB,   # 4.5GB -> 3GB (ocioso; sobra folga p/ o db)
    "db":     2 * GB,   # 1GB   -> 2GB (corrige o OOM interno do Postgres)
}


def set_memory_limit(base, token, ep, name, target_bytes, dry_run, tentativas=4):
    """GET fresco -> set Limits.MemoryBytes -> POST update?version. Preserva o resto."""
    for tent in range(1, tentativas + 1):
        svc = dp.get_service_fresh(base, token, ep, name)
        if svc is None:
            print(f"[mem] {name}: servico nao encontrado"); return False
        version = svc["Version"]["Index"]
        spec_ = svc["Spec"]
        tmpl = spec_.setdefault("TaskTemplate", {})
        res = tmpl.setdefault("Resources", {})
        limits = res.setdefault("Limits", {})
        atual = limits.get("MemoryBytes")
        img = (tmpl.get("ContainerSpec") or {}).get("Image", "")
        atual_mb = f"{int(atual)/1024/1024:.0f}MB" if atual else "sem limite"
        alvo_mb = f"{target_bytes/1024/1024:.0f}MB"
        print(f"[mem] {name}: atual={atual_mb} -> alvo={alvo_mb} (img={img.split('@')[0][:60]})")
        if atual is not None and int(atual) == int(target_bytes):
            print(f"[mem] {name}: ja esta no alvo, nada a fazer."); return True
        if dry_run:
            print(f"[mem] {name}: DRY-RUN, nao aplicado."); return True
        limits["MemoryBytes"] = int(target_bytes)
        st, resp = dp.api(
            "POST", base,
            f"/api/endpoints/{ep}/docker/services/{svc['ID']}/update?version={version}",
            token, body=spec_, timeout=60)
        if st in (200, 201):
            print(f"[mem] {name}: update HTTP {st} OK (RECRIANDO task)"); return True
        out_of_seq = isinstance(resp, dict) and "out of sequence" in str(resp.get("message", ""))
        print(f"[mem] {name}: update HTTP {st} {resp} (tentativa {tent}/{tentativas})")
        if not out_of_seq:
            return False
        time.sleep(4)
    return False


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry_run = "--dry-run" in sys.argv
    which = args or ["worker", "db"]  # worker primeiro (inofensivo), db por ultimo
    for w in which:
        if w not in ALVOS:
            sys.exit(f"[mem] alvo desconhecido: {w} (use {list(ALVOS)})")
    base, token = dp.resolve_portainer()
    ep = dp.find_endpoint(base, token)
    print(f"[mem] Portainer={base} endpoint={ep} dry_run={dry_run}")
    full = ["nexus-odoo_" + w for w in which]
    ok_all = True
    for i, w in enumerate(which):
        name = "nexus-odoo_" + w
        if w == "db" and not dry_run:
            print("[mem] >>> ATENCAO: recriando o nexus-odoo_db (Postgres de PROD). "
                  "~30s OFFLINE a partir de agora. <<<")
        if not set_memory_limit(base, token, ep, name, ALVOS[w], dry_run):
            ok_all = False; break
        if not dry_run:
            print(f"[mem] {name}: aguardando convergir...")
            dp.wait_converge(base, token, ep, [name], timeout_s=180)
            if i < len(which) - 1:
                time.sleep(15)  # no respira entre recriacoes
    if dry_run:
        print("[mem] DRY-RUN concluido (nada aplicado)."); return
    if not ok_all:
        sys.exit("[mem] ERRO: algum update falhou , ver acima.")
    print("[mem] verificando prod /api/health...")
    healthy = dp.verify_health()
    print(f"[mem] health: {'OK' if healthy else 'FALHOU (db pode ainda estar subindo)'}")
    print(f"[mem] RESULTADO: updates=OK prod_health={'OK' if healthy else 'PENDENTE'}")


if __name__ == "__main__":
    main()
