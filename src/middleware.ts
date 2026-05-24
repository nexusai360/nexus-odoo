import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const { nextUrl, auth: session } = req;

  const isPublic =
    nextUrl.pathname === "/login" ||
    nextUrl.pathname === "/forgot-password" ||
    nextUrl.pathname === "/reset-password" ||
    nextUrl.pathname === "/verify-email" ||
    nextUrl.pathname.startsWith("/api/auth/") ||
    nextUrl.pathname.startsWith("/api/health") ||
    // Webhook receptor do WhatsApp (n8n→plataforma): endpoint público
    // server-to-server , autentica por HMAC no próprio handler, não por sessão.
    nextUrl.pathname === "/api/integrations/whatsapp/inbound";

  if (isPublic) return NextResponse.next();

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
