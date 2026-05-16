/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextAuthConfig } from "next-auth";

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
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.platformRole = (user as any).platformRole;
        token.isOwner = (user as any).isOwner;
        token.mustChangePassword = (user as any).mustChangePassword;
        token.avatarUrl = (user as any).avatarUrl;
        token.theme = (user as any).theme;
        token.name = (user as any).name;
      }

      if (token.id) {
        try {
          const { prisma } = await import("@/lib/prisma");
          const fresh = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              isActive: true,
              isOwner: true,
              name: true,
              avatarUrl: true,
              theme: true,
              platformRole: true,
              mustChangePassword: true,
            },
          });
          if (fresh) {
            token.platformRole = fresh.platformRole;
            token.isOwner = fresh.isOwner;
            token.name = fresh.name;
            token.avatarUrl = fresh.avatarUrl;
            token.theme = fresh.theme;
            token.mustChangePassword = fresh.mustChangePassword;
            if (!fresh.isActive) return null as any;
          }
        } catch {
          // se falhar, manter token anterior — não derrubar auth
        }
      }

      return token;
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
