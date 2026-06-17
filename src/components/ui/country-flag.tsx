import { Globe } from "lucide-react";
import {
  AR,
  AU,
  BO,
  BR,
  CA,
  CL,
  CN,
  CO,
  DE,
  ES,
  FR,
  GB,
  IT,
  JP,
  MX,
  PE,
  PT,
  PY,
  US,
  UY,
} from "country-flag-icons/react/3x2";
import { cn } from "@/lib/utils";

/** Assinatura dos componentes de bandeira da biblioteca (derivada do próprio). */
type FlagComponent = typeof BR;

/**
 * Mapa ISO 3166-1 alpha-2 -> componente de bandeira SVG (3x2).
 *
 * Só os países da lista curada (`COUNTRIES`) são importados nominalmente, para
 * o bundler fazer tree-shaking e não embutir as ~250 bandeiras da biblioteca.
 * Usamos SVG (não emoji) porque emoji de bandeira não renderiza no Windows.
 */
const FLAGS: Record<string, FlagComponent> = {
  BR,
  PT,
  US,
  AR,
  PY,
  UY,
  CL,
  BO,
  PE,
  CO,
  MX,
  ES,
  GB,
  FR,
  DE,
  IT,
  CA,
  CN,
  JP,
  AU,
};

interface CountryFlagProps {
  /** ISO 3166-1 alpha-2, ex.: "BR". */
  iso: string;
  /** Nome acessível da bandeira (entra como <title>). */
  title?: string;
  className?: string;
}

/**
 * Bandeira de país em SVG, cantos arredondados e um anel sutil para as
 * bandeiras claras não sumirem no fundo escuro. ISO desconhecido cai num
 * ícone de globo, mantendo o alinhamento do layout.
 */
export function CountryFlag({ iso, title, className }: CountryFlagProps) {
  const Flag = FLAGS[iso.toUpperCase()];
  const base = cn(
    "h-3.5 w-5 shrink-0 rounded-[3px] ring-1 ring-inset ring-white/15",
    className,
  );

  if (!Flag) {
    return (
      <Globe
        className={cn("text-muted-foreground", base)}
        aria-hidden={title ? undefined : true}
        aria-label={title}
      />
    );
  }

  return <Flag title={title ?? iso} className={cn("object-cover", base)} />;
}
