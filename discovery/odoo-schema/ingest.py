"""Ingere os xlsx exportados do Odoo Admin -> Estrutura do BD e gera:
- normalized/*.json : um por arquivo, lista de dicts (linhas)
- schema.json       : visao consolidada indexada por modelo
- stats.json        : resumo estatistico
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

BASE = Path(__file__).parent
RAW = BASE / "raw"
NORM = BASE / "normalized"
NORM.mkdir(exist_ok=True)

FILES = {
    "fields":              "Fields (ir.model.fields).xlsx",
    "models":              "Models (ir.model).xlsx",
    "fields_selection":    "Fields Selection (ir.model.fields.selection).xlsx",
    "model_data":          "Model Data (ir.model.data).xlsx",
    "model_constraint":    "Model Constraint (ir.model.constraint).xlsx",
    "model_relation":      "Relation Model (ir.model.relation).xlsx",
    "sequence":            "Sequence (ir.sequence).xlsx",
    "scheduled_actions":   "Scheduled Actions (ir.cron).xlsx",
    "server_action":       "Server Action (ir.actions.server).xlsx",
    "system_parameter":    "System Parameter (ir.config_parameter).xlsx",
    "decimal_precision":   "Decimal Precision (decimal.precision).xlsx",
}


def read_xlsx(path: Path) -> list[dict]:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    headers = [str(h).strip() if h is not None else f"col_{i}" for i, h in enumerate(next(rows))]
    out = []
    for r in rows:
        if all(v is None for v in r):
            continue
        out.append({headers[i]: r[i] for i in range(len(headers))})
    return out


datasets: dict[str, list[dict]] = {}
for key, fname in FILES.items():
    path = RAW / fname
    if not path.exists():
        print(f"[skip] {fname}")
        continue
    rows = read_xlsx(path)
    datasets[key] = rows
    (NORM / f"{key}.json").write_text(json.dumps(rows, ensure_ascii=False, default=str, indent=2))
    print(f"[ok] {key}: {len(rows)} linhas | colunas: {list(rows[0].keys()) if rows else []}")

# ---------- consolidacao schema.json ----------
# indexa fields por model
fields_by_model: dict[str, list[dict]] = defaultdict(list)
for f in datasets.get("fields", []):
    model = f.get("Model") or f.get("model_id") or f.get("Model/Model")
    if model:
        fields_by_model[str(model)].append(f)

selections_by_field_label: dict[str, list[dict]] = defaultdict(list)
for s in datasets.get("fields_selection", []):
    fid = s.get("Field") or s.get("field_id")
    if fid:
        selections_by_field_label[str(fid)].append(s)

xmlids_by_model: dict[str, list[dict]] = defaultdict(list)
for x in datasets.get("model_data", []):
    model = x.get("Model") or x.get("model")
    if model:
        xmlids_by_model[str(model)].append(x)

schema = {}
for m in datasets.get("models", []):
    tech = m.get("Model") or m.get("model")
    if not tech:
        continue
    schema[str(tech)] = {
        "name": m.get("Model Description") or m.get("name"),
        "type": m.get("Type"),
        "transient": m.get("Transient Model"),
        "fields": fields_by_model.get(str(tech), []),
        "xml_ids_count": len(xmlids_by_model.get(str(tech), [])),
    }

(BASE / "schema.json").write_text(json.dumps(schema, ensure_ascii=False, default=str, indent=2))
print(f"[ok] schema.json: {len(schema)} modelos")

# ---------- estatisticas ----------
def prefix(model: str) -> str:
    return model.split(".")[0] if model else "?"

prefixes = Counter(prefix(m) for m in schema)
custom_prefixes = {
    p: c for p, c in prefixes.items()
    if p in {"sped", "finan", "pedido", "estoque", "contabil", "crm", "vendas",
             "compras", "fiscal", "tributos", "boleto", "produto", "produtos",
             "fabricante", "marca", "linha", "tipo", "familia"}
}

field_types = Counter()
for f in datasets.get("fields", []):
    t = f.get("Field Type") or f.get("ttype")
    if t:
        field_types[str(t)] += 1

stats = {
    "total_modelos": len(schema),
    "total_campos": len(datasets.get("fields", [])),
    "total_xml_ids": len(datasets.get("model_data", [])),
    "total_selections": len(datasets.get("fields_selection", [])),
    "total_sequences": len(datasets.get("sequence", [])),
    "total_crons": len(datasets.get("scheduled_actions", [])),
    "total_server_actions": len(datasets.get("server_action", [])),
    "prefixos_top20": prefixes.most_common(20),
    "prefixos_customizados_detectados": custom_prefixes,
    "tipos_de_campo": field_types.most_common(),
}

(BASE / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
print(json.dumps(stats, ensure_ascii=False, indent=2))
