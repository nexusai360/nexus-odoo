"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { REPORT_DOMAINS } from "@/lib/reports/domains";
import type { ReportEntry } from "@/lib/reports/types";

interface RelatoriosGridProps {
  reports: ReportEntry[];
}

/** Grade de cards de relatório, agrupada por domínio. */
export function RelatoriosGrid({ reports }: RelatoriosGridProps) {
  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum relatório disponível. Você ainda não tem acesso a um domínio.
      </p>
    );
  }

  const dominiosComReports = REPORT_DOMAINS.filter((d) =>
    reports.some((r) => r.dominio === d.id),
  );

  return (
    <div className="flex flex-col gap-8">
      {dominiosComReports.map((dominio) => (
        <section key={dominio.id} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {dominio.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reports
              .filter((r) => r.dominio === dominio.id)
              .map((r) => {
                const Icon = r.icone;
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Link href={`/relatorios/${r.id}`}>
                      <Card className="gap-2 px-4 py-4 transition-shadow hover:ring-foreground/20">
                        <div className="flex items-center gap-2">
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="font-medium">{r.titulo}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {r.descricao}
                        </p>
                        <Badge variant="secondary" className="w-fit">
                          {dominio.label}
                        </Badge>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
