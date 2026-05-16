"use client";

import { useState, useTransition } from "react";
import { updateSyncConfig } from "@/lib/actions/sync-config";
import { toast } from "sonner";
import type { SyncStateModel } from "@/generated/prisma/models/SyncState";

interface Config {
  incrementalIntervalMin: number;
  snapshotIntervalMin: number;
  reconcileIntervalMin: number;
}

interface Props {
  config: Config;
  estado: SyncStateModel[];
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
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold">Intervalos de sincronização</h2>
        <p className="text-sm text-muted-foreground">
          Em minutos. O worker detecta a mudança e reaplica os intervalos em até 1 minuto.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {([
            ["incrementalIntervalMin", "Incremental"],
            ["snapshotIntervalMin", "Snapshot"],
            ["reconcileIntervalMin", "Reconcile"],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-sm">
              {label}
              <input
                type="number"
                min={1}
                value={form[key]}
                onChange={(e) =>
                  setForm({ ...form, [key]: Number(e.target.value) })
                }
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </label>
          ))}
        </div>
        <button
          onClick={salvar}
          disabled={pending}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold">
          Estado da ingestão ({estado.length} modelos)
        </h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2">Modelo</th>
              <th>Modo</th>
              <th>Status</th>
              <th>Registros</th>
              <th>Última sync</th>
            </tr>
          </thead>
          <tbody>
            {estado.map((s) => (
              <tr key={s.model} className="border-t">
                <td className="py-2 font-mono text-xs">{s.model}</td>
                <td>{s.mode}</td>
                <td>{s.lastStatus}</td>
                <td>{s.recordCount}</td>
                <td>
                  {(s.lastIncrementalAt ?? s.lastSnapshotAt)?.toLocaleString(
                    "pt-BR",
                  ) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
