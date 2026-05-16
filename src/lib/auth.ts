import { auth } from "@/auth";
import type { AuthUser } from "@/lib/auth-helpers";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const u = session.user as Required<typeof session.user>;
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    platformRole: u.platformRole,
    isOwner: u.isOwner,
    mustChangePassword: u.mustChangePassword,
    avatarUrl: u.avatarUrl ?? null,
    theme: u.theme,
  };
}
