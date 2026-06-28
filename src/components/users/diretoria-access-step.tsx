"use client";

import { cn } from "@/lib/utils";
import { UfPicker } from "./uf-picker";

interface GrupoCap {
  titulo: string;
  caps: { id: string; label: string }[];
}

const GRUPOS: GrupoCap[] = [
  {
    titulo: "Áreas",
    caps: [
      { id: "diretoria.visao_geral.view", label: "Visão geral" },
      { id: "diretoria.vendas.view", label: "Vendas" },
      { id: "diretoria.pedidos.view", label: "Pedidos & Entregas" },
      { id: "diretoria.estoque.view", label: "Estoque & Compras" },
      { id: "diretoria.agenda.view", label: "Agenda" },
    ],
  },
  {
    titulo: "Exportar dados",
    caps: [
      { id: "diretoria.vendas.export", label: "Exportar Vendas" },
      { id: "diretoria.pedidos.export", label: "Exportar Pedidos" },
      { id: "diretoria.estoque.export", label: "Exportar Estoque" },
    ],
  },
  {
    titulo: "Ações",
    caps: [
      { id: "diretoria.agenda.manage", label: "Gerenciar agenda (criar/excluir eventos)" },
      { id: "diretoria.sync.force", label: "Forçar atualização dos dados" },
    ],
  },
];

/**
 * Etapa "Diretoria" do formulário de usuário: define quais áreas/ações o usuário
 * acessa no menu Diretoria, e o recorte por UF. Visível para admin/manager/viewer
 * (super_admin vê tudo por bypass, não precisa configurar).
 */
export function DiretoriaAccessStep({
  capabilities,
  ufs,
  onCapabilitiesChange,
  onUfsChange,
}: {
  capabilities: string[];
  ufs: string[];
  onCapabilitiesChange: (caps: string[]) => void;
  onUfsChange: (ufs: string[]) => void;
}) {
  const set = new Set(capabilities);

  function toggleCap(id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onCapabilitiesChange([...next]);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Defina o que este usuário pode ver e fazer no menu Diretoria. Sem nenhuma
        área marcada, o menu não aparece para ele.
      </p>

      {GRUPOS.map((g) => (
        <fieldset key={g.titulo} className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.titulo}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {g.caps.map((c) => {
              const ativo = set.has(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    ativo
                      ? "border-violet-500/60 bg-violet-600/10"
                      : "border-border/60 hover:bg-muted/40",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={() => toggleCap(c.id)}
                    className="accent-violet-600"
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recorte por estado (UF)
        </span>
        <UfPicker value={ufs} onChange={onUfsChange} />
      </div>
    </div>
  );
}
