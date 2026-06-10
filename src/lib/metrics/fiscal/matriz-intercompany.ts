import type { Prisma, PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";
import { carregarParticipantesGrupo, ehNotaIntragrupo } from "../../fiscal/grupo";

export interface MatrizLinha {
  vendedorId: number | null;
  vendedorNome: string;
  compradorChave: string; // participanteId ou nome
  compradorNome: string;
  valor: number;
  totalNotas: number;
}

export interface MatrizIntercompanyResultado {
  linhas: MatrizLinha[];
  total: number;
  totalPares: number;
}

/**
 * Matriz vendedor (emitente) x comprador (participante do grupo), so notas intragrupo
 * (cascata doc->nome). Soma vrProdutos do CABECALHO da nota (difere da metrica de
 * receita, que soma vrProdutos do ITEM, em ~0,02%). Comprador resolvido pelo nome
 * quando nao ha parceiro no cache.
 */
export async function matrizIntercompany(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<MatrizIntercompanyResultado> {
  const where: Prisma.FatoNotaFiscalWhereInput = {
    entradaSaida: "1",
    situacaoNfe: "autorizada",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
  };
  const notas = await prisma.fatoNotaFiscal.findMany({
    where,
    select: { empresaId: true, empresaNome: true, participanteId: true, participanteNome: true, vrProdutos: true },
  });
  const participantesGrupo = await carregarParticipantesGrupo(prisma);

  const mapa = new Map<string, MatrizLinha>();
  for (const n of notas) {
    if (!ehNotaIntragrupo(n, participantesGrupo)) continue;
    const compradorChave = n.participanteId !== null ? `id:${n.participanteId}` : `nome:${n.participanteNome ?? ""}`;
    const chave = `${n.empresaId ?? "?"}->${compradorChave}`;
    const valor = Number(n.vrProdutos ?? 0);
    const atual = mapa.get(chave);
    if (atual) {
      atual.valor += valor;
      atual.totalNotas += 1;
    } else {
      mapa.set(chave, {
        vendedorId: n.empresaId,
        vendedorNome: n.empresaNome ?? "Desconhecido",
        compradorChave,
        compradorNome: n.participanteNome ?? "Desconhecido",
        valor,
        totalNotas: 1,
      });
    }
  }
  const linhas = [...mapa.values()].sort((a, b) => b.valor - a.valor);
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return { linhas, total, totalPares: linhas.length };
}
