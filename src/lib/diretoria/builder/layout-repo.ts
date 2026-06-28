// Repositório de layout do construtor (Onda 1). Carrega o layout de uma tela:
// o personalizado do usuário, se existir; senão o PADRÃO (dono nulo + isPadrao).
// salvarLayout entra na Onda 4 (editor).
import type { PrismaClient } from "@/generated/prisma/client";
import type { BlocoLayout } from "./layout";

function mapBlocos(blocos: { componenteId: string; ordem: number; larguraQuartos: number; alturaU: number }[]): BlocoLayout[] {
  return blocos.map((b) => ({
    componenteId: b.componenteId,
    ordem: b.ordem,
    largura: b.larguraQuartos,
    altura: b.alturaU,
  }));
}

/**
 * Carrega os blocos do layout de uma tela para um usuário. Preferência: layout
 * do próprio usuário; fallback: layout padrão da tela. Vazio se não houver nenhum.
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
  return fonte ? mapBlocos(fonte.blocos) : [];
}
