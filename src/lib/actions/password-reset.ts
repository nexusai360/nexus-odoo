'use server';

export async function requestPasswordReset(
  _email: string
): Promise<{ success?: boolean; error?: string }> {
  // TODO: implementar envio de email , fase F2/F3
  return { success: true };
}

export async function verifyResetToken(
  _token: string
): Promise<{ valid: boolean; error?: string }> {
  return { valid: false, error: 'Funcionalidade não implementada' };
}

export async function resetPassword({
  token: _token,
  password: _password,
  confirmPassword: _confirmPassword,
}: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<{ success?: boolean; error?: string }> {
  // TODO: implementar redefinição de senha , fase F2/F3
  return { error: 'Funcionalidade não implementada' };
}
