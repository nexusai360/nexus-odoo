"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "nexus:tour:";

/**
 * Persiste o estado do tour (concluído/pulado) em localStorage.
 *
 * @param tourId - identificador único do tour (ex.: "relatorio-global" ou o id do relatório)
 * @param autoStart - inicia automaticamente se ainda não foi completado/pulado. Padrão: true.
 */
export function useTourState(tourId: string, autoStart = true) {
  const storageKey = `${STORAGE_PREFIX}${tourId}`;

  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Lê o localStorage apenas no cliente (evita hidration mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const isDone = stored === "completed" || stored === "skipped";
    setDismissed(isDone);
    if (autoStart && !isDone) {
      setActive(true);
    }
  }, [storageKey, autoStart]);

  const handleClose = useCallback(
    (completed: boolean) => {
      const value = completed ? "completed" : "skipped";
      localStorage.setItem(storageKey, value);
      setDismissed(true);
      setActive(false);
    },
    [storageKey],
  );

  const openTour = useCallback(() => {
    setActive(true);
  }, []);

  return {
    /** Tour ativo (visível na tela). */
    active,
    /** Tour já foi visto (concluído ou pulado). */
    dismissed,
    /** Encerra o tour e persiste o estado. */
    onClose: handleClose,
    /** Reabre o tour manualmente. */
    openTour,
  };
}
