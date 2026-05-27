"use client";

/**
 * Botoes aceitar/rejeitar/needs-more-review para uma recomendacao.
 */

import { useTransition } from "react";
import { decideRecommendation } from "./actions";

interface Props {
  id: string;
  status: string;
}

export function RecommendationActions({ id, status }: Props) {
  const [pending, startTransition] = useTransition();

  if (status !== "pending" && status !== "needs_more_review") {
    return <span className="text-xs text-zinc-400">,</span>;
  }

  function decide(decision: "accepted" | "rejected" | "needs_more_review") {
    startTransition(async () => {
      await decideRecommendation(id, decision);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("accepted")}
        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Aceitar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("rejected")}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Rejeitar
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("needs_more_review")}
        className="rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
      >
        Mais review
      </button>
    </div>
  );
}
