import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/layout/page-shell";
import { ProfileContent } from "@/components/profile/profile-content";
import { REPORT_DOMAINS } from "@/lib/reports/domains";

export const metadata = { title: "Meu Perfil | Nexus Odoo" };
export const dynamic = "force-dynamic";

/** Domínios , privilegiados (super_admin/admin) enxergam todos. */
const ALL_DOMAIN_IDS = REPORT_DOMAINS.map((d) => d.id);

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Lê o próprio cadastro: dados, números de WhatsApp e domínios de acesso.
  const [dbUser, whatsappRows, domainRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { createdAt: true },
    }),
    prisma.userWhatsappNumber.findMany({
      where: { userId: user.id },
      select: { phoneE164: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userDomainAccess.findMany({
      where: { userId: user.id },
      select: { domain: true },
    }),
  ]);

  const createdAtIso = dbUser?.createdAt
    ? dbUser.createdAt.toISOString()
    : new Date().toISOString();

  const isPrivileged =
    user.platformRole === "super_admin" || user.platformRole === "admin";
  const domains = isPrivileged
    ? ALL_DOMAIN_IDS
    : domainRows.map((r) => r.domain);

  return (
    <PageShell variant="narrow">
      <ProfileContent
        initialName={user.name}
        initialEmail={user.email}
        initialAvatarUrl={user.avatarUrl ?? null}
        initialTheme={user.theme}
        createdAt={createdAtIso}
        whatsappNumbers={whatsappRows.map((r) => r.phoneE164)}
        domains={domains}
        userId={user.id}
        platformRole={user.platformRole}
      />
    </PageShell>
  );
}
