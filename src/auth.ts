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

// auth.ts roda em Node Runtime , aqui mora o callback `jwt`, que consulta o
// Prisma para manter o token fresco. O middleware (Edge) usa apenas authConfig.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  events: {
    // Logout: registra na auditoria quando o usuário encerra a sessão. Na
    // estratégia JWT o evento recebe o token; usamos o id para o autor do log.
    async signOut(message) {
      try {
        const token = (message as { token?: { id?: string } }).token;
        const userId = token?.id ?? null;
        if (!userId) return;
        const { logAudit } = await import("@/lib/audit");
        await logAudit({
          userId,
          action: "logout",
          targetType: "User",
          targetId: userId,
        });
      } catch (err) {
        console.warn("[auth.signOut] falha ao registrar logout:", err);
      }
    },
  },
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
              lastActivityAt: true,
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
            // Última atividade: este callback roda a cada requisição autenticada
            // (page load, server action, navegação). Registra no máximo 1x/min,
            // via SQL cru para não bumpar `updated_at` (@updatedAt).
            const lastMs = fresh.lastActivityAt?.getTime() ?? 0;
            if (Date.now() - lastMs > 60_000) {
              await prisma.$executeRaw`UPDATE users SET last_activity_at = NOW() WHERE id = ${token.id}::uuid`.catch(
                (e: unknown) => console.warn("[auth.jwt] last_activity_at:", e),
              );
            }
          } else {
            // A query foi bem-sucedida mas não há usuário com esse id: a conta
            // foi removida ou a sessão foi emitida contra outra base. Invalida a
            // sessão para forçar novo login, em vez de manter um id órfão que
            // derruba qualquer query com foreign key para users. (Difere do
            // catch acima: lá é falha transitória de banco, aqui é ausência
            // confirmada do registro.)
            return null as any;
          }
        } catch (err) {
          // Falha transitória do banco: mantém o token anterior em vez de
          // derrubar todas as sessões. Logado para não silenciar de vez ,
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
