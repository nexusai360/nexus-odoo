"use client";

// Tela de Estoque & Compras COM edição de layout embutida (direção do cliente):
// a tela real, com ABAS, e um botão "Editar layout" por cima (gated). Cada aba é
// um grid próprio (ConstrutorGrid) que salva global ou pessoal pela chave
// "estoque:<aba>". Reusa os blocos ricos (renderBlocoEstoque).

import { useState } from "react";
import { Pencil, Check, TrendingUp, Warehouse, Layers, Barcode, ShoppingCart, Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BotaoModoEstendido } from "@/components/diretoria/modo-estendido";
import { ConstrutorGrid } from "@/components/diretoria/builder/construtor-grid";
import { renderBlocoEstoque } from "@/components/diretoria/blocos/blocos-estoque";
import type { EstoqueData } from "@/components/diretoria/estoque/estoque-screen";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";

const ABAS = [
  { id: "visao", label: "Visão geral", icon: TrendingUp },
  { id: "estoque", label: "Estoque", icon: Warehouse },
  { id: "distribuicao", label: "Distribuição", icon: Layers },
  { id: "seriais", label: "Seriais", icon: Barcode },
  { id: "compras", label: "Compras", icon: ShoppingCart },
  { id: "fornecedores", label: "Fornecedores", icon: Building2 },
] as const;

export function EstoqueMontavel({
  data,
  layoutsPorAba,
  podeEditarGlobal,
}: {
  data: EstoqueData;
  layoutsPorAba: Record<string, BlocoLayout[]>;
  podeEditarGlobal: boolean;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <BotaoModoEstendido />
        {editando ? (
          <span className="text-xs text-violet-700 dark:text-violet-300">
            Modo de edição: arraste pela alça (grip), redimensione pelos cantos/bordas. Salve em cada aba.
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setEditando((e) => !e)}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
            editando
              ? "border-emerald-500/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-600/20"
              : "border-violet-500/40 bg-violet-600/10 text-violet-700 dark:text-violet-200 hover:bg-violet-600/20",
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
              tela={`estoque:${a.id}`}
              data={data}
              layoutInicial={layoutsPorAba[a.id] ?? []}
              dominios={["A", "K"]}
              podeEditarPessoal
              podeEditarGlobal={podeEditarGlobal}
              renderBloco={renderBlocoEstoque}
              editando={editando}
              onEditandoChange={setEditando}
              comPeriodo={a.id === "compras"}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
