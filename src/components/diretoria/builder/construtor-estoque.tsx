"use client";

// Wrapper client do construtor para a tela de Estoque & Compras. Injeta o
// renderBloco de estoque + os filtros globais de dimensão (família/marca/local).
// Existe porque funções (renderBloco) não cruzam a fronteira server->client: a
// página (server) passa só dados; este wrapper (client) injeta o comportamento.

import { useMemo } from "react";

import { ConstrutorGrid, type FiltroDimensaoConfig } from "./construtor-grid";
import { renderBlocoEstoque } from "@/components/diretoria/blocos/blocos-estoque";
import { derivarEstoque, opcoesEstoque } from "@/lib/diretoria/derivar-estoque";
import type { EstoqueData } from "@/components/diretoria/estoque/estoque-screen";
import type { BlocoLayout } from "@/lib/diretoria/builder/layout";
import type { DiretoriaArea } from "@/lib/diretoria/capabilities";

const numFmt = new Intl.NumberFormat("pt-BR");

export function ConstrutorEstoque({
  tela,
  data,
  layoutInicial,
  dominios,
  podeEditarPessoal,
  podeEditarGlobal,
}: {
  tela: DiretoriaArea;
  data: EstoqueData;
  layoutInicial: BlocoLayout[];
  dominios: string[];
  podeEditarPessoal: boolean;
  podeEditarGlobal: boolean;
}) {
  const filtroConfig = useMemo<FiltroDimensaoConfig<EstoqueData>>(() => {
    const o = opcoesEstoque(data.granular);
    return {
      dimensoes: [
        { chave: "familia", rotulo: "Família", opcoes: o.familias },
        { chave: "marca", rotulo: "Marca", opcoes: o.marcas },
        { chave: "local", rotulo: "Local", opcoes: o.locais },
      ],
      // O índice vem resolvido do servidor (Configuração > Diretoria · Vendas) dentro dos
      // indicadores. Sem repassá-lo, o filtro cruzado recomputava o card "Valor em estoque"
      // com o índice padrão e o número mudava só por ter aplicado um filtro.
      derivar: (d, f) => ({
        ...d,
        ...derivarEstoque(
          d.granular,
          {
            familia: f.familia ?? null,
            marca: f.marca ?? null,
            local: f.local ?? null,
          },
          d.indicadores.indice,
        ),
      }),
      contar: (df, db) => `${numFmt.format(df.catalogo.total)} de ${numFmt.format(db.catalogo.total)} modelos`,
    };
  }, [data.granular]);

  return (
    <ConstrutorGrid
      tela={tela}
      data={data}
      layoutInicial={layoutInicial}
      dominios={dominios}
      podeEditarPessoal={podeEditarPessoal}
      podeEditarGlobal={podeEditarGlobal}
      renderBloco={renderBlocoEstoque}
      filtroConfig={filtroConfig}
    />
  );
}
