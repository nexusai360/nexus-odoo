#!/usr/bin/env python3
# Alinha o limite de heap do WORKER de producao com o que a stack declara.
#
# POR QUE EXISTE (drift real, encontrado em 2026-07-12):
#   O compose da stack `nexus-odoo` no Portainer JA declarava, no servico worker:
#       NODE_OPTIONS=--max-old-space-size=4096   /   resources.limits.memory: 4608M
#   Mas o servico VIVO no Swarm rodava com:
#       NODE_OPTIONS=--max-old-space-size=1024   /   limite de 1536M
#   Ou seja: o compose foi corrigido em algum momento e a correcao NUNCA chegou no
#   servico. Motivo: o scripts/deploy-portainer.py faz *service update* (troca a imagem
#   e forca o rolling), nao um `docker stack deploy` , entao ele nunca reaplica o
#   environment nem os limites do compose. O compose virou papel; o Swarm ficou com a
#   spec antiga.
#   Consequencia: o worker de prod rodava com 1 GB de heap e morria com
#   "JavaScript heap out of memory" , foi o que derrubou os ciclos de sync.
#
# O QUE FAZ: um update CIRURGICO do servico nexus-odoo_worker (e SO dele):
#   - NODE_OPTIONS=--max-old-space-size=<HEAP_MB>  (2048, igual ao docker-compose.yml local)
#   - resources.limits.memory = <MEM_MB>           (3072M)
#   Nao toca em nenhuma outra variavel, nem em app/mcp/db/redis.
#
# DE ONDE VEM O 3072M (2026-07-13): de MEDICAO, nao de chute. O
# scripts/_prod-worker-mem.py amostrou o container durante ciclos completos em producao:
# repouso ~0.48 GB, pico do ciclo pesado (rebuild dos fatos) ~1.9 GB. O teto de 3 GB
# cobre o pico com ~1.1 GB de folga e comporta o heap de 2 GB inteiro. O 4608M anterior
# tinha vindo do compose, sem medicao nenhuma por tras.
#
# ORDEM IMPORTA: aplique aqui (servico vivo, rolling) e SO DEPOIS publique o compose com
# os mesmos valores (scripts/_prod-stack-put.py). Assim o `stack deploy` disparado pelo
# PUT nao recria task nenhuma. Confira no fim com scripts/_prod-stack-drift.py.
#
# CUIDADO (a armadilha que este script evita): o heap do Node TEM que caber no limite de
# memoria do container, com folga pro resto do processo. Heap 2048 dentro de um container
# limitado a 1536M faz o KERNEL matar o container (OOM-kill), que e pior que o heap OOM.
# Por isso os dois valores andam juntos aqui, e o script se recusa a subir o heap sem folga.
#
# Uso:
#   python3 scripts/_prod-worker-heap.py            # so mostra o estado atual (seguro)
#   python3 scripts/_prod-worker-heap.py --aplicar  # aplica
import importlib.util, sys

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec); spec.loader.exec_module(dp)
base, token = dp.resolve_portainer(); ep = dp.find_endpoint(base, token)

SERVICO = "nexus-odoo_worker"
HEAP_MB = 2048   # --max-old-space-size
MEM_MB = 3072    # teto do container (pico medido do ciclo: ~1.9 GB)
# Folga minima exigida entre o limite do container e o heap: fora do old space ainda vivem
# stack, code space, buffers do pg/redis e o proprio runtime.
FOLGA_MIN_MB = 512

if MEM_MB - HEAP_MB < FOLGA_MIN_MB:
    raise SystemExit(f"ABORTADO: heap {HEAP_MB}M sem folga dentro de um limite de {MEM_MB}M")

svc = dp.get_service_fresh(base, token, ep, SERVICO)
if svc is None:
    raise SystemExit(f"nao achei o servico {SERVICO}")

spec_ = svc["Spec"]
tmpl = spec_["TaskTemplate"]
cspec = tmpl["ContainerSpec"]
env = list(cspec.get("Env") or [])
limites = ((tmpl.get("Resources") or {}).get("Limits") or {})

atual_heap = next((e.split("=", 1)[1] for e in env if e.startswith("NODE_OPTIONS=")), "(ausente)")
atual_mem = limites.get("MemoryBytes", 0)
print(f"=== {SERVICO} , ANTES ===")
print(f"NODE_OPTIONS : {atual_heap}")
print(f"memoria      : {round(atual_mem / 1024 / 1024)}M")

if "--aplicar" not in sys.argv:
    print("\n(somente leitura , rode com --aplicar para mudar)")
    raise SystemExit(0)

# Troca SO o NODE_OPTIONS; preserva a ordem e todo o resto do env intacto.
novo_node_options = f"NODE_OPTIONS=--max-old-space-size={HEAP_MB}"
if any(e.startswith("NODE_OPTIONS=") for e in env):
    env = [novo_node_options if e.startswith("NODE_OPTIONS=") else e for e in env]
else:
    env.append(novo_node_options)
cspec["Env"] = env

# Sobe o teto de memoria do container junto (senao o kernel OOM-killa o container).
recursos = tmpl.setdefault("Resources", {})
recursos.setdefault("Limits", {})["MemoryBytes"] = MEM_MB * 1024 * 1024

# Imagem: normaliza pra tag (mesmo tratamento do deploy-portainer), pra nao fixar digest.
imagem = cspec.get("Image", "").split("@")[0]
if ":" not in imagem.split("/")[-1]:
    imagem += ":latest"
cspec["Image"] = imagem

version = svc["Version"]["Index"]
qs = f"?version={version}"
reg = dp.ghcr_registry_id(base, token)
if reg is not None:
    qs += f"&registryId={reg}"
st, resp = dp.api(
    "POST", base, f"/api/endpoints/{ep}/docker/services/{svc['ID']}/update{qs}",
    token, body=spec_, timeout=60,
)
if st not in (200, 201):
    raise SystemExit(f"FALHOU: HTTP {st} {resp}")
print(f"\n=== aplicado (HTTP {st}) ===")
print(f"NODE_OPTIONS : --max-old-space-size={HEAP_MB}")
print(f"memoria      : {MEM_MB}M")
