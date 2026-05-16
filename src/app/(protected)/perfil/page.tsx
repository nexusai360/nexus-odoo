import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageShell } from "@/components/layout/page-shell";
import { ProfileContent } from "@/components/profile/profile-content";

export const metadata = { title: "Meu Perfil | Nexus Odoo" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true },
  });
  const createdAtIso = dbUser?.createdAt
    ? dbUser.createdAt.toISOString()
    : new Date().toISOString();

  return (
    <PageShell variant="narrow">
      <ProfileContent
        initialName={user.name}
        initialEmail={user.email}
        initialAvatarUrl={user.avatarUrl ?? null}
        initialTheme={user.theme}
        createdAt={createdAtIso}
      />
    </PageShell>
  );
}
