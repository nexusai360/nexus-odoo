"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Clock, Database } from "lucide-react";
import { toast } from "sonner";

import { updateSyncConfig } from "@/lib/actions/sync-config";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Local row type — only the fields the UI uses (avoids importing full Prisma model)
interface SyncStateRow {
  model: string;
  mode: string;
  lastIncrementalAt: Date | null;
  lastSnapshotAt: Date | null;
  lastStatus: string;
  lastError: string | null;
  recordCount: number;
}

interface Config {
  incrementalIntervalMin: number;
  snapshotIntervalMin: number;
  reconcileIntervalMin: number;
}

interface Props {
  config: Config;
  estado: SyncStateRow[];
}

const FIELD_LABELS: [keyof Config, string, string][] = [
  ["incrementalIntervalMin", "Incremental", "Frequência da sincronização incremental (write_date)"],
  ["snapshotIntervalMin", "Snapshot", "Frequência do snapshot completo (full refresh)"],
  ["reconcileIntervalMin", "Reconcile", "Frequência da reconciliação (marca registros deletados)"],
];

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "ok":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "erro":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "sem_acesso":
      return "bg-muted text-muted-foreground border-border";
    case "rodando":
      return "bg-violet-500/10 text-violet-400 border-violet-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "ok";
    case "erro":
      return "erro";
    case "sem_acesso":
      return "sem acesso";
    case "rodando":
      return "rodando";
    default:
      return status;
  }
}

function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function ConfiguracaoContent({ config, estado }: Props) {
  const [form, setForm] = useState<Config>(config);
  const [pending, startTransition] = useTransition();

  function salvar() {
    startTransition(async () => {
      try {
        await updateSyncConfig(form);
        toast.success("Intervalos de sincronização atualizados");
      } catch {
        toast.error("Falha ao salvar a configuração");
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <Tabs defaultValue="sincronizacao" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="sincronizacao">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Sincronização
          </TabsTrigger>
          <TabsTrigger value="estado">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Estado
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sincronizacao">
          <Card>
            <CardHeader>
              <CardTitle>Intervalos de sincronização</CardTitle>
              <CardDescription>
                Em minutos. O worker detecta a mudança e reaplica os intervalos em até 1 minuto.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {FIELD_LABELS.map(([key, label, helper]) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label htmlFor={key}>{label}</Label>
                    <Input
                      id={key}
                      type="number"
                      min={1}
                      value={form[key]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: Number(e.target.value) })
                      }
                    />
                    <p className="text-xs text-muted-foreground">{helper}</p>
                  </div>
                ))}
              </div>
              <Button onClick={salvar} disabled={pending}>
                {pending ? "Salvando…" : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estado">
          <div className="overflow-hidden overflow-x-auto rounded-xl border border-border bg-card/50">
            {estado.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-16 text-muted-foreground"
                role="status"
              >
                <p className="text-sm">Nenhum modelo sincronizado ainda.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Modelo</TableHead>
                    <TableHead className="text-xs">Modo</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Registros</TableHead>
                    <TableHead className="text-xs">Última sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estado.map((s) => (
                    <TableRow key={s.model} className="border-border hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-foreground">
                        {s.model}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.mode}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusBadgeClasses(s.lastStatus)}`}
                        >
                          {getStatusLabel(s.lastStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {s.recordCount.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(s.lastIncrementalAt ?? s.lastSnapshotAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
