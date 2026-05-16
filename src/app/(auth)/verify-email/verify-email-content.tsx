"use client";

import { useState, useEffect, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmEmailChange } from "@/lib/actions/profile";

export function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Link inválido ou incompleto");
      return;
    }

    startTransition(async () => {
      const result = await confirmEmailChange(token);
      if (result.success) {
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(result.error || "Erro ao confirmar e-mail");
      }
    });
  }, [token]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" as const }}
      className="w-full max-w-[420px] mx-auto text-center"
    >
      {/* Logo mobile */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-10 flex items-center justify-center gap-2.5 lg:hidden"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 shadow-[0_0_24px_rgba(124,58,237,0.4)]">
          <Database className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-foreground tracking-tight">
          Nexus Odoo
        </span>
      </motion.div>

      {status === "loading" && (
        <>
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 border border-violet-500/20">
              <Loader2 className="h-7 w-7 text-violet-400 animate-spin" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
            Verificando...
          </h2>
          <p className="text-sm text-muted-foreground">
            Confirmando seu novo e-mail, aguarde um momento.
          </p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-7 w-7 text-emerald-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
            E-mail confirmado
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Seu e-mail foi alterado com sucesso. Faça login novamente com o novo
            endereço.
          </p>
          <Link href="/login">
            <Button className="bg-gradient-to-r from-violet-600 to-violet-500 text-white font-semibold text-sm rounded-xl h-11 px-6 cursor-pointer transition-all duration-300 hover:from-violet-500 hover:to-violet-400 hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]">
              <ArrowRight className="mr-2 h-4 w-4" />
              Ir para o login
            </Button>
          </Link>
        </>
      )}

      {status === "error" && (
        <>
          <div className="flex items-center justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <AlertCircle className="h-7 w-7 text-red-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-3">
            Erro na verificação
          </h2>
          <p className="text-sm text-muted-foreground mb-8">{errorMessage}</p>
          <Link href="/login">
            <Button className="bg-gradient-to-r from-violet-600 to-violet-500 text-white font-semibold text-sm rounded-xl h-11 px-6 cursor-pointer transition-all duration-300 hover:from-violet-500 hover:to-violet-400 hover:shadow-[0_0_24px_rgba(124,58,237,0.4)]">
              Voltar ao login
            </Button>
          </Link>
        </>
      )}
    </motion.div>
  );
}
