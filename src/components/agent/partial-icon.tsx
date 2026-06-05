import type { CSSProperties } from "react";

/**
 * B2. Ícone "Parcial" validado no teste visual (feedback-v4.html): círculo com
 * a metade direita PREENCHIDA (não o `Contrast` vazado do lucide). Resgatado
 * do mockup aprovado para o voto/avaliação ficar idêntico ao que foi testado.
 * Aceita `className` E `style` (cor via currentColor), igual aos ícones lucide ,
 * sem o `style` a cor passada inline (ex.: `color` no drill-down) era ignorada.
 */
export function PartialIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
