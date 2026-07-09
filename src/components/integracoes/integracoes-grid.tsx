"use client";

import Link from "next/link";
import { BarChart3, ChevronRight, Cpu, Key, MessageSquare, Webhook } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface IntegrationCard {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  /** Quando true, o card é informativo e não-clicável (ex.: "Em breve"). */
  disabled?: boolean;
  badge?: string;
}

const CARDS: IntegrationCard[] = [
  {
    label: "Canais",
    description: "Canal WhatsApp e credenciais da Meta Graph API.",
    icon: MessageSquare,
    href: "/integracoes/canais",
  },
  {
    label: "Servidor MCP",
    description: "Painel do MCP semântico: status, chaves de acesso e métricas.",
    icon: Cpu,
    href: "/integracoes/servidor-mcp",
  },
  {
    label: "Webhooks",
    description: "Endpoints de entrada e saída para integração com o n8n.",
    icon: Webhook,
    href: "/integracoes/webhooks",
  },
  {
    label: "API REST",
    description: "Crie e revogue chaves de API da plataforma.",
    icon: Key,
    href: "/integracoes/api",
    disabled: true,
    badge: "Em breve",
  },
  {
    label: "BI",
    description: "Conecte ferramentas de Business Intelligence externas.",
    icon: BarChart3,
    href: "/integracoes/bi",
    disabled: true,
    badge: "Em breve",
  },
];

export function IntegracoesGrid() {
  return (
    // `auto-rows-fr` dá a MESMA altura a todas as linhas do grid, então um card de
    // uma linha de descrição (Canais) fica do tamanho do maior (Servidor MCP, que
    // usa duas). A descrição é limitada a duas linhas (`line-clamp-2`), o que
    // trava a altura máxima: nenhum card cresce além disso.
    <div className="mt-6 grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map((card) => (
        <IntegrationCardItem key={card.href} card={card} />
      ))}
    </div>
  );
}

function CardInner({ card }: { card: IntegrationCard }) {
  const Icon = card.icon;
  return (
    <CardContent className="flex h-full items-center gap-3 p-4">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          card.disabled ? "bg-muted" : "bg-violet-500/10",
        )}
      >
        <Icon
          className={cn(
            "h-5 w-5",
            card.disabled ? "text-muted-foreground" : "text-violet-500",
          )}
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{card.label}</p>
          {card.badge && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {card.badge}
            </Badge>
          )}
        </div>
        {/* Duas linhas de descrição, sempre: `line-clamp-2` impede passar disso e
            `min-h-8` reserva o espaço das duas mesmo quando o texto ocupa uma só.
            Sem o `min-h`, numa tela larga todas as descrições caberiam em uma
            linha e os cards encolheriam, mudando o tamanho padrão. */}
        <p className="mt-0.5 line-clamp-2 min-h-8 text-xs text-muted-foreground">
          {card.description}
        </p>
      </div>

      {!card.disabled && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
      )}
    </CardContent>
  );
}

function IntegrationCardItem({ card }: { card: IntegrationCard }) {
  // Card "Em breve": informativo, não-clicável, visual atenuado.
  if (card.disabled) {
    return (
      <Card
        aria-disabled="true"
        className="pointer-events-none h-full opacity-60"
      >
        <CardInner card={card} />
      </Card>
    );
  }

  return (
    <Link href={card.href} className="group block h-full focus-visible:outline-none">
      <Card
        className={cn(
          "h-full cursor-pointer transition-shadow duration-200 hover:shadow-md",
          "focus-within:ring-2 focus-within:ring-violet-400/60",
        )}
      >
        <CardInner card={card} />
      </Card>
    </Link>
  );
}
