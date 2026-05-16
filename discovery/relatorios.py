"""Renderização dos relatórios Markdown do Discovery."""
from collections import defaultdict


def render_censo_md(modelos: list, resumo: dict) -> str:
    """Gera o censo.md: resumo no topo, modelos agrupados por área."""
    linhas = ["# Censo de Modelos do Odoo Tauga", ""]
    linhas.append(f"- Total de modelos: {resumo['total']}")
    linhas.append(f"- Sem acesso: {resumo['sem_acesso']}")
    linhas.append(f"- Sem contagem (timeout): {resumo['sem_contagem']}")
    linhas.append("")

    por_area = defaultdict(list)
    for m in modelos:
        por_area[m["area"]].append(m)

    for area in sorted(por_area):
        linhas.append(f"## {area}")
        linhas.append("")
        linhas.append("| Modelo | Rótulo | Tipo | Acesso | Registros |")
        linhas.append("|---|---|---|---|---|")
        for m in sorted(por_area[area], key=lambda x: x["model"]):
            registros = "—" if m["registros"] is None else m["registros"]
            linhas.append(
                f"| `{m['model']}` | {m['name']} | {m['tipo']} "
                f"| {m['acesso']} | {registros} |"
            )
        linhas.append("")
    return "\n".join(linhas)


def render_mapa_profundo_md(modelos: list) -> str:
    """Gera o mapa-profundo.md: um bloco por modelo com campos e veredito."""
    linhas = ["# Mapa Profundo dos Modelos Selecionados", ""]
    for m in modelos:
        linhas.append(f"## `{m['model']}`")
        linhas.append("")
        linhas.append(f"- Aptidão para delta: **{m['veredito_delta']}**")
        linhas.append(f"- Registros na amostra: {m['qtd_amostra']}")
        linhas.append("")
        linhas.append("| Campo | Tipo | Relação |")
        linhas.append("|---|---|---|")
        for c in m["campos"]:
            relacao = c["relacao"] or "—"
            linhas.append(f"| `{c['nome']}` | {c['tipo']} | {relacao} |")
        linhas.append("")
    return "\n".join(linhas)
