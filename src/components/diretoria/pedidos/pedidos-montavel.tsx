"use client";

// Tela de Pedidos & Entregas COM edição de layout embutida (mesmo padrão de
// Estoque/Vendas). Cada aba é um grid próprio que salva global/pessoal pela
// chave "pedidos:<aba>".

import { useState } from "react";
import { Pencil, Check, TrendingUp, Map as MapIcon, ListChecks } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConstrutorGrid } from "@/components/diretoria/builder/construtor-grid";
import { renderBlocoPedidos } from "@/components/diretoria/blocos/blocos-pedidos";
import type { PedidosData } from "@/components/diretoria/pedidos/pedidos-screen";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

const ABAS = [
  { id: "visao", label: "Visão geral", icon: TrendingUp },
  { id: "mapa", label: "Mapa", icon: MapIcon },
  { id: "pendentes", label: "Pendentes", icon: ListChecks },
] as const;

export function PedidosMontavel({
  data,
  layoutsPorAba,
  podeEditarGlobal,
}: {
  data: PedidosData;
  layoutsPorAba: Record<string, BlocoLayout[]>;
  podeEditarGlobal: boolean;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        {editando ? (
          <span className="mr-auto text-xs text-violet-300">
            Modo de edição: arraste pela alça, redimensione pelos cantos/bordas. Salve em cada aba.
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setEditando((e) => !e)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
            editando
              ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-200 hover:bg-emerald-600/20"
              : "border-violet-500/40 bg-violet-600/10 text-violet-200 hover:bg-violet-600/20",
          )}
        >
          {editando ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editando ? "Concluir edição" : "Editar layout"}
        </button>
      </div>

      <Tabs defaultValue="visao" className="gap-5">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/40 p-1">
          {ABAS.map((a) => (
            <TabsTrigger key={a.id} value={a.id} className="flex-none gap-1.5 px-3 py-1.5">
              <a.icon className="h-3.5 w-3.5" aria-hidden /> {a.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {ABAS.map((a) => (
          <TabsContent key={a.id} value={a.id}>
            <ConstrutorGrid
              tela={`pedidos:${a.id}`}
              data={data}
              layoutInicial={layoutsPorAba[a.id] ?? []}
              dominios={["B"]}
              podeEditarPessoal
              podeEditarGlobal={podeEditarGlobal}
              renderBloco={renderBlocoPedidos}
              editando={editando}
              onEditandoChange={setEditando}
              comPeriodo={false}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
