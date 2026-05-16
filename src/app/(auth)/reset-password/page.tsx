import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';

export const metadata = {
  title: 'Redefinir senha | Nexus Odoo',
};

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background gradiente roxo (tela inteira) */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-950 via-[#0a0a0f] to-purple-950" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-violet-500/8 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Conteudo centralizado */}
      <div className="relative z-10 w-full max-w-md px-6">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-auto pb-6">
        <p className="text-xs text-zinc-600">
          Nexus AI &copy; {new Date().getFullYear()}. Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
