// F6 (P2) , A view do relatorio salvo migrou para /relatorios-2/d/<id> (para
// acender "Meus relatorios" na sidebar). Esta rota antiga so redireciona,
// preservando links/bookmarks ja existentes.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ savedId: string }>;
}

export default async function RelatorioDinamicoRedirect({ params }: PageProps) {
  const { savedId } = await params;
  redirect(`/relatorios-2/d/${savedId}`);
}
