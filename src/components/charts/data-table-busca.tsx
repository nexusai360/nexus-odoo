"use client";

/**
 * Busca inteligente por facets do DataTable (Fase 4 do B-09).
 *
 * Ao digitar, sugere valores reais das colunas de texto/tag no formato
 * "Campo: valor". Escolher uma sugestão acumula o valor numa condição
 * `esta_em_lista` POR CAMPO no grupo de filtro (OU dentro do campo, E entre
 * campos), espelhando a semântica do filtro-por-coluna nativo. Isso evita o
 * "tabela vazia" que aconteceria ao somar `uf igual SP` E `uf igual RJ`.
 * A busca textual livre continua funcionando pelo mesmo input.
 */

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  type Grupo,
  type Condicao,
  isGrupo,
  SEP_LISTA,
} from "@/lib/reports/filtro-avancado";

export type Sugestao = { campo: string; label: string; valor: string };

type ColunaFacet = { key: string; header: string; tipo: string };

/**
 * Sugestões "Campo: valor" a partir dos valores distintos das colunas de
 * texto/tag que casam o termo (case-insensitive). Colunas ordenáveis
 * (numero/moeda/data/percentual) e a coluna de tags-array ficam de fora (o
 * membership não é escalar). Retorna [] para termo vazio.
 */
export function montarSugestoes(
  termo: string,
  colunas: ColunaFacet[],
  valoresPorColuna: Record<string, string[]>,
  limite = 8,
): Sugestao[] {
  const q = termo.trim().toLowerCase();
  if (q === "") return [];

  const out: Sugestao[] = [];
  for (const col of colunas) {
    if (col.tipo !== "texto" && col.tipo !== "tag") continue;
    const valores = valoresPorColuna[col.key];
    if (!valores) continue;
    for (const v of valores) {
      if (v.toLowerCase().includes(q)) {
        out.push({ campo: col.key, label: col.header, valor: v });
        if (out.length >= limite) return out;
      }
    }
  }
  return out;
}

/**
 * Acumula uma sugestão de facet no grupo. Se já existe uma condição
 * `esta_em_lista` para o mesmo campo no nível raiz, acrescenta o valor à lista
 * (sem duplicar). Caso contrário, cria a condição. Imutável.
 */
export function adicionarFacetAoGrupo(grupo: Grupo, s: Sugestao): Grupo {
  const idx = grupo.itens.findIndex(
    (item) =>
      !isGrupo(item) &&
      item.campo === s.campo &&
      item.operador === "esta_em_lista",
  );

  if (idx >= 0) {
    const cond = grupo.itens[idx] as Condicao;
    const atuais = cond.valor.split(SEP_LISTA).filter((v) => v !== "");
    if (atuais.includes(s.valor)) return grupo; // já presente, no-op
    const itens = [...grupo.itens];
    itens[idx] = { ...cond, valor: [...atuais, s.valor].join(SEP_LISTA) };
    return { ...grupo, itens };
  }

  const nova: Condicao = {
    campo: s.campo,
    operador: "esta_em_lista",
    valor: s.valor,
  };
  return { ...grupo, itens: [...grupo.itens, nova] };
}

interface BuscaInteligenteProps {
  value: string;
  onChange: (v: string) => void;
  sugestoes: Sugestao[];
  onEscolher: (s: Sugestao) => void;
}

export function BuscaInteligente({
  value,
  onChange,
  sugestoes,
  onEscolher,
}: BuscaInteligenteProps) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reabre ao aparecerem sugestões novas; reseta o item ativo.
  useEffect(() => {
    setAtivo(0);
    if (sugestoes.length > 0) setAberto(true);
  }, [sugestoes]);

  // Fecha ao clicar fora.
  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const mostra = aberto && sugestoes.length > 0;

  function escolher(s: Sugestao) {
    onEscolher(s);
    setAberto(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!mostra) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((i) => (i + 1) % sugestoes.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((i) => (i - 1 + sugestoes.length) % sugestoes.length);
    } else if (e.key === "Enter") {
      const s = sugestoes[ativo];
      if (s) {
        e.preventDefault();
        escolher(s);
      }
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        placeholder="Buscar ou filtrar…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={mostra}
        aria-controls="busca-sugestoes"
        aria-activedescendant={mostra ? `sugestao-${ativo}` : undefined}
        className="h-8 max-w-xs pl-7 text-sm"
        data-table-search
      />
      {mostra && (
        <ul
          id="busca-sugestoes"
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {sugestoes.map((s, i) => (
            <li
              key={`${s.campo}:${s.valor}`}
              id={`sugestao-${i}`}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                // mousedown (antes do blur) para não fechar antes de escolher.
                e.preventDefault();
                escolher(s);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-sm",
                i === ativo ? "bg-violet-500/10" : "hover:bg-muted/50",
              )}
            >
              <span className="text-xs font-medium text-muted-foreground">
                {s.label}:
              </span>
              <span className="truncate text-foreground">{s.valor}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
