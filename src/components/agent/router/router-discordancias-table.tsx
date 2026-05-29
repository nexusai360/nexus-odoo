"use client";

/**
 * R1 router de catalogo: ultimas N discordancias (tools chamadas fora de
 * pickedDomains). Candidatos prioritarios a ajustar domain-vocabulary.ts.
 */

import { AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RouterDiscordanciaRow } from "@/lib/agent/router/queries";

interface Props {
  rows: RouterDiscordanciaRow[];
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function RouterDiscordanciasTable({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Discordancias recentes
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Turnos onde a tool chamada estava fora dos dominios escolhidos.
          Bons candidatos a calibrar `domain-vocabulary.ts`.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma discordancia. O router esta acertando o dominio das
            tools que o agente acabou chamando.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Quando</TableHead>
                  <TableHead>Pergunta</TableHead>
                  <TableHead>Router escolheu</TableHead>
                  <TableHead>Tool chamada</TableHead>
                  <TableHead className="w-[70px] text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {dateFmt.format(r.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-[320px] truncate text-sm">
                      {r.userQuestion}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.pickedDomains.length === 0 ? (
                          <Badge variant="outline">fallback</Badge>
                        ) : (
                          r.pickedDomains.map((d) => (
                            <Badge key={d} variant="outline">
                              {d}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {r.toolsDomains.map((d, i) => (
                          <Badge
                            key={`${r.id}-${i}-${d}`}
                            variant="destructive"
                          >
                            {d}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {r.topScore !== null ? (
                        r.topScore.toFixed(2)
                      ) : (
                        <span className="text-muted-foreground">n/d</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
