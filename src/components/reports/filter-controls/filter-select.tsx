"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Select de filtro alinhado ao design system da F1: usa o `Select` base-ui
 * com `border-input` e anel de foco visível, em vez de `<select>` cru.
 */
export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  placeholder,
}: FilterSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={options}
        value={value}
        onValueChange={(v) => onChange(String(v ?? ""))}
      >
        <SelectTrigger id={id} className="w-full max-w-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
