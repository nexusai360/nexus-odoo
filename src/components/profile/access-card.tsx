"use client";

import {
  Boxes,
  Wallet,
  ReceiptText,
  Handshake,
  Contact,
  Calculator,
  Users,
  HeartHandshake,
  Factory,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AccessCardProps {
  /** Domínios concedidos ao usuário. Somente leitura. */
  domains: string[];
}

/** Rótulo e ícone por domínio de negócio (pt-BR). */
const DOMAIN_META: Record<string, { label: string; icon: LucideIcon }> = {
  estoque: { label: "Estoque", icon: Boxes },
  financeiro: { label: "Financeiro", icon: Wallet },
  fiscal: { label: "Fiscal", icon: ReceiptText },
  comercial: { label: "Comercial", icon: Handshake },
  cadastros: { label: "Cadastros", icon: Contact },
  contabil: { label: "Contábil", icon: Calculator },
  rh: { label: "RH", icon: Users },
  crm: { label: "CRM", icon: HeartHandshake },
  producao: { label: "Produção", icon: Factory },
};

/**
 * Seção "Acessos" da tela de Perfil.
 *
 * Lista somente os domínios que o usuário tem acesso (somente leitura). Não
 * mostra domínios sem acesso. Super_admin/admin recebem todos os domínios.
 */
export function AccessCard({ domains }: AccessCardProps) {
  const granted = domains.filter((d) => d in DOMAIN_META);

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <ShieldCheck
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          Acessos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Domínios de negócio que você pode consultar na plataforma.
        </p>

        {granted.length > 0 ? (
          <ul
            className="flex flex-wrap gap-2"
            aria-label="Domínios com acesso"
          >
            {granted.map((d) => {
              const meta = DOMAIN_META[d];
              const Icon = meta.icon;
              return (
                <li
                  key={d}
                  className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm text-violet-700 dark:text-violet-300"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{meta.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            Nenhum domínio liberado — fale com um administrador para receber
            acesso.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
