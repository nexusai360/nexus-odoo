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
  formData: FormData,
  callbackUrl: string
): Promise<{ error: string } | undefined> {
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

    await signIn('credentials', {
      email,
      password: formData.get('password') as string,
      redirectTo: callbackUrl,
    });
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
    throw error; // NextAuth redirect throws (não é erro real)
  }
}
