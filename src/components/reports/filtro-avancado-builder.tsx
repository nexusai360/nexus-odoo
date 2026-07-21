"use client";

/**
 * Construtor visual (puro) do filtro avançado E/OU. Extraído de
 * `filters-dialog.tsx` para ser reutilizado pelo DataTable (Fase 4 do B-09)
 * sem herdar o acoplamento à URL daquele diálogo.
 *
 * - `CondicaoRow`: uma condição (campo · operador · valor), ciente do TIPO da
 *   coluna escolhida , só oferece os operadores válidos para o tipo
 *   (`operadoresParaTipo`), usa o input adequado (date / number / text) e
 *   esconde o campo de valor quando o operador é `vazio`/`preenchido`.
 * - `GrupoBuilder`: um grupo recursivo (conector E/OU + condições/subgrupos).
 *
 * Ambos são controlados por `onChange` (sem estado próprio, sem URL). Design
 * segue o design system (violet, tokens, componentes do DS, ícones lucide).
 */

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type Grupo,
  type Condicao,
  type GrupoItem,
  OPERADORES,
  operadoresParaTipo,
} from "@/lib/reports/filtro-avancado";

/** Campo disponível no builder. `tipo` (opcional) refina operadores e input. */
export type CampoOpcao = { value: string; label: string; tipo?: string };

// ---------------------------------------------------------------------------
// CondicaoRow
// ---------------------------------------------------------------------------

interface CondicaoRowProps {
  condicao: Condicao;
  campos: CampoOpcao[];
  onChange: (next: Condicao) => void;
  onRemove: () => void;
}

export function CondicaoRow({
  condicao,
  campos,
  onChange,
  onRemove,
}: CondicaoRowProps) {
  const campoTipo =
    campos.find((c) => c.value === condicao.campo)?.tipo ?? "texto";
  const opsValidos = operadoresParaTipo(campoTipo);
  // Garante que o operador exibido é válido para o tipo (defensivo).
  const operadorSeguro = opsValidos.includes(condicao.operador)
    ? condicao.operador
    : opsValidos[0];
  const mostraValor =
    operadorSeguro !== "vazio" && operadorSeguro !== "preenchido";
  const inputType =
    campoTipo === "data"
      ? "date"
      : campoTipo === "numero" ||
          campoTipo === "moeda" ||
          campoTipo === "percentual"
        ? "number"
        : "text";

  /** Ao trocar o campo, o tipo muda: reseta o operador se ficou inválido. */
  function handleCampo(novoCampo: string) {
    const novoTipo =
      campos.find((c) => c.value === novoCampo)?.tipo ?? "texto";
    const ops = operadoresParaTipo(novoTipo);
    const operador = ops.includes(condicao.operador)
      ? condicao.operador
      : ops[0]!;
    onChange({ ...condicao, campo: novoCampo, operador });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Campo */}
      <select
        value={condicao.campo}
        onChange={(e) => handleCampo(e.target.value)}
        aria-label="Campo da condição"
        className="h-8 flex-1 min-w-[120px] rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
      >
        <option value="">-- campo --</option>
        {campos.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>

      {/* Operador , só os válidos para o tipo do campo */}
      <select
        value={operadorSeguro}
        onChange={(e) =>
          onChange({
            ...condicao,
            operador: e.target.value as Condicao["operador"],
          })
        }
        aria-label="Operador da condição"
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 cursor-pointer"
      >
        {OPERADORES.filter((op) => opsValidos.includes(op.value)).map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Valor , escondido para vazio/preenchido; input conforme o tipo */}
      {mostraValor && (
        <Input
          type={inputType}
          value={condicao.valor}
          onChange={(e) => onChange({ ...condicao, valor: e.target.value })}
          placeholder={inputType === "text" ? "valor…" : undefined}
          aria-label="Valor da condição"
          className="h-8 flex-1 min-w-[100px] text-sm"
        />
      )}

      {/* Remover */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        aria-label="Remover condição"
        className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GrupoBuilder
// ---------------------------------------------------------------------------

interface GrupoBuilderProps {
  grupo: Grupo;
  campos: CampoOpcao[];
  onChange: (next: Grupo) => void;
  onRemove?: () => void;
  depth?: number;
}

export function GrupoBuilder({
  grupo,
  campos,
  onChange,
  onRemove,
  depth = 0,
}: GrupoBuilderProps) {
  function setConector(conector: "E" | "OU") {
    onChange({ ...grupo, conector });
  }

  function updateItem(i: number, item: GrupoItem) {
    const itens = [...grupo.itens];
    itens[i] = item;
    onChange({ ...grupo, itens });
  }

  function removeItem(i: number) {
    const itens = grupo.itens.filter((_, idx) => idx !== i);
    onChange({ ...grupo, itens });
  }

  function addCondicao() {
    const nova: Condicao = {
      campo: campos[0]?.value ?? "",
      operador: "igual",
      valor: "",
    };
    onChange({ ...grupo, itens: [...grupo.itens, nova] });
  }

  function addGrupo() {
    const novo: Grupo = { conector: "E", itens: [] };
    onChange({ ...grupo, itens: [...grupo.itens, novo] });
  }

  const isNested = depth > 0;

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-border p-3",
        isNested && "border-violet-500/30 bg-violet-500/5",
      )}
    >
      {/* Header do grupo: conector + remover */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {isNested ? "Subgrupo:" : "Combinar com:"}
        </span>
        {(["E", "OU"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setConector(c)}
            aria-pressed={grupo.conector === c}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              grupo.conector === c
                ? "border-violet-500 bg-violet-500/15 text-violet-500"
                : "border-border text-muted-foreground hover:bg-muted/40",
            )}
          >
            {c}
          </button>
        ))}
        {isNested && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label="Remover subgrupo"
            className="ml-auto h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        )}
      </div>

      {/* Itens do grupo */}
      <div className="space-y-2">
        {grupo.itens.map((item, i) =>
          "campo" in item ? (
            <CondicaoRow
              key={i}
              condicao={item as Condicao}
              campos={campos}
              onChange={(next) => updateItem(i, next)}
              onRemove={() => removeItem(i)}
            />
          ) : (
            <GrupoBuilder
              key={i}
              grupo={item as Grupo}
              campos={campos}
              onChange={(next) => updateItem(i, next)}
              onRemove={() => removeItem(i)}
              depth={depth + 1}
            />
          ),
        )}
        {grupo.itens.length === 0 && (
          <p className="text-xs text-muted-foreground italic">
            Nenhuma condição , adicione abaixo.
          </p>
        )}
      </div>

      {/* Ações do grupo */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCondicao}
          className="h-7 gap-1.5 cursor-pointer text-xs"
        >
          <Plus className="size-3.5" aria-hidden />
          Condição
        </Button>
        {depth < 2 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addGrupo}
            className="h-7 gap-1.5 cursor-pointer text-xs"
          >
            <Plus className="size-3.5" aria-hidden />
            Subgrupo
          </Button>
        )}
      </div>
    </div>
  );
}
