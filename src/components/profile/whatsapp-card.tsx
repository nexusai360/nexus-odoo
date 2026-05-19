"use client";

import { MessageCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WhatsappCardProps {
  /** Números de WhatsApp do usuário, em formato E.164. Somente leitura. */
  numbers: string[];
}

/**
 * Seção "WhatsApp" da tela de Perfil.
 *
 * Somente leitura — o usuário não edita os próprios números; isso cabe a quem
 * tem acesso de administração. Estado vazio quando não há números.
 */
export function WhatsappCard({ numbers }: WhatsappCardProps) {
  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-foreground">
          <MessageCircle
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          WhatsApp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Números de WhatsApp pelos quais você é reconhecido ao falar com o
          agente de IA.
        </p>

        {numbers.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Números de WhatsApp">
            {numbers.map((n) => (
              <li
                key={n}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm"
              >
                <MessageCircle
                  className="h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="font-mono text-foreground">{n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
            Nenhum número cadastrado — fale com um administrador para vincular
            o seu WhatsApp.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
