// Painel do MODO SOMBRA da classificação de receita (super admin).
//
// Mostra o placar entre a regra que vale hoje (nome da operação contém "venda") e a regra
// nova em observação (natureza da operação), mais as notas divergentes e as naturezas ainda
// não mapeadas. Nada aqui altera número exibido em lugar nenhum da plataforma.
//
// Laudo que originou: docs/pericia-classificacao-receita-2026-07-13.md

import { redirect } from "next/navigation";
import { Scale } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aquecerCorte } from "@/lib/corte-app";
import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import {
  obterPlacar,
  listarDivergencias,
  listarNaturezasDesconhecidas,
} from "@/lib/fiscal/divergencias";
import { ClassificacaoFiscalContent } from "@/components/configuracao/classificacao-fiscal-content";

export const metadata = { title: "Classificação fiscal | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function ClassificacaoFiscalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  await aquecerCorte();

  const [placar, divergencias, naturezasDesconhecidas] = await Promise.all([
    obterPlacar(prisma),
    listarDivergencias(prisma),
    listarNaturezasDesconhecidas(prisma),
  ]);

  return (
    <PageShell>
      <PageHeader
        icon={Scale}
        title="Classificação fiscal"
        subtitle="Acompanhamento da regra nova de receita, rodando em paralelo à que vale hoje."
      />
      <ClassificacaoFiscalContent
        placar={placar}
        divergencias={divergencias}
        naturezasDesconhecidas={naturezasDesconhecidas}
      />
    </PageShell>
  );
}
