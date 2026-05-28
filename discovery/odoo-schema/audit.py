"""Auditoria read-only:
- Le schema.json (verdade do Odoo)
- Le prisma/schema.prisma (raw_* / fato_* -> tabelas do cache)
- Le mcp/tools/**/*.ts (tools que o Nex usa)
- Gera docs/discovery/2026-05-28-gap-odoo-mcp.md com 4 secoes:
  1. Cobertura: quais modelos Odoo customizados (sped/finan/contabil/pedido/estoque) JA temos como raw_*
  2. Lacunas: quais modelos Odoo customizados NAO temos no Prisma (candidatos a novas tools)
  3. Modelos raw_* sem tool MCP que os explore (capacidade ociosa)
  4. Top selections do Odoo que ainda nao mapeamos (usuario perguntaria por status reais)
NAO altera nada alem do markdown.
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
SCHEMA = json.loads((ROOT / "discovery/odoo-schema/schema.json").read_text())
SELECTIONS = json.loads((ROOT / "discovery/odoo-schema/normalized/fields_selection.json").read_text())
PRISMA = (ROOT / "prisma/schema.prisma").read_text()
TOOLS_DIR = ROOT / "mcp/tools"
OUT_DIR = ROOT / "docs/discovery"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---- 1. extrai @@map do Prisma ----
prisma_maps = set(re.findall(r'@@map\("([^"]+)"\)', PRISMA))
raw_tables = {m for m in prisma_maps if m.startswith("raw_")}
fato_tables = {m for m in prisma_maps if m.startswith("fato_")}

# raw_sped_documento -> sped.documento  (heuristica de match)
def raw_to_odoo_model(raw: str) -> str:
    # raw_sped_documento_item -> sped.documento.item
    body = raw[len("raw_"):]
    # primeira underline vira ponto entre prefixo e resto; resto continua com pontos
    parts = body.split("_")
    if len(parts) < 2:
        return body
    return parts[0] + "." + ".".join(parts[1:])

raw_to_model = {r: raw_to_odoo_model(r) for r in raw_tables}

# ---- 2. tools MCP existentes (nome + dominio) ----
tools_by_domain: dict[str, list[str]] = defaultdict(list)
for ts in TOOLS_DIR.rglob("*.ts"):
    if ts.name in {"index.ts"} or ts.name.endswith(".test.ts"):
        continue
    rel = ts.relative_to(TOOLS_DIR)
    domain = rel.parts[0] if len(rel.parts) > 1 else "_root"
    tools_by_domain[domain].append(ts.stem)

# heuristica: tool referencia tabela raw_X se aparecer o nome no codigo
# Aceita 3 formas: snake (raw_sped_documento), camel (rawSpedDocumento) e pascal (RawSpedDocumento)
def snake_to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])
def snake_to_pascal(s: str) -> str:
    return "".join(p.title() for p in s.split("_"))

tool_refs_table: dict[str, set[str]] = defaultdict(set)
all_files_text = []
for ts in TOOLS_DIR.rglob("*.ts"):
    if ts.name.endswith(".test.ts"):
        continue
    all_files_text.append((str(ts.relative_to(TOOLS_DIR)), ts.read_text(errors="ignore")))
# Inclui tambem queries reusadas pelo MCP
for ts in (ROOT / "src/lib/reports/queries").rglob("*.ts"):
    if ts.name.endswith(".test.ts"):
        continue
    all_files_text.append((f"reports/{ts.name}", ts.read_text(errors="ignore")))

for tbl in raw_tables:
    needles = {tbl, snake_to_camel(tbl), snake_to_pascal(tbl)}
    for path, txt in all_files_text:
        if any(n in txt for n in needles):
            tool_refs_table[tbl].add(path)

# Tools consomem fato_*, nao raw_* direto. Mapeia fato -> tool tambem.
fato_refs_table: dict[str, set[str]] = defaultdict(set)
for tbl in fato_tables:
    needles = {tbl, snake_to_camel(tbl), snake_to_pascal(tbl)}
    for path, txt in all_files_text:
        if any(n in txt for n in needles):
            fato_refs_table[tbl].add(path)
fato_sem_tool = sorted([f for f in fato_tables if not fato_refs_table.get(f)])

# ---- 3. cobertura por prefixo customizado ----
CUSTOM_PREFIXES = ["sped", "finan", "contabil", "pedido", "estoque", "producao", "crm", "relatorio", "auditoria", "wms"]

cov_by_prefix = {}
for p in CUSTOM_PREFIXES:
    odoo_models = sorted([m for m in SCHEMA if m.startswith(p + ".")])
    # cache_models: os raw_ que mapeam para esse prefixo
    cached = {raw_to_model[r] for r in raw_tables if r.startswith(f"raw_{p}_")}
    coverage = [m for m in odoo_models if m in cached]
    missing  = [m for m in odoo_models if m not in cached]
    cov_by_prefix[p] = {
        "odoo_total": len(odoo_models),
        "cached": len(coverage),
        "missing": len(missing),
        "coverage_pct": round(100 * len(coverage) / len(odoo_models), 1) if odoo_models else 0.0,
        "missing_list": missing[:60],
    }

# ---- 4. raw_ sem tool MCP que os referencie ----
raw_sem_tool = sorted([r for r in raw_tables if not tool_refs_table.get(r)])

# ---- 5. selections com mais valores (alta utilidade pro Nex saber status reais) ----
sel_by_field = Counter()
sel_examples: dict[str, list[str]] = defaultdict(list)
for s in SELECTIONS:
    fid = s.get("Field") or ""
    val = s.get("Value")
    if not fid:
        continue
    sel_by_field[fid] += 1
    if val and len(sel_examples[fid]) < 6:
        sel_examples[fid].append(str(val))

# filtra para campos de modelos customizados (heuristica: nome do campo contem sped./finan./pedido./estoque./contabil.)
def is_custom_field(label: str) -> bool:
    label_low = label.lower()
    return any(k in label_low for k in CUSTOM_PREFIXES)

top_selections = [
    (fid, n) for fid, n in sel_by_field.most_common(80)
    if is_custom_field(fid)
][:30]

# ---- 6. escreve relatorio ----
out = []
out.append("# Auditoria Discovery x Cache x MCP — 2026-05-28\n")
out.append("> Read-only. Gerado por `discovery/odoo-schema/audit.py` cruzando")
out.append("> `schema.json` (Odoo Admin), `prisma/schema.prisma` e `mcp/tools/**`.\n")
out.append("> **Nada do agente Nex foi alterado.** Este documento e apenas leitura.\n")

out.append("\n## 1. Cobertura por prefixo customizado\n")
out.append("| Prefixo | Modelos no Odoo | No cache (raw_*) | Faltam | Cobertura |")
out.append("|---|---:|---:|---:|---:|")
for p, c in cov_by_prefix.items():
    out.append(f"| `{p}.*` | {c['odoo_total']} | {c['cached']} | {c['missing']} | {c['coverage_pct']}% |")

out.append("\n## 2. Modelos Odoo customizados ausentes do cache\n")
out.append("Candidatos a virarem novas tabelas raw_* (e potencialmente tools MCP no Nex).")
out.append("So lista os 60 primeiros de cada prefixo para nao inundar.\n")
for p, c in cov_by_prefix.items():
    if not c["missing_list"]:
        continue
    out.append(f"\n### `{p}.*` ({c['missing']} ausentes)\n")
    for m in c["missing_list"]:
        nome = SCHEMA[m].get("name") or ""
        out.append(f"- `{m}` — {nome}")

out.append("\n## 3. Cobertura da camada de fatos (o que o Nex realmente consulta)\n")
out.append("Tools do MCP consultam `fato_*`, nao `raw_*` diretamente.")
out.append(f"Hoje existem **{len(fato_tables)} tabelas de fatos** no Prisma.\n")
out.append("### Fatos COM tool MCP cobrindo")
for f in sorted(fato_tables):
    if fato_refs_table.get(f):
        out.append(f"- `{f}` — {len(fato_refs_table[f])} tool(s)")
out.append("\n### Fatos SEM tool MCP cobrindo (capacidade ociosa do agente)")
if fato_sem_tool:
    for f in fato_sem_tool:
        out.append(f"- `{f}`")
else:
    out.append("_Todos os fatos sao consultados por pelo menos uma tool._")

out.append("\n### Raw tables sem fato derivado (so cache, sem agregacao semantica)")
out.append("Tabelas no cache que ainda nao viraram fato. Para virar tool, o caminho")
out.append("eh: criar fato_* derivado -> criar tool MCP que consulta o fato.\n")
raw_que_viraram_fato_heuristica = set()
for f in fato_tables:
    # remove fato_ prefixo, monta raw_<algo> + variacoes plausiveis
    base = f[len("fato_"):]
    # tenta achar raw_ que comece com mesmo radical
    for r in raw_tables:
        if r[len("raw_"):].startswith(base.split("_")[0]):
            raw_que_viraram_fato_heuristica.add(r)
raw_sem_fato = sorted([r for r in raw_tables if r not in raw_que_viraram_fato_heuristica])
out.append(f"Total: **{len(raw_sem_fato)}** de {len(raw_tables)} raw_* sem fato heuristicamente associado.")
out.append("_(Lista omitida por tamanho. Disponivel em `discovery/odoo-schema/raw_sem_fato.json` se necessario.)_")
(Path(__file__).parent / "raw_sem_fato.json").write_text(json.dumps(raw_sem_fato, indent=2))

out.append("\n## 4. Selections (status/tipos) de modelos customizados\n")
out.append("Campos do tipo `selection` com varios valores. Usar essas listas evita")
out.append("o Nex chutar nomes de status. Top 30 por quantidade de opcoes.\n")
out.append("| Campo (label do Odoo) | # opcoes | Exemplos |")
out.append("|---|---:|---|")
for fid, n in top_selections:
    ex = ", ".join(sel_examples[fid][:5])
    out.append(f"| {fid} | {n} | {ex} |")

out.append("\n## 5. Resumo executivo\n")
out.append(f"- **Modelos Odoo:** {len(SCHEMA)} | **Cache raw_*:** {len(raw_tables)} | **Fatos:** {len(fato_tables)} | **Tools MCP:** {sum(len(v) for v in tools_by_domain.values())}")
out.append(f"- Cobertura do **sped.\\***: {cov_by_prefix['sped']['coverage_pct']}% ({cov_by_prefix['sped']['cached']}/{cov_by_prefix['sped']['odoo_total']})")
out.append(f"- Cobertura do **finan.\\***: {cov_by_prefix['finan']['coverage_pct']}% ({cov_by_prefix['finan']['cached']}/{cov_by_prefix['finan']['odoo_total']})")
out.append(f"- Cobertura do **pedido.\\***: {cov_by_prefix['pedido']['coverage_pct']}% ({cov_by_prefix['pedido']['cached']}/{cov_by_prefix['pedido']['odoo_total']})")
out.append(f"- Cobertura do **contabil.\\***: {cov_by_prefix['contabil']['coverage_pct']}% ({cov_by_prefix['contabil']['cached']}/{cov_by_prefix['contabil']['odoo_total']})")
out.append(f"- Cobertura do **estoque.\\***: {cov_by_prefix['estoque']['coverage_pct']}% ({cov_by_prefix['estoque']['cached']}/{cov_by_prefix['estoque']['odoo_total']})")
out.append(f"- Tabelas raw_* sem tool MCP cobrindo: **{len(raw_sem_tool)}**")
out.append("\n> Proximas decisoes ficam com o usuario. Nada implementado a partir deste relatorio.")

out_path = OUT_DIR / "2026-05-28-gap-odoo-mcp.md"
out_path.write_text("\n".join(out))
print(f"[ok] relatorio: {out_path}")
print(f"[ok] modelos odoo: {len(SCHEMA)} | raw_: {len(raw_tables)} | fato_: {len(fato_tables)} | tools: {sum(len(v) for v in tools_by_domain.values())}")
print(f"[ok] raw_ sem tool: {len(raw_sem_tool)}")
print()
print("--- Cobertura por prefixo ---")
for p, c in cov_by_prefix.items():
    print(f"  {p:10s} {c['cached']:3d}/{c['odoo_total']:3d}  ({c['coverage_pct']:5.1f}%)  faltam {c['missing']}")
