#!/usr/bin/env python3
"""Gera CSV mapeando cada caso PARCIAL/ERRADO/FORA_DO_ESCOPO ao fix
aplicavel (F1-F27 do laudo), a onda de execucao e a probabilidade
estimada de cura.

Consumido pela regressao do PR2+ para validar cura caso-a-caso.

Plan: docs/superpowers/plans/2026-05-27-agente-nex-90pct-plan.md Task 5.5
"""
import json
import csv

IN = "docs/superpowers/research/anexos-laudo-r11-r16/cases_v2.jsonl"
OUT = "docs/superpowers/research/anexos-laudo-r11-r16/casos-x-fixes.csv"

# Mapa pattern principal -> (fixes_aplicaveis, onda, prob_cura_pct).
# Baseado no laudo §4.
PATTERN_TO_FIXES = {
    "resposta_truncada": ("F1,F2,F3", "1", 70),
    "fluxo_tool_incompleto": ("F4,F5,F6,F7", "1+2", 50),
    "dado_inventado": ("F1,F9,F10", "1", 75),
    "entendeu_mal_termo": ("F12,F13,F14", "1+2", 50),
    "recusa_indevida": ("F16,F17", "1", 80),
    "pergunta_ignorada": ("F18,F19", "1", 65),
    "parametro_incompleto": ("F20,F21", "1+2", 60),
    "formato_quebrado": ("F22", "1", 75),
    "erro_data": ("F23,F24", "1.5+2", 70),
    "pediu_clarificacao_desnecessaria": ("F25", "2", 50),
    "tool_errada": ("F26,F27", "1+3", 55),
    "placeholder_nao_substituido": ("F18,F19", "1", 80),
    # CRIT-beta v2: acerto_objetividade so eh legitimo quando status==FORA_DO_ESCOPO.
    # Caso contrario, eh tratado pelo fallback de pattern negativo abaixo.
    "limitacao_real_declarada": ("legitimo", "fora", 0),
    "acerto_modelo": ("legitimo", "fora", 0),
    "acerto_encadeamento": ("legitimo", "fora", 0),
}

# Prioridade para escolher pattern principal quando ha varios negativos.
NEGATIVE_FALLBACK_PRIORITY = [
    "dado_inventado",
    "fluxo_tool_incompleto",
    "resposta_truncada",
    "recusa_indevida",
    "entendeu_mal_termo",
    "pergunta_ignorada",
    "tool_errada",
    "parametro_incompleto",
    "formato_quebrado",
    "erro_data",
    "placeholder_nao_substituido",
    "pediu_clarificacao_desnecessaria",
]

with open(IN) as f, open(OUT, "w", newline="") as out:
    w = csv.writer(out)
    w.writerow([
        "evalId", "rodada", "status", "patterns", "pattern_principal",
        "fixes_aplicaveis", "onda", "prob_cura_pct",
    ])
    n_total = 0
    for line in f:
        line = line.strip()
        if not line:
            continue
        c = json.loads(line)
        pats = c.get("patterns") or []
        status = c.get("status")
        # CRIT-beta v2: acerto_objetividade so eh "legitimo" quando status==FORA.
        if status == "FORA_DO_ESCOPO":
            princ = next(
                (p for p in pats if p in (
                    "limitacao_real_declarada",
                    "acerto_objetividade",
                    "acerto_modelo",
                    "acerto_encadeamento",
                )),
                pats[0] if pats else "?",
            )
        else:
            # PARCIAL ou ERRADO: prioriza pattern negativo da lista
            princ = next(
                (p for p in NEGATIVE_FALLBACK_PRIORITY if p in pats),
                next(
                    (p for p in pats if not p.startswith("acerto") and p != "limitacao_real_declarada"),
                    pats[0] if pats else "?",
                ),
            )
        fixes, onda, prob = PATTERN_TO_FIXES.get(princ, ("?", "?", 0))
        w.writerow([
            c.get("evalId"),
            c.get("rodada"),
            status,
            "|".join(pats),
            princ,
            fixes,
            onda,
            prob,
        ])
        n_total += 1

print(f"OK: {n_total} casos escritos em {OUT}")
