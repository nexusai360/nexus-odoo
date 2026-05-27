/**
 * Tabela de recomendacoes de prompt agrupadas, com acoes aceitar/rejeitar.
 */

import { RecommendationActions } from "./recommendation-actions";
import type { RecommendationRow } from "@/lib/agent/intelligence/queries";

interface Props {
  recommendations: RecommendationRow[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceita",
  rejected: "Rejeitada",
  needs_more_review: "Precisa mais review",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
  accepted: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
  rejected: "text-zinc-500 bg-zinc-100 dark:bg-zinc-900",
  needs_more_review: "text-violet-600 bg-violet-50 dark:bg-violet-950/30",
};

export function RecommendationsTable({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        Nenhuma recomendacao agrupada ainda. Rode{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">
          pnpm tsx scripts/analyze-conversations.ts
        </code>{" "}
        para gerar avaliacoes e clusterizar.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table className="min-w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
              Recomendacao consolidada
            </th>
            <th className="w-24 px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
              Ocorrencias
            </th>
            <th className="w-32 px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
              Status
            </th>
            <th className="w-48 px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
              Acoes
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {recommendations.map((r) => (
            <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">
                <p className="line-clamp-3 whitespace-pre-line">{r.consolidatedText}</p>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                {r.occurrences}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                    STATUS_COLOR[r.status] ?? STATUS_COLOR.pending
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <RecommendationActions id={r.id} status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
