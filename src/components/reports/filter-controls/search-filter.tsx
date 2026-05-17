"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface SearchFilterProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Filtro de busca textual livre. Mantém o texto local e só propaga o
 * `onChange` (que atualiza a URL) após 300ms de inatividade — evita um
 * `router.push` por tecla digitada.
 */
export function SearchFilter({ value, onChange }: SearchFilterProps) {
  const [text, setText] = useState(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sincroniza quando o valor da URL muda por fora (ex.: navegação/voltar).
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (text === value) return;
    const id = setTimeout(() => onChangeRef.current(text), 300);
    return () => clearTimeout(id);
  }, [text, value]);

  return (
    <Input
      placeholder="Pesquisar…"
      value={text}
      onChange={(e) => setText(e.target.value)}
      className="max-w-xs"
    />
  );
}
