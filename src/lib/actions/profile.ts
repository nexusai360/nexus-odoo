'use server';

export async function confirmEmailChange(
  _token: string
): Promise<{ success?: boolean; error?: string }> {
  // TODO: implementar confirmação de troca de email — fase futura
  return { error: 'Funcionalidade não implementada' };
}
