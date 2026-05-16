"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Clock, Database } from "lucide-react";
import { toast } from "sonner";

import { updateSyncConfig } from "@/lib/actions/sync-config";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

function isFieldValid(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function minToReadable(min: number): string | null {
  if (min < 60) return null;
  const hours = min / 60;
  if (Number.isInteger(hours)) {
    return `${min} min = ${hours} h`;
  }
  return `${min} min ≈ ${hours.toFixed(1)} h`;
}

function EstadoModal({ estado, open, onOpenChange }: {
  estado: SyncStateRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ok = estado.filter((s) => s.lastStatus === "ok").length;
  const semAcesso = estado.filter((s) => s.lastStatus === "sem_acesso").length;
  const erro = estado.filter((s) => s.lastStatus === "erro").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Estado da ingestão</DialogTitle>
          <DialogDescription>
            {estado.length} modelos
            {ok > 0 && ` · ${ok} ok`}
            {semAcesso > 0 && ` · ${semAcesso} sem acesso`}
            {erro > 0 && ` · ${erro} com erro`}
          </DialogDescription>
        </DialogHeader>

        {estado.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 text-muted-foreground"
            role="status"
          >
            <Database className="mb-3 h-12 w-12 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm">Nenhum modelo sincronizado ainda.</p>
          </div>
        ) : (
          <div className="overflow-y-auto overflow-x-auto flex-1 -mx-4 px-4">
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
                      <div>{s.model}</div>
                      {s.lastStatus === "erro" && s.lastError && (
                        <div className="text-xs text-muted-foreground mt-0.5 max-w-[320px] truncate" title={s.lastError}>
                          {s.lastError}
                        </div>
                      )}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ConfiguracaoContent({ config, estado }: Props) {
  const [form, setForm] = useState<Config>(config);
  const [pending, startTransition] = useTransition();
  const [estadoOpen, setEstadoOpen] = useState(false);

  const dirty =
    form.incrementalIntervalMin !== config.incrementalIntervalMin ||
    form.snapshotIntervalMin !== config.snapshotIntervalMin ||
    form.reconcileIntervalMin !== config.reconcileIntervalMin;

  const valid =
    isFieldValid(form.incrementalIntervalMin) &&
    isFieldValid(form.snapshotIntervalMin) &&
    isFieldValid(form.reconcileIntervalMin);

  function salvar() {
    if (!dirty || !valid) return;
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
      className="space-y-6"
    >
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Intervalos de sincronização
            </CardTitle>
            <CardDescription>
              Em minutos. O worker detecta a mudança e reaplica os intervalos em até 1 minuto.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEstadoOpen(true)}
            className="shrink-0"
          >
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Ver estado da ingestão
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {FIELD_LABELS.map(([key, label, helper]) => {
              const fieldInvalid = !isFieldValid(form[key]);
              const readable = minToReadable(form[key]);
              return (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={key}>{label}</Label>
                  <div className="relative flex items-center">
                    <Input
                      id={key}
                      type="number"
                      min={1}
                      value={form[key]}
                      aria-invalid={fieldInvalid}
                      className="pr-12"
                      onChange={(e) =>
                        setForm({ ...form, [key]: Number(e.target.value) })
                      }
                    />
                    <span
                      className="pointer-events-none absolute right-3 text-xs text-muted-foreground select-none"
                      aria-hidden="true"
                    >
                      min
                    </span>
                  </div>
                  {fieldInvalid ? (
                    <p className="text-xs text-destructive" role="alert">
                      Informe um valor inteiro maior ou igual a 1.
                    </p>
                  ) : readable ? (
                    <p className="text-xs text-muted-foreground">{readable}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{helper}</p>
                  )}
                </div>
              );
            })}
          </div>
          <Button onClick={salvar} disabled={!dirty || !valid || pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </CardContent>
      </Card>

      <EstadoModal
        estado={estado}
        open={estadoOpen}
        onOpenChange={setEstadoOpen}
      />
    </motion.div>
  );
}
