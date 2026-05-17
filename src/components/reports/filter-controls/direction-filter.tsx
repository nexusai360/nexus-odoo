"use client";

interface DirectionFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/** Filtro de sentido do movimento. */
export function DirectionFilter({ value, onChange }: DirectionFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-xs rounded-md bg-card px-3 text-sm ring-1 ring-foreground/10"
    >
      <option value="">Todos os sentidos</option>
      <option value="entrada">Entradas</option>
      <option value="saida">Saídas</option>
    </select>
  );
}
