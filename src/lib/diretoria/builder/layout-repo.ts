// Repositório de layout do construtor. Carrega o layout de uma tela (o
// personalizado do usuário, se existir; senão o oficial/padrão). Salva layout
// (oficial ou pessoal) e remove o pessoal (restaurar para o oficial). Posição
// (x,y) é guardada no configJson do bloco; tamanho em larguraQuartos/alturaU
// (reinterpretados como OITAVOS, 2..8).
import type { PrismaClient } from "@/generated/prisma/client";
import { normalizar, type BlocoLayout } from "./layout";

type BlocoRow = {
  componenteId: string;
  ordem: number;
  larguraQuartos: number;
  alturaU: number;
  configJson?: unknown;
};

function mapBlocos(blocos: BlocoRow[]): BlocoLayout[] {
  return blocos.map((b) => {
    const cfg = (b.configJson ?? {}) as { x?: number; y?: number };
    return {
      componenteId: b.componenteId,
      ordem: b.ordem,
      largura: b.larguraQuartos,
      altura: b.alturaU,
      x: cfg.x ?? 0,
      y: cfg.y ?? 0,
    };
  });
}

/**
 * Carrega os blocos do layout de uma tela para um usuário. Preferência: layout
 * do próprio usuário; fallback: layout oficial (isPadrao). Vazio se não houver.
 */
export async function carregarLayout(
  prisma: PrismaClient,
  tela: string,
  userId: string,
): Promise<BlocoLayout[]> {
  const doUsuario = await prisma.diretoriaRelatorio.findFirst({
    where: { tela, donoUserId: userId },
    include: { blocos: { orderBy: { ordem: "asc" } } },
  });
  const fonte =
    doUsuario ??
    (await prisma.diretoriaRelatorio.findFirst({
      where: { tela, isPadrao: true, donoUserId: null },
      include: { blocos: { orderBy: { ordem: "asc" } } },
    }));
  return fonte ? mapBlocos(fonte.blocos as BlocoRow[]) : [];
}

/** True se o usuário tem um layout pessoal salvo para a tela. */
export async function temLayoutPessoal(
  prisma: PrismaClient,
  tela: string,
  userId: string,
): Promise<boolean> {
  const r = await prisma.diretoriaRelatorio.findFirst({
    where: { tela, donoUserId: userId },
    select: { id: true },
  });
  return r != null;
}

/**
 * Salva o layout de uma tela. `donoUserId=null & isPadrao=true` grava o oficial
 * (global); `donoUserId=<user>` grava o pessoal. Substitui os blocos existentes.
 */
export async function salvarLayout(
  prisma: PrismaClient,
  params: { tela: string; donoUserId: string | null; isPadrao: boolean; blocos: BlocoLayout[] },
): Promise<void> {
  const norm = normalizar(params.blocos);
  await prisma.$transaction(async (tx) => {
    let rel = await tx.diretoriaRelatorio.findFirst({
      where: { tela: params.tela, donoUserId: params.donoUserId },
      select: { id: true },
    });
    if (!rel) {
      rel = await tx.diretoriaRelatorio.create({
        data: { tela: params.tela, donoUserId: params.donoUserId, isPadrao: params.isPadrao },
        select: { id: true },
      });
    } else {
      await tx.diretoriaRelatorioBloco.deleteMany({ where: { relatorioId: rel.id } });
    }
    if (norm.length) {
      await tx.diretoriaRelatorioBloco.createMany({
        data: norm.map((b, i) => ({
          relatorioId: rel!.id,
          componenteId: b.componenteId,
          ordem: i,
          larguraQuartos: b.largura,
          alturaU: b.altura,
          configJson: { x: b.x, y: b.y },
        })),
      });
    }
  });
}

/** Remove o layout pessoal do usuário para a tela (restaura para o oficial). */
export async function excluirLayoutPessoal(
  prisma: PrismaClient,
  tela: string,
  userId: string,
): Promise<void> {
  await prisma.diretoriaRelatorio.deleteMany({ where: { tela, donoUserId: userId } });
}
