import { DOMINIOS_PRIORITARIOS } from "./constants";
import type { EntradaBalde, ResultadoBaldes } from "./types";

function linhasModelos(
  modelos: Record<string, EntradaBalde>,
  filtro: (e: EntradaBalde) => boolean,
): string[] {
  return Object.entries(modelos)
    .filter(([, e]) => filtro(e))
    .sort((a, b) => (b[1].count ?? -1) - (a[1].count ?? -1))
    .map(([nome, e]) => {
      const c = e.count == null ? "n/d" : String(e.count);
      const prev = e.previsao_ativacao ? `, ${e.previsao_ativacao}` : "";
      return `| \`${nome}\` | ${e.descricao} | ${e.balde} | ${c} | ${e.motivo}${prev} |`;
    });
}

/** Gera o relatório markdown legível a partir do resultado da classificação. */
export function gerarRelatorio(r: ResultadoBaldes): string {
  const out: string[] = [];
  out.push("# Baldes do Discovery enxuto (R2)");
  out.push("");
  out.push(`Gerado em ${r.gerado_em} (uid ${r.rodou_sob_uid ?? "n/d"}).`);
  out.push(`Fonte: \`${r.fonte_schema}\`. Threshold A: count >= ${r.thresholds.balde_a_min}.`);
  out.push("");
  out.push("## Sumário");
  out.push("");
  out.push("| Balde | Significado | Modelos |");
  out.push("|---|---|---:|");
  out.push(`| Balde A | tem dado real (> ${r.thresholds.balde_b_max}) | ${r.totais.A} |`);
  out.push(`| Balde B | legítimo, vazio/baixo hoje | ${r.totais.B} |`);
  out.push(`| Balde C | inútil técnico | ${r.totais.C} |`);
  out.push(`| Não classificados | erro transitório de RPC | ${r.totais.nao_classificados} |`);
  out.push(`| **Total** | | **${r.totais.total}** |`);
  out.push("");

  out.push("## Por domínio");
  out.push("");
  out.push("| Domínio | A | B | C | Não class. |");
  out.push("|---|---:|---:|---:|---:|");
  for (const [dom, c] of Object.entries(r.por_dominio).sort()) {
    out.push(`| ${dom} | ${c.A} | ${c.B} | ${c.C} | ${c.nao_classificados} |`);
  }
  out.push("");

  out.push("## Domínios prioritários");
  out.push("");
  for (const dom of DOMINIOS_PRIORITARIOS) {
    const c = r.por_dominio[dom];
    out.push(`### ${dom}` + (c ? ` (A:${c.A} B:${c.B} C:${c.C})` : " (sem modelos)"));
    out.push("");
    if (c && c.C > 0) out.push(`_${c.C} técnicos (Balde C) omitidos desta lista._`);
    out.push("| Modelo | Descrição | Balde | Count | Motivo |");
    out.push("|---|---|---|---:|---|");
    // Só A e B (acionáveis); C é ruído na visão "o que vira tool" (review P3).
    out.push(...linhasModelos(r.modelos, (e) => e.dominio === dom && e.balde !== "C"));
    out.push("");
  }

  // Balde C por motivo (spec §5.2 / review Q1): auditabilidade do filtro.
  const cPorMotivo = new Map<string, number>();
  for (const e of Object.values(r.modelos)) {
    if (e.balde === "C") cPorMotivo.set(e.motivo, (cPorMotivo.get(e.motivo) ?? 0) + 1);
  }
  out.push("## Balde C por motivo");
  out.push("");
  out.push("| Motivo | Modelos |");
  out.push("|---|---:|");
  for (const [motivo, n] of [...cPorMotivo.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`| ${motivo} | ${n} |`);
  }
  out.push("");

  if (r.nao_classificados.length) {
    out.push("## Não classificados (re-rodar)");
    out.push("");
    out.push("```bash");
    out.push(
      `npm run discovery:baldes -- --only ${r.nao_classificados.map((n) => n.modelo).join(",")}`,
    );
    out.push("```");
    out.push("");
    for (const n of r.nao_classificados) {
      out.push(`- \`${n.modelo}\`: ${n.erro}`);
    }
    out.push("");
  }

  return out.join("\n");
}
