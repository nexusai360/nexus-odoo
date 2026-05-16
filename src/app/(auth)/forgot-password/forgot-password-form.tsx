'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '@/lib/actions/password-reset';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestPasswordReset(email);
      if (result.success) {
        setSent(true);
      } else {
        setError(result.error || 'Erro ao processar solicitação');
      }
    });
  }

  if (sent) {
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
          Verifique seu e-mail
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-2">
          Se o e-mail <strong className="text-foreground">{email}</strong> estiver
          cadastrado, você receberá um link para redefinir sua senha.
        </p>
        <p className="text-xs text-muted-foreground mb-8">
          O link expira em 1 hora. Verifique também a pasta de spam.
        </p>

        <Link href="/login">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground cursor-pointer transition-all duration-200"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao login
          </Button>
        </Link>
      </motion.div>
    );
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
            <Mail className="h-7 w-7 text-violet-400" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">
          Esqueci minha senha
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Informe seu e-mail para receber o link de redefinição
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

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
            E-mail
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            required
            autoComplete="email"
            autoFocus
            disabled={isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-xl border-border bg-card/80 text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-all duration-200"
          />
        </div>

        <Button
          type="submit"
          disabled={isPending || !email}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-sm transition-all duration-300 hover:from-violet-500 hover:to-purple-500 hover:shadow-[0_0_24px_rgba(124,58,237,0.4)] disabled:opacity-50 cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-4 w-4" />
              Enviar link de redefinição
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
