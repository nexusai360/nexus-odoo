"use client";

import { MessageCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountryFlag } from "@/components/ui/country-flag";
import { WhatsappNumbersField } from "@/components/users/whatsapp-numbers-field";
import {
  findCountryByE164,
  formatE164ForDisplay,
} from "@/lib/whatsapp/countries";

interface WhatsappCardProps {
  /** Números de WhatsApp do usuário, em formato E.164. */
  numbers: string[];
  /** True quando o usuário pode editar os próprios números (admin/super_admin). */
  canEdit?: boolean;
  /** ID do próprio usuário (necessário para o modo edição). */
  userId?: string;
}

/**
 * Seção "WhatsApp" da tela de Perfil.
 *
 * Modo edição (canEdit=true): usa o WhatsappNumbersField , adicionar no topo,
 * lista com editar/remover embaixo.
 * Modo leitura (canEdit=false): mostra os números como linhas, sem ações.
 */
export function WhatsappCard({ numbers, canEdit, userId }: WhatsappCardProps) {
  return (
    <Card className="gap-2 rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <MessageCircle
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Números pelos quais você é reconhecido ao falar com o Agente Nex.
        </p>

        {canEdit && userId ? (
          <WhatsappNumbersField userId={userId} />
        ) : numbers.length > 0 ? (
          <ul
            className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-muted/20"
            aria-label="Números de WhatsApp"
          >
            {numbers.map((n) => {
              const country = findCountryByE164(n);
              return (
                <li key={n} className="flex items-center gap-2 px-2.5 py-1.5">
                  <CountryFlag
                    iso={country?.iso ?? ""}
                    title={country?.name}
                    className="h-3 w-[18px]"
                  />
                  <span className="text-sm tabular-nums text-foreground">
                    {formatE164ForDisplay(n)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sem números cadastrados.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
