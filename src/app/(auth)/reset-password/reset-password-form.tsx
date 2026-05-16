'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  KeyRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword } from '@/lib/actions/password-reset';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Token inválido
  if (!token) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' as const }}
        className="w-full max-w-[420px] mx-auto text-center"
      >
        <div className="flex items-center justify-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
          Link inválido
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          O link de redefinição de senha é inválido ou está incompleto.
        </p>
        <Link href="/forgot-password">
          <Button className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-sm rounded-xl h-11 px-6 cursor-pointer transition-all duration-300 hover:from-violet-500 hover:to-purple-500 hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]">
            Solicitar novo link
          </Button>
        </Link>
      </motion.div>
    );
  }

  // Sucesso
  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' as const }}
        className="w-full max-w-[420px] mx-auto text-center"
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-10 flex items-center justify-center gap-2.5 lg:hidden"
        >
          <Image src="/logo.png" alt="Nexus Odoo" width={40} height={40} className="rounded-xl" />
          <span className="text-lg font-bold text-foreground tracking-tight">Nexus Odoo</span>
        </motion.div>

        <div className="flex items-center justify-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
          Senha redefinida
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Sua senha foi alterada com sucesso. Você já pode fazer login.
        </p>
        <Link href="/login">
          <Button className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-sm rounded-xl h-11 px-6 cursor-pointer transition-all duration-300 hover:from-violet-500 hover:to-purple-500 hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]">
            <ArrowRight className="mr-2 h-4 w-4" />
            Ir para o login
          </Button>
        </Link>
      </motion.div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres');
      return;
    }

    startTransition(async () => {
      const result = await resetPassword({ token: token!, password, confirmPassword });
      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error || 'Erro ao redefinir senha');
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' as const }}
      className="w-full max-w-[420px] mx-auto"
    >
      {/* Logo mobile */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-10 flex items-center justify-center gap-2.5 lg:hidden"
      >
        <Image src="/logo.png" alt="Nexus Odoo" width={40} height={40} className="rounded-xl" />
        <span className="text-lg font-bold text-foreground tracking-tight">Nexus Odoo</span>
      </motion.div>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <KeyRound className="h-7 w-7 text-violet-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">
          Redefinir senha
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Escolha uma nova senha para sua conta
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 rounded-xl border border-red-900/50 bg-red-950/30 p-3.5 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Nova senha */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-foreground/80">
            Nova senha
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="********"
              required
              autoComplete="new-password"
              autoFocus
              disabled={isPending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl border-border bg-card/80 pr-11 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors duration-200 hover:text-foreground cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirmar senha */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium text-foreground/80">
            Confirmar senha
          </Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="********"
            required
            autoComplete="new-password"
            disabled={isPending}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-12 rounded-xl border-border bg-card/80 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending || !password || !confirmPassword}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-sm transition-all duration-300 hover:from-violet-500 hover:to-purple-500 hover:shadow-[0_0_24px_rgba(124,58,237,0.4)] disabled:opacity-50 cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redefinindo...
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-4 w-4" />
              Redefinir senha
            </>
          )}
        </Button>

        <div className="text-center">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors duration-200 hover:text-violet-400"
          >
            <ArrowLeft className="mr-1 h-3 w-3 inline" />
            Voltar ao login
          </Link>
        </div>
      </form>
    </motion.div>
  );
}
