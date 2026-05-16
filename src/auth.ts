/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { authorizeCredentials } from "@/lib/auth-helpers";
import { headers } from "next/headers";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

// auth.ts roda em Node Runtime — aqui mora o callback `jwt`, que consulta o
// Prisma para manter o token fresco. O middleware (Edge) usa apenas authConfig.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
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
        } catch (err) {
          // Falha transitória do banco: mantém o token anterior em vez de
          // derrubar todas as sessões. Logado para não silenciar de vez —
          // se recorrente, indica problema de conectividade com o Postgres.
          console.error("[auth.jwt] falha ao revalidar token:", err);
        }
      }

      return token;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const headersList = await headers();
        const ip =
          headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          headersList.get("x-real-ip") ||
          "0.0.0.0";

        const user = await authorizeCredentials(parsed.data, ip);
        return user;
      },
    }),
  ],
});
