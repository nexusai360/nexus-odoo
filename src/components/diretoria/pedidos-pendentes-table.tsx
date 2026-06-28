"use client";

import { useState } from "react";
import { MapPin, CalendarClock, Wallet, Layers, User } from "lucide-react";
import type { DemandaLinha } from "@/lib/diretoria/queries/pedidos";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("pt-BR");

function diasAte(dataIso: string | null): number | null {
  if (!dataIso) return null;
  const MS = 86_400_000;
  const alvo = new Date(`${dataIso}T00:00:00Z`).getTime();
  const hoje = new Date();
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  return Math.round((alvo - base) / MS);
}

/**
 * B2 + B5 , tabela de pedidos pendentes com drill-in. Clicar numa linha
 * seleciona o pedido e revela os indicadores daquele pedido (B5). Seleção é
 * client-side: os dados já vêm do servidor, sem nova consulta.
 */
export function PedidosPendentesTable({ linhas }: { linhas: DemandaLinha[] }) {
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const visiveis = linhas.slice(0, 20);
  const atual = selecionado != null ? linhas[selecionado] : null;
  const dias = atual ? diasAte(atual.dataPrevista) : null;

  if (linhas.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido pendente.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Pedido</th>
              <th className="pb-2 font-medium">Cliente</th>
              <th className="pb-2 font-medium">UF</th>
              <th className="pb-2 font-medium">Etapa</th>
              <th className="pb-2 font-medium">Prazo</th>
              <th className="pb-2 text-right font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((d, i) => {
              const ativo = selecionado === i;
              return (
                <tr
                  key={d.numero ?? i}
                  onClick={() => setSelecionado(ativo ? null : i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelecionado(ativo ? null : i);
                    }
                  }}
                  tabIndex={0}
                  aria-selected={ativo}
                  className={`cursor-pointer border-b border-border/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
                    ativo ? "bg-violet-600/10" : "hover:bg-muted/40"
                  }`}
                >
                  <td className="py-2 tabular-nums">{d.numero ?? "?"}</td>
                  <td className="py-2">{d.cliente ?? "Não informado"}</td>
                  <td className="py-2">{d.uf}</td>
                  <td className="py-2 text-muted-foreground">{d.etapa ?? "?"}</td>
                  <td className="py-2">
                    {d.dataPrevista ? (
                      <span className={d.atrasado ? "text-rose-400" : "text-muted-foreground"}>
                        {d.dataPrevista}
                        {d.atrasado ? " (atrasado)" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">,</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{brl.format(d.valor)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* B5 , indicadores do pedido selecionado */}
      {atual ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-600/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Pedido {atual.numero ?? "?"}
              <span className="ml-2 font-normal text-muted-foreground">
                {atual.cliente ?? "Não informado"}
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setSelecionado(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Valor a entregar", valor: brl.format(atual.valor), icon: Wallet },
              { label: "UF", valor: atual.uf, icon: MapPin },
              { label: "Etapa", valor: atual.etapa ?? "?", icon: Layers },
              {
                label: "Prazo",
                valor:
                  dias === null
                    ? "Sem previsão"
                    : dias < 0
                      ? `Atrasado ${Math.abs(dias)}d`
                      : dias === 0
                        ? "Vence hoje"
                        : `Em ${num.format(dias)}d`,
                icon: CalendarClock,
                alerta: dias !== null && dias < 0,
              },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border/50 bg-background/40 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <k.icon className="h-3.5 w-3.5" />
                  {k.label}
                </div>
                <div
                  className={`mt-1 truncate text-sm font-semibold ${
                    "alerta" in k && k.alerta ? "text-rose-500" : ""
                  }`}
                  title={k.valor}
                >
                  {k.valor}
                </div>
              </div>
            ))}
          </div>
          {atual.cliente ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" /> Cliente: {atual.cliente}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Clique em um pedido para ver os indicadores dele. Mostrando {visiveis.length} de{" "}
          {num.format(linhas.length)} pendentes.
        </p>
      )}
    </div>
  );
}
