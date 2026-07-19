"use client";

// A-15 , Composição de valor dos kits (Diretoria > Estoque).
// Substitui o Excel manual do time (que joga o valor todo na estrutura e zera o painel): rateia o
// valor de referência do kit (preço de tabela por padrão) entre os componentes, proporcional ao
// custo, e mostra estrutura vs painel. Fonte única: queryComposicaoKit (a mesma do Nex), carregada
// sob demanda pela Server Action carregarComposicaoKit. Honestidade: onde falta preço, mostra o
// buraco em vez de inventar. Sem emoji, sem travessão, dark+light, tokens semânticos.

import { useState, useTransition } from "react";
import { Boxes, AlertTriangle, Loader2, RotateCw, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataTable, type ColumnDef } from "@/components/charts/data-table";
import { getColorByIndex } from "@/components/charts/colors";
import { brl, pct1 } from "@/components/diretoria/kit/format";
import { carregarComposicaoKit } from "@/lib/actions/composicao-kit";
import type { KitResumo, ComposicaoKit } from "@/lib/reports/queries/composicao-kit";

function baseLabel(c: ComposicaoKit): string {
  switch (c.baseValor) {
    case "preco_tabela_padrao":
      return "Preço de tabela (Venda Padrão)";
    case "preco_tabela_smart":
      return "Preço de tabela (Venda Smart)";
    case "venda_real_mediana":
      return `Mediana de ${c.nVendas} ${c.nVendas === 1 ? "venda real" : "vendas reais"}`;
    case "sem_referencia":
      return "Sem preço de referência";
  }
}

/** Barra empilhada estrutura vs painel: um segmento por componente, largura = % do valor. */
function BarraComposicao({ c }: { c: ComposicaoKit }) {
  const segmentos = c.componentes
    .filter((comp) => comp.percentual > 0)
    .map((comp, i) => ({ nome: comp.nome ?? "Sem nome", pct: comp.percentual, cor: getColorByIndex(i) }));
  if (segmentos.length === 0) return null;
  const resumo = segmentos.map((s) => `${s.nome} ${pct1(s.pct)}`).join(", ");
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-4 w-full overflow-hidden rounded-full ring-1 ring-inset ring-border/60"
        role="img"
        aria-label={`Composição do valor: ${resumo}`}
      >
        {segmentos.map((s) => (
          <div
            key={s.nome}
            className="h-full min-w-[2px]"
            style={{ width: `${s.pct}%`, backgroundColor: s.cor }}
            title={`${s.nome}: ${pct1(s.pct)}`}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {segmentos.map((s) => (
          <li key={s.nome} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.cor }} aria-hidden />
            <span className="font-medium text-foreground">{s.nome}</span>
            <span className="tabular-nums">{pct1(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detalhe({ c }: { c: ComposicaoKit }) {
  const rateando = c.coberturaCompleta && c.valorReferencia > 0;
  const semPreco = c.componentes.filter((comp) => comp.semPreco).length;

  const linhas = c.componentes.map((comp) => ({
    componente: comp.nome ?? "Sem nome",
    origem: comp.ehMatrix ? "Matrix" : "Acessório",
    custo: comp.precoCusto ?? 0,
    tabela: comp.precoVendaPadrao ?? comp.precoVendaSmart ?? 0,
    rateado: rateando ? comp.valorRateado : 0,
    participacao: rateando ? comp.percentual : 0,
    _semRateio: !rateando,
  }));

  const colunas: ColumnDef<(typeof linhas)[number]>[] = [
    { key: "componente", header: "Componente", tipo: "texto" },
    {
      key: "origem",
      header: "Origem",
      tipo: "tag",
      tagCores: {
        Matrix: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
        Acessório: "bg-muted text-muted-foreground",
      },
    },
    { key: "custo", header: "Custo", tipo: "moeda" },
    { key: "tabela", header: "Venda tabela", tipo: "moeda" },
    ...(rateando
      ? ([
          { key: "rateado", header: "Valor rateado", tipo: "moeda" },
          { key: "participacao", header: "% do kit", tipo: "percentual" },
        ] as ColumnDef<(typeof linhas)[number]>[])
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">{c.kitNome ?? `Kit ${c.kitId}`}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ring-border/60",
                c.ehMatrix ? "bg-violet-500/10 text-violet-600 dark:text-violet-300" : "bg-muted text-muted-foreground",
              )}
            >
              {c.marcaNome ?? "Sem marca"}
            </span>
            <span>{baseLabel(c)}</span>
            {c.multiplasListas ? <span>(lista de material ativa)</span> : null}
          </span>
        </div>
        {c.valorReferencia > 0 ? (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Valor de referência</div>
            <div className="text-lg font-semibold tabular-nums text-foreground">{brl.format(c.valorReferencia)}</div>
          </div>
        ) : null}
      </div>

      {rateando ? (
        <BarraComposicao c={c} />
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {c.baseValor === "sem_referencia"
              ? "Este kit não tem preço de tabela nem vendas suficientes para ratear o valor. Mostramos o custo e o preço de tabela de cada componente."
              : `${semPreco} ${semPreco === 1 ? "componente sem preço" : "componentes sem preço"}: o rateio do valor não é exibido para não inflar os demais. Mostramos custo e preço de tabela diretos.`}
          </span>
        </div>
      )}

      <DataTable
        columns={colunas}
        rows={linhas}
        compactoInicial
        alturaFluida
        exportFilename={`composicao-kit-${c.kitId}`}
        estado={linhas.length === 0 ? "vazio" : "ok"}
      />
    </div>
  );
}

export function ComposicaoKitBloco({ kits }: { kits: KitResumo[] }) {
  const [kitId, setKitId] = useState<string>("");
  const [comp, setComp] = useState<ComposicaoKit | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const opcoes = kits.map((k) => ({
    value: String(k.kitId),
    label: k.nome ?? `Kit ${k.kitId}`,
    description: k.marcaNome ?? undefined,
  }));

  function selecionar(v: string) {
    setKitId(v);
    setErro(null);
    if (!v) {
      setComp(null);
      return;
    }
    start(async () => {
      const r = await carregarComposicaoKit(Number(v));
      if (r.ok && r.composicao) {
        setComp(r.composicao);
        setErro(null);
      } else {
        setComp(null);
        setErro(r.erro ?? "Não foi possível carregar a composição");
      }
    });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="composicao-kit-select" className="text-xs font-medium text-muted-foreground">
          Escolha um kit para ver como o valor se distribui entre a estrutura e o painel
        </label>
        <SearchableSelect
          value={kitId}
          onChange={selecionar}
          options={opcoes}
          placeholder="Selecione um kit"
          searchPlaceholder="Buscar kit por nome"
          triggerClassName="max-w-md"
        />
      </div>

      {pending ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Calculando composição...
        </div>
      ) : erro ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-500" aria-hidden />
          <p className="text-sm text-muted-foreground">{erro}</p>
          <button
            type="button"
            onClick={() => selecionar(kitId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/10 px-3 py-1.5 text-sm text-violet-700 transition-colors hover:bg-violet-600/20 dark:text-violet-200"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden /> Tentar de novo
          </button>
        </div>
      ) : comp ? (
        <Detalhe c={comp} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">
            Nenhum kit selecionado. Escolha um kit acima para ver a composição do valor por componente.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
            <Info className="h-3.5 w-3.5" aria-hidden />
            {kits.length} {kits.length === 1 ? "kit disponível" : "kits disponíveis"}
          </p>
        </div>
      )}
    </div>
  );
}
