/**
 * Lista de conversas com pior aderencia (drill-down rapido).
 */

import Link from "next/link";
import type { LowAdherenceConversation } from "@/lib/agent/intelligence/queries";

interface Props {
  rows: LowAdherenceConversation[];
}

export function LowAdherenceList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        Nenhuma avaliacao com aderencia baixa (≤ 2) ainda.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table className="min-w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
              Conversa
            </th>
            <th className="w-24 px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
              Aderencia
            </th>
            <th className="w-40 px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
              Data
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {rows.map((r) => (
            <tr key={r.evaluationId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
              <td className="px-4 py-3">
                <Link
                  href={`/agente/conversas/${r.conversationId}`}
                  className="font-mono text-xs text-violet-600 hover:underline dark:text-violet-400"
                >
                  {r.conversationId.slice(0, 8)}…
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-rose-600 dark:text-rose-400">
                {r.aderencia}/5
              </td>
              <td className="px-4 py-3 text-zinc-500">
                {new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
