import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { isPublicPath } from "./lib/auth/public-paths";

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { nextUrl, auth: session } = req;

  // Lista em src/lib/auth/public-paths.ts (pura e testada). Inclui os endpoints
  // de recebimento de webhook, que são chamados por sistemas externos sem sessão
  // e se autenticam pelo token do próprio webhook.
  if (isPublicPath(nextUrl.pathname)) return NextResponse.next();

  if (!session) {
    const url = new URL(
      `/login?callbackUrl=${encodeURIComponent(nextUrl.pathname)}`,
      nextUrl,
    );
    return Response.redirect(url);
  }

  if (
    (session.user as never as { mustChangePassword: boolean })?.mustChangePassword &&
    !nextUrl.pathname.startsWith("/perfil/trocar-senha")
  ) {
    return Response.redirect(new URL("/perfil/trocar-senha", nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
