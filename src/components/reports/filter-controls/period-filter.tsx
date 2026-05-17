"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface PeriodFilterProps {
  de: string;
  ate: string;
  onChange: (range: { de: string; ate: string }) => void;
}

/** Filtro de período: dois campos de mês; empilham no mobile. */
export function PeriodFilter({ de, ate, onChange }: PeriodFilterProps) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="periodo-de">De</Label>
        <Input
          id="periodo-de"
          type="month"
          value={de}
          onChange={(e) => onChange({ de: e.target.value, ate })}
          className="max-w-xs"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="periodo-ate">Até</Label>
        <Input
          id="periodo-ate"
          type="month"
          value={ate}
          onChange={(e) => onChange({ de, ate: e.target.value })}
          className="max-w-xs"
        />
      </div>
    </div>
  );
}
