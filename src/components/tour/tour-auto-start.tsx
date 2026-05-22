"use client";

import { useEffect, useRef } from "react";
import { useTour, type TourConfig } from "@/components/tour/tour-provider";
import { hasSeenTour, markTourSeen } from "@/lib/actions/user-tour";

/**
 * Abre um tour automaticamente na primeira visita do usuário àquela tela.
 * Depois disso nunca mais abre sozinho (a marca fica no banco, por usuário).
 * O usuário sempre pode reabrir pelo botão de interrogação.
 */
export function TourAutoStart({ tour }: { tour: TourConfig }) {
  const { start } = useTour();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const seen = await hasSeenTour(tour.id);
      if (seen) return;
      await markTourSeen(tour.id);
      // Pequeno atraso para a tela montar antes de o overlay medir posições.
      timer = setTimeout(() => start(tour), 700);
    })();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [tour, start]);

  return null;
}
