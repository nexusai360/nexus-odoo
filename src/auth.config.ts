/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextAuthConfig } from "next-auth";

// Config edge-safe: usado pelo middleware (Edge Runtime). NÃO pode importar
// Prisma nem nenhum módulo Node. Os callbacks aqui (authorized, session)
// apenas leem o token/request. O callback `jwt` , que faz query no banco ,
// vive em auth.ts (Node Runtime).
export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic =
        nextUrl.pathname === "/login" ||
        nextUrl.pathname === "/forgot-password" ||
        nextUrl.pathname === "/reset-password" ||
        nextUrl.pathname === "/verify-email" ||
        nextUrl.pathname.startsWith("/api/auth/") ||
        nextUrl.pathname.startsWith("/api/health");
      if (isPublic) return true;
      if (isLoggedIn) return true;
      return false;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).platformRole = token.platformRole;
        (session.user as any).isOwner = token.isOwner;
        (session.user as any).mustChangePassword = token.mustChangePassword;
        (session.user as any).avatarUrl = token.avatarUrl;
        (session.user as any).theme = token.theme;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
  providers: [],
} satisfies NextAuthConfig;
