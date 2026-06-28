import { LayoutDashboard } from "lucide-react";

import { PageShell } from "@/components/layout/page-shell";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import {
  requireDiretoriaArea,
  userCapabilities,
  seesAllDiretoria,
  userUfs,
} from "@/lib/diretoria/access";
import { carregarLayout } from "@/lib/diretoria/builder/layout-repo";
import { normalizar } from "@/lib/diretoria/builder/layout";
import { filtrarPermitidos } from "@/lib/diretoria/builder/gating";
import { resolverBlocos } from "@/lib/diretoria/builder/loaders";
import { componentePorId } from "@/lib/diretoria/builder/catalogo";
import { GridRelatorio, BlocoCard } from "@/components/diretoria/builder/grid-relatorio";
import { renderComponente } from "@/components/diretoria/builder/render-componente";

export const dynamic = "force-dynamic";

// Prévia do construtor de relatórios (Onda 1). Monta a tela "estoque-demo" a
// partir do layout salvo, com gating no server. As telas finais migram para este
// motor nas ondas seguintes.
export default async function DiretoriaRelatoriosPage() {
  const user = await requireDiretoriaArea("estoque");

  const brutos = await carregarLayout(prisma, "estoque-demo", user.id);
  const blocos = normalizar(brutos);

  const caps = await userCapabilities(user);
  const todas = seesAllDiretoria(user.platformRole);
  const pode = (cap: string) => todas || caps.has(cap);
  const permitidos = filtrarPermitidos(blocos, pode);

  const escopoUfs = await userUfs(user);
  const resultados = await resolverBlocos(
    prisma,
    permitidos.map((b) => b.componenteId),
    { escopoUfs },
  );

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={LayoutDashboard}
        title="Relatórios (prévia do construtor)"
        subtitle="Montagem por componentes do catálogo. Layout salvo, com permissão por componente."
      />
      {permitidos.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Nenhum componente disponível para o seu acesso.
        </p>
      ) : (
        <GridRelatorio>
          {permitidos.map((b) => {
            const comp = componentePorId(b.componenteId)!;
            const res = resultados.get(b.componenteId);
            return (
              <BlocoCard
                key={`${b.componenteId}-${b.ordem}`}
                titulo={comp.nome}
                fonteDado={comp.fonteDado}
                largura={b.largura}
                altura={b.altura}
              >
                {res?.ok ? (
                  renderComponente(b.componenteId, res.dado)
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">Indisponível.</p>
                )}
              </BlocoCard>
            );
          })}
        </GridRelatorio>
      )}
    </PageShell>
  );
}
