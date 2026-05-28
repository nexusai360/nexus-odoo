"use client";

/**
 * R1 router de catalogo: histograma da distribuicao de topScore.
 *
 * Ideal: bimodal (pico alto em 0.7+ e pico baixo em 0.0-0.2).
 * Ruim: achatado (router nao discrimina, vocab fraco).
 */

import { BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InteractiveBarChart } from "@/components/charts/interactive";
import type { RouterHistogramBucket } from "@/lib/agent/router/queries";

interface Props {
  buckets: RouterHistogramBucket[];
}

export function RouterHistogramChart({ buckets }: Props) {
  const data = buckets.map((b) => ({
    name: `${b.bucketStart.toFixed(1)}-${b.bucketEnd.toFixed(1)}`,
    qty: b.qty,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-violet-400" />
          Distribuicao do topScore
        </CardTitle>
      </CardHeader>
      <CardContent>
        <InteractiveBarChart
          data={data}
          series={[{ key: "qty", label: "Turnos", color: "#8b5cf6" }]}
          height={220}
          layout="vertical"
          showLegend={false}
          showGrid={true}
          emptyMessage="Sem dados ainda"
          emptyHint="Use o agente em modo shadow para acumular decisoes."
          ariaLabel="Histograma do topScore do router em 10 buckets"
        />
      </CardContent>
    </Card>
  );
}
