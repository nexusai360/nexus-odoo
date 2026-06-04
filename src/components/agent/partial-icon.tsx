/**
 * B2. Ícone "Parcial" validado no teste visual (feedback-v4.html): círculo com
 * a metade direita PREENCHIDA (não o `Contrast` vazado do lucide). Resgatado
 * do mockup aprovado para o voto/avaliação ficar idêntico ao que foi testado.
 * Aceita `className` (h-/w-/cor via currentColor), igual aos ícones lucide.
 */
export function PartialIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}
