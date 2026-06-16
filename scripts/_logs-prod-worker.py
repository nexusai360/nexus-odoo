#!/usr/bin/env python3
# Pega logs do worker de prod via Portainer (reusa deploy-portainer.py) e filtra erros.
import importlib.util, urllib.request, sys

spec = importlib.util.spec_from_file_location("dp", "scripts/deploy-portainer.py")
dp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dp)

base, token = dp.resolve_portainer()
ep = dp.find_endpoint(base, token)
svcs = dp.list_services(base, token, ep)  # dict {name: service}
worker = svcs["nexus-odoo_worker"]
sid = worker["ID"]

url = f"{base}/api/endpoints/{ep}/docker/services/{sid}/logs?stdout=true&stderr=true&tail=600&timestamps=true"
req = urllib.request.Request(url)
req.add_header("X-API-Key", token)
raw = urllib.request.urlopen(req, timeout=40).read()
text = raw.decode("utf-8", "replace")

# limpa bytes de frame do docker stream (cada linha pode comecar com header de 8 bytes)
lines = []
for ln in text.split("\n"):
    # remove caracteres de controle do inicio
    cleaned = "".join(ch for ch in ln if ch == "\t" or ch >= " ")
    lines.append(cleaned)

# imprime linhas relevantes ao erro
KW = ["estoque", "extrato", "Invalid", "createMany", "connection error", "lote", "serie",
      "Error", "error", "PrismaClient", "P20", "P10", "Unicode", "0x00", "\\u0000", "byte"]
hits = [l for l in lines if any(k.lower() in l.lower() for k in KW)]
print(f"=== {len(lines)} linhas de log, {len(hits)} relevantes ===")
for l in hits[-60:]:
    print(l[:400])
