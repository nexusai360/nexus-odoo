"use client";

import Link from "next/link";
import { BarChart3, ChevronRight, Cpu, Key, MessageSquare, Webhook } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface IntegrationCard {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
}

const CARDS: IntegrationCard[] = [
  {
    label: "Canais",
    description: "Configure o canal WhatsApp e as credenciais da Meta Graph API",
    icon: MessageSquare,
    href: "/integracoes/canais",
  },
  {
    label: "MCP",
    description: "Endpoint do servidor MCP semântico e token de serviço para conexões externas",
    icon: Cpu,
    href: "/integracoes/mcp",
  },
  {
    label: "Webhooks",
    description: "Gerencie endpoints de entrada e saída para integração com n8n e outros sistemas",
    icon: Webhook,
    href: "/integracoes/webhooks",
  },
  {
    label: "API",
    description: "Crie e revogue API keys para acesso programático à plataforma",
    icon: Key,
    href: "/integracoes/api",
  },
  {
    label: "BI",
    description: "Conecte ferramentas de Business Intelligence externas (em breve)",
    icon: BarChart3,
    href: "/integracoes/bi",
    badge: "Em breve",
  },
];

export function IntegracoesGrid() {
  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
      {CARDS.map((card) => (
        <IntegrationCardLink key={card.href} card={card} />
      ))}
    </div>
  );
}

function IntegrationCardLink({ card }: { card: IntegrationCard }) {
  const Icon = card.icon;

  return (
    <Link href={card.href} className="group block focus-visible:outline-none">
      <Card
        className={cn(
          "cursor-pointer transition-shadow duration-200 hover:shadow-md",
          "focus-within:ring-2 focus-within:ring-violet-400/60",
        )}
      >
        <CardContent className="p-6 flex flex-col gap-3">
          {/* Ícone */}
          <div className="flex items-start justify-between">
            <span className="p-1.5 rounded-lg bg-violet-500/10">
              <Icon className="h-8 w-8 text-violet-500" />
            </span>
            {card.badge && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                {card.badge}
              </span>
            )}
          </div>

          {/* Conteúdo */}
          <div className="flex-1">
            <p className="text-base font-semibold">{card.label}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{card.description}</p>
          </div>

          {/* Chevron */}
          <div className="flex justify-end">
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
