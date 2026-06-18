'use server';

import { cookies } from 'next/headers';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { prisma } from '@/lib/prisma';
import {
  THEME_COOKIE,
  THEME_PREF_COOKIE,
  THEME_COOKIE_MAX_AGE,
} from '@/lib/theme';

export async function loginAction(
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  try {
    const email = formData.get('email') as string;

    // Verificar se o usuário está inativo antes de tentar login
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { isActive: true, theme: true },
    });
    if (existingUser && !existingUser.isActive) {
      return { error: 'Sua conta está inativa. Entre em contato com o administrador.' };
    }

    // Sincroniza cookies de tema a partir do DB para que o SSR renderize
    // com o tema correto já no primeiro byte pós-login (evita flash).
    if (existingUser) {
      const pref = existingUser.theme ?? 'dark';
      const resolved = pref === 'light' ? 'light' : 'dark'; // "system" resolvido no client
      const cookieStore = await cookies();
      cookieStore.set(THEME_PREF_COOKIE, pref, {
        path: '/',
        maxAge: THEME_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
      cookieStore.set(THEME_COOKIE, resolved, {
        path: '/',
        maxAge: THEME_COOKIE_MAX_AGE,
        sameSite: 'lax',
      });
    }

    // IMPORTANTE: `redirect: false`. O `signIn` autentica e SETA o cookie de
    // sessão, mas NÃO dispara o redirect interno (`NEXT_REDIRECT`). Sob `await`
    // no client, esse throw vazava para o error boundary global ("Algo deu
    // errado") e o login não acontecia. Quem navega é o client (full reload),
    // garantindo que o middleware veja o cookie novo e roteie quem precisa
    // trocar a senha para /perfil/trocar-senha.
    await signIn('credentials', {
      email,
      password: formData.get('password') as string,
      redirect: false,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'E-mail ou senha incorretos.' };
        case 'CallbackRouteError': {
          // Rate limit error vem como cause
          const message = (
            error as { cause?: { err?: { message?: string } } }
          )?.cause?.err?.message;
          if (message?.includes('Muitas tentativas')) {
            return { error: message };
          }
          return { error: 'E-mail ou senha incorretos.' };
        }
        default:
          return { error: 'Erro ao fazer login. Tente novamente.' };
      }
    }
    console.error('[loginAction] erro inesperado:', error);
    return { error: 'Erro ao fazer login. Tente novamente.' };
  }
}
