import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sidebarUser = {
    name: user.name,
    email: user.email,
    platformRole: user.platformRole,
    avatarUrl: user.avatarUrl,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={sidebarUser} />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        <div className="pt-16 pb-8 sm:pt-8">{children}</div>
      </main>
    </div>
  );
}
