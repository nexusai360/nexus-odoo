"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour, type TourConfig } from "./tour-provider";

interface Props {
  config: TourConfig;
  label?: string;
}

/**
 * Botão "?" compacto que dispara um tour. Use perto do título da tela
 * (PageHeader, DialogHeader) ou na linha de TabsList.
 *
 * Padrão visual: ghost icon button h-8 w-8, hover violet-500.
 *
 * Convive com `<TourButton>` (h-11 w-11, padrão antigo dos relatórios) —
 * use este aqui quando quiser um affordance discreto que não compete
 * visualmente com o título; use o outro quando o "?" for a única ação
 * dessa região e precisa de touch target HIG-compliant (44pt).
 */
export function TourTriggerButton({ config, label = "Tour da tela" }: Props) {
  const { start } = useTour();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 cursor-pointer text-muted-foreground hover:text-violet-500"
      aria-label={label}
      title={label}
      onClick={() => start(config)}
    >
      <HelpCircle className="h-[18px] w-[18px]" aria-hidden />
    </Button>
  );
}
