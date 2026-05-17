"use client";

import { Label } from "@/components/ui/label";

interface PeriodFilterProps {
  de: string;
  ate: string;
  onChange: (range: { de: string; ate: string }) => void;
}

/** Filtro de período: dois campos de mês (input type=month). */
export function PeriodFilter({ de, ate, onChange }: PeriodFilterProps) {
  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label htmlFor="periodo-de">De</Label>
        <input
          id="periodo-de"
          type="month"
          value={de}
          onChange={(e) => onChange({ de: e.target.value, ate })}
          className="h-9 rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="periodo-ate">Até</Label>
        <input
          id="periodo-ate"
          type="month"
          value={ate}
          onChange={(e) => onChange({ de, ate: e.target.value })}
          className="h-9 rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
        />
      </div>
    </div>
  );
}
