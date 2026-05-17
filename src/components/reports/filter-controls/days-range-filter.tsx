"use client";

interface DaysRangeFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/** Filtro de faixa de dias parado: +30 / +60 / +90 dias. */
export function DaysRangeFilter({ value, onChange }: DaysRangeFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
    >
      <option value="30">+30 dias</option>
      <option value="60">+60 dias</option>
      <option value="90">+90 dias</option>
    </select>
  );
}
